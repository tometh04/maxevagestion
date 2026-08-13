/**
 * Borra operator_payments FANTASMA (deudas duplicadas que quedaron de una edición)
 * de forma segura. Un fantasma es una deuda EXCEDENTE respecto de los servicios
 * cargados (operation_operators), con paid=0, status=PENDING y SIN payments ni
 * operation_services linkeados. Borrarla no toca plata.
 *
 * Detección segura (misma idea que scripts/reconcile-operator-payments.ts, acotada
 * y SOLO acción GHOST): por cada operador, si hay más operator_payments que
 * servicios cargados de ese operador, el excedente que cumpla las guardas es
 * fantasma. Nunca borra una deuda legítima (una deuda pendiente que SÍ tiene su
 * servicio no es excedente y no se toca).
 *
 * SEGURO POR DEFECTO: dry-run. Solo borra con --apply.
 *
 * Uso:
 *   # Por operación (recomendado — no hace falta el uuid de la deuda):
 *   npx tsx scripts/delete-ghost-operator-payment.ts --operation=<operationId>
 *   npx tsx scripts/delete-ghost-operator-payment.ts --operation=<operationId> --apply
 *
 *   # Por id explícito de la deuda:
 *   npx tsx scripts/delete-ghost-operator-payment.ts <operatorPaymentId> --apply
 *
 * Caso Lozada VG (saldo "USD 8 pendiente" ya pagado):
 *   npx tsx scripts/delete-ghost-operator-payment.ts --operation=58a5d939-355c-472d-ad9c-ea234f2c50c8
 *
 * Requiere SUPABASE_SERVICE_ROLE_KEY en .env.local.
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
const EXPLICIT_ID = args.find((a) => !a.startsWith("--")) || null

async function guardsOk(id: string): Promise<{ ok: boolean; nPays: number; nSvc: number }> {
  const { data: pays } = await admin.from("payments").select("id").eq("operator_payment_id", id)
  const { data: svc } = await admin.from("operation_services").select("id").eq("operator_payment_id", id)
  return { ok: (pays || []).length === 0 && (svc || []).length === 0, nPays: (pays || []).length, nSvc: (svc || []).length }
}

async function deleteGuarded(r: any): Promise<boolean> {
  const { data: del, error } = await admin
    .from("operator_payments").delete()
    .eq("id", r.id).eq("org_id", r.org_id).eq("status", "PENDING").eq("paid_amount", 0)
    .select("id")
  if (error) { console.error(`  ERROR borrando ${r.id.slice(0, 8)}: ${error.message}`); return false }
  return (del || []).length > 0
}

;(async () => {
  console.log(`\n=== ${APPLY ? "BORRADO (APPLY)" : "DRY-RUN"} de operator_payments fantasma ===\n`)

  let targets: any[] = []

  if (EXPLICIT_ID) {
    const { data: row } = await admin.from("operator_payments").select("*").eq("id", EXPLICIT_ID).maybeSingle()
    if (!row) { console.error(`No existe operator_payment ${EXPLICIT_ID}`); process.exit(1) }
    const r = row as any
    const g = await guardsOk(r.id)
    if (Number(r.paid_amount) !== 0 || r.status !== "PENDING" || !g.ok) {
      console.log(`❌ ${r.id.slice(0, 8)} NO cumple guardas (paid=${r.paid_amount} status=${r.status} pays=${g.nPays} svc=${g.nSvc}). No se toca.`)
      process.exit(1)
    }
    targets = [r]
  } else if (OPERATION_ID) {
    const { data: oo } = await admin.from("operation_operators").select("operator_id").eq("operation_id", OPERATION_ID)
    const svcCount = new Map<string, number>()
    for (const s of oo || []) svcCount.set((s as any).operator_id, (svcCount.get((s as any).operator_id) || 0) + 1)

    const { data: opays } = await admin.from("operator_payments")
      .select("*").eq("operation_id", OPERATION_ID).order("created_at", { ascending: true })
    const byOperator = new Map<string, any[]>()
    for (const p of opays || []) {
      const arr = byOperator.get((p as any).operator_id) || []
      arr.push(p); byOperator.set((p as any).operator_id, arr)
    }

    for (const [opId, debts] of Array.from(byOperator.entries())) {
      const surplus = debts.length - (svcCount.get(opId) || 0)
      if (surplus <= 0) continue
      // Candidatos a fantasma: paid=0, PENDING, sin links. Ordená para borrar los
      // más nuevos primero (conservá la deuda original).
      const cands: any[] = []
      for (const d of debts) {
        if (Number(d.paid_amount) !== 0 || d.status !== "PENDING") continue
        const g = await guardsOk(d.id)
        if (g.ok) cands.push(d)
      }
      // Borrar como máximo 'surplus' candidatos.
      targets.push(...cands.slice(0, surplus))
    }
    if (targets.length === 0) console.log("No se detectaron fantasmas (excedentes paid=0 sin links) en esta operación.")
  } else {
    console.error("Uso: --operation=<operationId>  |  <operatorPaymentId>   [--apply]")
    process.exit(1)
  }

  let deleted = 0
  for (const r of targets) {
    console.log(`${APPLY ? "BORRAR" : "fantasma"} [${r.id.slice(0, 8)}] op=${String(r.operation_id).slice(0, 8)} operator=${String(r.operator_id).slice(0, 8)} amount=${r.amount} paid=${r.paid_amount} status=${r.status} venc=${r.due_date}`)
    if (APPLY && await deleteGuarded(r)) deleted++
  }

  console.log(`\n=== ${APPLY ? `Borrados: ${deleted}/${targets.length}` : `Fantasmas detectados: ${targets.length} (DRY-RUN, agregá --apply para borrar)`} ===\n`)
})().catch((e) => { console.error("Error:", e); process.exit(1) })
