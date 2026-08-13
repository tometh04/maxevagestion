/**
 * Backfill del precio pactado por org (grandfathering).
 *
 * Contexto: `organizations.agreed_plan_price_ars` registra el monto que MP
 * efectivamente le debita a cada org. De acá en adelante lo escribe el webhook
 * de MP, pero las orgs que YA están suscriptas nunca pasaron por ese código —
 * si el precio de lista sube y ellas quedan con el snapshot en NULL, la app las
 * trata como si pagaran el precio nuevo (UI del cliente, MRR y, lo más caro, el
 * botón "Regularizar pago").
 *
 * Este script las backfillea preguntándole a MP cuánto les cobra realmente.
 *
 * IMPORTANTE: correr ANTES de subir el precio de lista en /admin/billing. El
 * script se niega a correr si el precio de lista ya cambió (ver la guarda de
 * abajo), justamente para que nadie congele el precio equivocado.
 *
 * Uso:
 *   # Preview (NO escribe): muestra qué precio se le asignaría a cada org
 *   npx tsx scripts/backfill-agreed-plan-price.ts
 *
 *   # Aplicar
 *   npx tsx scripts/backfill-agreed-plan-price.ts --apply
 *
 * Flags:
 *   --org <id>                 solo esa org
 *   --plan <PLAN>              plan a backfillear (default PRO)
 *   --expect-list-price <n>    precio de lista esperado (default 119000)
 *   --allow-list-fallback      permite usar el precio de lista cuando no se
 *                              pudo resolver el monto real desde MP ni desde
 *                              el historial de billing_events
 *   --apply                    escribe (sin esto es preview read-only)
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

import { fetchPreapproval } from "../lib/billing/mercadopago"

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const APPLY = process.argv.includes("--apply")
const ALLOW_LIST_FALLBACK = process.argv.includes("--allow-list-fallback")
const ORG = arg("org")
const PLAN = (arg("plan") ?? "PRO").toUpperCase()
const EXPECTED_LIST_PRICE = Number(arg("expect-list-price") ?? "119000")

/** Estados que representan una suscripción viva con un monto vigente en MP. */
const TARGET_STATUSES = ["ACTIVE", "PAST_DUE", "TRIALING"]

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any

type Resolution = {
  orgId: string
  name: string
  status: string
  amount: number | null
  via: "mp" | "payment_event" | "checkout_event" | "list_price" | "unresolved"
}

function fmt(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("es-AR")
}

/**
 * Guarda anti-orden: si el precio de lista ya se cambió, cualquier fallback al
 * precio de lista congelaría el monto NUEVO en orgs que pagan el viejo. Abortar
 * es infinitamente más barato que revertir cobros.
 */
async function assertListPriceUnchanged(): Promise<number> {
  const { data } = await admin
    .from("plan_prices")
    .select("price_ars_monthly")
    .eq("plan_id", PLAN)
    .maybeSingle()

  const listNow = Number(data?.price_ars_monthly)
  if (!Number.isFinite(listNow)) {
    console.error(`ABORT: no pude leer plan_prices.${PLAN}.`)
    process.exit(1)
  }
  if (listNow !== EXPECTED_LIST_PRICE) {
    console.error(
      `ABORT: plan_prices.${PLAN} = ${fmt(listNow)}, esperaba ${fmt(EXPECTED_LIST_PRICE)}.\n` +
      `El backfill se corre ANTES de subir el precio de lista.\n` +
      `Si sabés lo que hacés: --expect-list-price ${listNow}`
    )
    process.exit(1)
  }
  return listNow
}

async function candidateOrgs(): Promise<any[]> {
  let q = admin
    .from("organizations")
    .select(
      "id, name, plan, subscription_status, mp_preapproval_id, " +
      "custom_plan_id, manual_mrr_override_ars, agreed_plan_price_ars"
    )
    .eq("plan", PLAN)
    .is("agreed_plan_price_ars", null) // idempotente: re-correr no pisa nada
    .in("subscription_status", TARGET_STATUSES)
  if (ORG) q = q.eq("id", ORG)

  const { data, error } = await q
  if (error) {
    console.error("ABORT: no pude leer organizations:", error.message)
    process.exit(1)
  }
  return data ?? []
}

/** Monto del último evento de billing que reporte un importe cobrado. */
async function amountFromBillingEvents(
  orgId: string,
  eventTypes: string[]
): Promise<number | null> {
  const { data } = await admin
    .from("billing_events")
    .select("amount_cents, payload, created_at")
    .eq("org_id", orgId)
    .in("event_type", eventTypes)
    .not("amount_cents", "is", null)
    .order("created_at", { ascending: false })
    .limit(5)

  for (const row of data ?? []) {
    // Para CHECKOUT_INITIATED exigimos que sea del mismo plan: un checkout de
    // otro plan traería un monto que no corresponde.
    if (eventTypes.includes("CHECKOUT_INITIATED")) {
      const payloadPlan = (row.payload as any)?.plan
      if (payloadPlan && payloadPlan !== PLAN) continue
    }
    const amount = Number(row.amount_cents) / 100
    if (Number.isFinite(amount) && amount > 0) return amount
  }
  return null
}

