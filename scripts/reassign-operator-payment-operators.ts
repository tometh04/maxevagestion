/**
 * Re-apunta el operador de las deudas (operator_payments) de una operación cuando
 * quedaron COLAPSADAS al operador equivocado (caso "todo figura Sudameria": las
 * deudas por servicio se reasignaron al operador primario en una edición vieja).
 *
 * A diferencia de reconcile-operator-payments (que borra/recrea y duplicaría las
 * deudas ya pagadas), este script solo CAMBIA operator_id, **preservando
 * paid_amount, status y el pago vinculado**. No toca plata.
 *
 * Cómo decide el operador correcto: matchea cada deuda con un servicio cargado
 * (operation_operators) por MONTO, por bucket de monto:
 *   - Si en un monto la cantidad de deudas ≠ cantidad de servicios → NO toca ese
 *     bucket (no es un re-apuntado puro; se reporta para revisión manual).
 *   - Si coinciden, asigna a cada deuda el operador de un servicio de ese monto,
 *     conservando primero las deudas que YA apuntan a un operador correcto.
 * Además re-apunta el operator_id de los payments vinculados a cada deuda movida.
 *
 * SEGURO POR DEFECTO: dry-run. Solo escribe con --apply.
 *
 * Uso:
 *   npx tsx scripts/reassign-operator-payment-operators.ts --operation=<opId>
 *   npx tsx scripts/reassign-operator-payment-operators.ts --operation=<opId> --apply
 *
 * Caso op #e7a3e2de:
 *   npx tsx scripts/reassign-operator-payment-operators.ts --operation=e7a3e2de-a2ee-41f9-bab0-5422e6174f71
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const OPERATION_ID = (args.find((a) => a.startsWith("--operation=")) || "").split("=")[1] || null

const round2 = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100
const key = (v: unknown) => round2(v).toFixed(2)

;(async () => {
  if (!OPERATION_ID) { console.error("Uso: --operation=<opId> [--apply]"); process.exit(1) }

  const { data: opRow } = await admin.from("operations").select("id, org_id, file_code").eq("id", OPERATION_ID).maybeSingle()
  if (!opRow) { console.error(`No existe la operación ${OPERATION_ID}`); process.exit(1) }
  const org = (opRow as any).org_id

  const { data: names } = await admin.from("operators").select("id, name").eq("org_id", org).limit(5000)
  const nm = new Map((names || []).map((o: any) => [o.id, o.name]))
  const label = (id: string) => `${nm.get(id) || "?"} [${String(id).slice(0, 8)}]`

  const { data: services } = await admin.from("operation_operators").select("operator_id, cost").eq("operation_id", OPERATION_ID)
  const { data: debts } = await admin.from("operator_payments").select("id, operator_id, amount, paid_amount, status").eq("operation_id", OPERATION_ID)

  console.log(`\n=== ${APPLY ? "RE-APUNTAR (APPLY)" : "DRY-RUN"} operadores de deudas — op ${(opRow as any).file_code || OPERATION_ID.slice(0, 8)} ===\n`)

  // Servicios esperados por bucket de monto: lista de operator_id esperados.
  const svcByAmount = new Map<string, string[]>()
  for (const s of services || []) {
    const k = key((s as any).cost)
    const arr = svcByAmount.get(k) || []; arr.push((s as any).operator_id); svcByAmount.set(k, arr)
  }
  // Deudas por bucket de monto.
  const debtsByAmount = new Map<string, any[]>()
  for (const d of debts || []) {
    const k = key((d as any).amount)
    const arr = debtsByAmount.get(k) || []; arr.push(d); debtsByAmount.set(k, arr)
  }

  const reassignments: Array<{ debt: any; from: string; to: string }> = []
  const skipped: string[] = []

  for (const [k, bucketDebts] of Array.from(debtsByAmount.entries())) {
    const expected = (svcByAmount.get(k) || []).slice() // multiset de operadores esperados
    if (expected.length !== bucketDebts.length) {
      skipped.push(`monto ${k}: ${bucketDebts.length} deuda(s) vs ${expected.length} servicio(s) → count no coincide, no se toca (revisar con reconcile).`)
      continue
    }
    // 1) las deudas que ya apuntan a un operador esperado lo "reclaman".
    const unclaimedDebts: any[] = []
    for (const d of bucketDebts) {
      const idx = expected.indexOf(d.operator_id)
      if (idx >= 0) expected.splice(idx, 1)
      else unclaimedDebts.push(d)
    }
    // 2) las deudas restantes se re-apuntan a los operadores esperados sobrantes.
    for (const d of unclaimedDebts) {
      const to = expected.shift()
      if (!to) { skipped.push(`monto ${k}: deuda ${d.id.slice(0, 8)} sin operador esperado disponible`); continue }
      reassignments.push({ debt: d, from: d.operator_id, to })
    }
  }

  if (reassignments.length === 0) console.log("No hay deudas para re-apuntar (todos los operadores ya coinciden con sus servicios).")
  for (const r of reassignments) {
    console.log(`RE-APUNTAR deuda [${r.debt.id.slice(0, 8)}] monto=${round2(r.debt.amount)} paid=${round2(r.debt.paid_amount)} status=${r.debt.status}`)
    console.log(`   ${label(r.from)}  →  ${label(r.to)}`)
  }
  if (skipped.length) { console.log(`\nOmitidos (revisión manual):`); for (const s of skipped) console.log(`   - ${s}`) }

  if (!APPLY) { console.log(`\nDRY-RUN. Agregá --apply para escribir.\n`); return }

  let done = 0
  for (const r of reassignments) {
    // Re-apuntar la deuda (solo operator_id; paid_amount/status intactos).
    const { error: de } = await admin.from("operator_payments")
      .update({ operator_id: r.to, updated_at: new Date().toISOString() })
      .eq("id", r.debt.id).eq("org_id", org)
    if (de) { console.error(`ERROR deuda ${r.debt.id.slice(0, 8)}: ${de.message}`); continue }
    // Re-apuntar los payments vinculados a esa deuda que quedaron con el operador viejo.
    const { error: pe } = await admin.from("payments")
      .update({ operator_id: r.to })
      .eq("operator_payment_id", r.debt.id).eq("operator_id", r.from)
    if (pe) console.error(`  aviso: no se pudieron re-apuntar payments de ${r.debt.id.slice(0, 8)}: ${pe.message}`)
    done++
  }
  console.log(`\n✓ Re-apuntadas ${done}/${reassignments.length} deudas (paid_amount y pagos preservados).\n`)
})().catch((e) => { console.error("Error:", e); process.exit(1) })
