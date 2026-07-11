/**
 * Recuperación de orgs que pagaron en MP pero nunca se linkearon
 * (mp_preapproval_id NULL → quedaron PENDING_PAYMENT).
 *
 * Corre LOCAL con service role + token de MP (lee .env.local). No necesita
 * deploy. Reusa la misma lógica que el cron billing-reconcile Fase 3 y el
 * endpoint admin mp-relink (lib/billing/relink-preapproval.ts).
 *
 * Uso:
 *   # Preview (NO escribe): barre orgs no linkeadas con checkout reciente
 *   npx tsx scripts/billing-recover-unlinked.ts
 *
 *   # Preview de una org puntual (el cliente que reclama)
 *   npx tsx scripts/billing-recover-unlinked.ts --org <ORG_ID>
 *   npx tsx scripts/billing-recover-unlinked.ts --org <ORG_ID> --email cliente@mail.com
 *
 *   # Aplicar de verdad (linkea + setea estado + audita)
 *   npx tsx scripts/billing-recover-unlinked.ts --apply
 *   npx tsx scripts/billing-recover-unlinked.ts --org <ORG_ID> --apply
 *
 * Flags:
 *   --org <id>      solo esa org
 *   --email <mail>  fuerza el payer_email a buscar en MP
 *   --days <n>      ventana de CHECKOUT_INITIATED reciente (default 7)
 *   --apply         escribe (sin esto es preview read-only)
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

import { searchPreapprovalsByPayerEmail } from "../lib/billing/mercadopago"
import { transitionFromMP, type MPPreapproval } from "../lib/billing/state-machine"
import { relinkPreapproval } from "../lib/billing/relink-preapproval"

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const APPLY = process.argv.includes("--apply")
const ORG = arg("org")
const EMAIL = arg("email")
const DAYS = Number(arg("days") ?? "7")

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any

async function candidateOrgIds(): Promise<string[]> {
  if (ORG) return [ORG]
  const cutoff = new Date(Date.now() - DAYS * 24 * 3600 * 1000).toISOString()
  const { data } = await admin
    .from("billing_events")
    .select("org_id, created_at")
    .eq("event_type", "CHECKOUT_INITIATED")
    .eq("status", "pending")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
  return Array.from(new Set((data ?? []).map((r: any) => r.org_id).filter(Boolean))) as string[]
}

async function previewOrg(orgId: string) {
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, billing_email, subscription_status, mp_preapproval_id")
    .eq("id", orgId)
    .maybeSingle()

  if (!org) return console.log(`  ✗ ${orgId}: org no existe`)
  if (org.mp_preapproval_id && !ORG) {
    return console.log(`  · ${org.name}: ya linkeada (${org.mp_preapproval_id}) — skip`)
  }

  const email = (EMAIL || org.billing_email || "").trim()
  console.log(`\n  ▸ ${org.name} [${org.id}]`)
  console.log(`    estado: ${org.subscription_status} · mp_preapproval_id: ${org.mp_preapproval_id ?? "NULL"} · email: ${email || "(sin billing_email)"}`)
  if (!email) return console.log(`    ⚠ sin email para buscar en MP`)

  let found: any[]
  try {
    found = await searchPreapprovalsByPayerEmail(email, 10)
  } catch (err: any) {
    return console.log(`    ✗ error buscando en MP: ${err?.message || err}`)
  }
  if (!found.length) return console.log(`    ✗ MP no tiene preapprovals para ${email}`)

  for (const p of found) {
    let transitionTo = "?"
    try {
      transitionTo = transitionFromMP(p as MPPreapproval, undefined, {}).subscription_status
    } catch {}
    const ext = p.external_reference ? ` ext_ref=${p.external_reference}` : ""
    console.log(`    - preapproval ${p.id} · MP:${p.status}${ext} · last_modified ${p.last_modified} → estado ${transitionTo}`)
  }
}

async function applyOrg(orgId: string) {
  const res = await relinkPreapproval({
    admin,
    orgId,
    payerEmail: EMAIL || undefined,
    auditEventType: "MANUAL_ADMIN_ADJUSTMENT",
    source: "script:billing-recover-unlinked",
  })
  const tag = res.linked ? "✓ LINKEADO" : "✗ no linkeado"
  console.log(`  ${tag} ${orgId}: ${res.from_status ?? "?"} → ${res.to_status ?? "-"} ${res.reason ? `(${res.reason})` : ""} ${res.preapproval?.id ? `[${res.preapproval.id}]` : ""}`)
}

;(async () => {
  const ids = await candidateOrgIds()
  console.log(`\n=== billing-recover-unlinked ===`)
  console.log(`modo: ${APPLY ? "APPLY (escribe)" : "PREVIEW (read-only)"} · orgs candidatas: ${ids.length}${ORG ? ` (target ${ORG})` : ` (checkout <${DAYS}d)`}`)

  if (!ids.length) {
    console.log("Sin candidatas. Nada que hacer.")
    return
  }

  for (const id of ids) {
    if (APPLY) {
      try { await applyOrg(id) } catch (e: any) { console.log(`  ✗ ${id}: ${e?.message || e}`) }
    } else {
      await previewOrg(id)
    }
  }

  if (!APPLY) {
    console.log(`\nPreview terminado. Para aplicar: agregá --apply`)
  }
  console.log("")
})()