async function resolveAmount(org: any, listPrice: number): Promise<Resolution> {
  const base = { orgId: org.id, name: org.name ?? "—", status: org.subscription_status }

  // 1. MP es la fuente de verdad: es literalmente lo que va a debitar.
  if (org.mp_preapproval_id) {
    try {
      const pa: any = await fetchPreapproval(org.mp_preapproval_id)
      const amount = Number(pa?.auto_recurring?.transaction_amount)
      if (Number.isFinite(amount) && amount > 0 && ["authorized", "pending"].includes(pa?.status)) {
        return { ...base, amount, via: "mp" }
      }
    } catch (err: any) {
      console.warn(`  [${org.id}] fetchPreapproval falló: ${err?.message ?? err}`)
    }
  }

  // 2. Último cobro conocido (el webhook loguea el transaction_amount de MP).
  const paid = await amountFromBillingEvents(org.id, ["PAYMENT_APPROVED", "SUBSCRIPTION_AUTHORIZED"])
  if (paid !== null) return { ...base, amount: paid, via: "payment_event" }

  // 3. Último checkout del mismo plan.
  const checkout = await amountFromBillingEvents(org.id, ["CHECKOUT_INITIATED"])
  if (checkout !== null) return { ...base, amount: checkout, via: "checkout_event" }

  // 4. Precio de lista actual — solo si lo pidieron explícitamente. La guarda de
  //    arriba ya garantiza que el precio de lista sigue siendo el viejo.
  if (ALLOW_LIST_FALLBACK) return { ...base, amount: listPrice, via: "list_price" }

  return { ...base, amount: null, via: "unresolved" }
}

async function main() {
  const listPrice = await assertListPriceUnchanged()
  console.log(
    `Backfill precio pactado — plan ${PLAN}, precio de lista actual ${fmt(listPrice)} ARS ` +
    `(${APPLY ? "APPLY" : "DRY-RUN"})\n`
  )

  const orgs = await candidateOrgs()

  // Las que tienen custom plan u override manual quedan fuera: esas fuentes ya
  // le ganan al snapshot en la precedencia de precio.
  const excluded = orgs.filter((o) => o.custom_plan_id || o.manual_mrr_override_ars != null)
  const targets = orgs.filter((o) => !o.custom_plan_id && o.manual_mrr_override_ars == null)

  if (excluded.length) {
    console.log(`Excluidas (${excluded.length}) por custom plan u override manual — revisalas a mano:`)
    for (const o of excluded) {
      const reason = o.custom_plan_id ? "custom_plan" : "manual_mrr_override_ars"
      console.log(`  - ${o.id}  ${o.name ?? "—"}  (${reason})`)
    }
    console.log("")
  }

  if (!targets.length) {
    console.log("No hay orgs para backfillear. Nada que hacer.")
    return
  }

  const resolutions: Resolution[] = []
  for (const org of targets) {
    resolutions.push(await resolveAmount(org, listPrice))
  }

  console.log(`Orgs a backfillear (${resolutions.length}):`)
  console.log("  ORG_ID                                NOMBRE                STATUS     FUENTE          MONTO      =LISTA")
  for (const r of resolutions) {
    const matchesList = r.amount === null ? "—" : r.amount === listPrice ? "sí" : "NO"
    console.log(
      `  ${r.orgId}  ${(r.name ?? "—").padEnd(20).slice(0, 20)}  ` +
      `${r.status.padEnd(9)}  ${r.via.padEnd(14)}  ${fmt(r.amount).padStart(9)}  ${matchesList}`
    )
  }
  console.log("")

  const unresolved = resolutions.filter((r) => r.amount === null)
  const viaList = resolutions.filter((r) => r.via === "list_price")
  const differsFromList = resolutions.filter((r) => r.amount !== null && r.amount !== listPrice)

  if (unresolved.length) {
    console.log(`⚠️  ${unresolved.length} org(s) SIN monto resuelto — no se van a tocar.`)
    console.log(`    Van a cobrar el precio de lista si regularizan. Revisalas a mano`)
    console.log(`    o volvé a correr con --allow-list-fallback.`)
  }
  if (viaList.length) {
    console.log(`⚠️  ${viaList.length} org(s) resueltas por el fallback al precio de lista — miralas.`)
  }
  if (differsFromList.length) {
    console.log(`ℹ️  ${differsFromList.length} org(s) con un monto distinto del precio de lista actual.`)
  }

  if (!APPLY) {
    console.log("\nDRY-RUN: no se escribió nada. Volvé a correr con --apply.")
    return
  }

  let applied = 0
  for (const r of resolutions) {
    if (r.amount === null) continue

    const { error } = await admin
      .from("organizations")
      .update({
        agreed_plan_price_ars: r.amount,
        agreed_plan_id: PLAN,
        agreed_plan_price_source: "backfill",
      })
      .eq("id", r.orgId)
      // CAS: no pisar si otro flujo (webhook) ya lo escribió mientras corríamos.
      .is("agreed_plan_price_ars", null)

    if (error) {
      console.error(`  ✗ ${r.orgId}: ${error.message}`)
      continue
    }

    // Auditoría: que quede rastro de quién y con qué criterio congeló el precio.
    await admin.from("billing_events").insert({
      org_id: r.orgId,
      event_type: "MANUAL_ADMIN_ADJUSTMENT",
      external_id: null,
      amount_cents: Math.round(r.amount * 100),
      currency: "ARS",
      status: "processed",
      payload: {
        action: "agreed_price_backfill",
        plan: PLAN,
        amount_ars: r.amount,
        resolved_via: r.via,
        list_price_at_backfill: listPrice,
        source: "scripts/backfill-agreed-plan-price.ts",
      },
    })

    applied += 1
    console.log(`  ✓ ${r.orgId}  ${fmt(r.amount)} ARS  (${r.via})`)
  }

  console.log(`\nListo: ${applied} org(s) actualizadas, ${unresolved.length} sin resolver.`)
}

main().catch((err) => {
  console.error("Error inesperado:", err)
  process.exit(1)
})
