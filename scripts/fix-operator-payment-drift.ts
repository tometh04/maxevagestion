/**
 * Fix data: sincroniza operator_payments.amount con el costo real del
 * operador donde paid_amount = 0 y status in (PENDING, OVERDUE).
 *
 * Detecta el costo correcto desde operation_operators (multi-op) o desde
 * operations.operator_cost (legacy single-op, solo cuando hay UN operator_payment).
 *
 * Run:
 *   npx tsx scripts/fix-operator-payment-drift.ts --dry-run
 *   npx tsx scripts/fix-operator-payment-drift.ts --apply
 *   npx tsx scripts/fix-operator-payment-drift.ts --apply --org-id=<uuid>
 *   npx tsx scripts/fix-operator-payment-drift.ts --apply --operation-id=<uuid>
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const dryRun = !args.includes("--apply")
const orgIdArg = args.find((a) => a.startsWith("--org-id="))?.split("=")[1] || null
const opIdArg = args.find((a) => a.startsWith("--operation-id="))?.split("=")[1] || null

const EPS = 0.01

;(async () => {
  console.log(`=== Fix operator_payments drift (${dryRun ? "DRY-RUN" : "APPLY"}) ===`)
  if (orgIdArg) console.log(`Filtro org_id=${orgIdArg}`)
  if (opIdArg) console.log(`Filtro operation_id=${opIdArg}`)

  let opPayQuery = admin
    .from("operator_payments")
    .select("id, operation_id, operator_id, amount, currency, paid_amount, status, org_id")
    .in("status", ["PENDING", "OVERDUE"])
    .eq("paid_amount", 0)
    .not("operation_id", "is", null)

  if (orgIdArg) opPayQuery = opPayQuery.eq("org_id", orgIdArg)
  if (opIdArg) opPayQuery = opPayQuery.eq("operation_id", opIdArg)

  const { data: opPays, error: opPayErr } = await opPayQuery
  if (opPayErr) {
    console.error(opPayErr)
    return
  }
  if (!opPays || opPays.length === 0) {
    console.log("Nada para procesar.")
    return
  }

  const operationIds = Array.from(new Set(opPays.map((p: any) => p.operation_id).filter(Boolean)))

  const [{ data: opOpsRows }, { data: opsRows }, { data: opServicesRows }] = await Promise.all([
    admin
      .from("operation_operators")
      .select("operation_id, operator_id, cost, cost_currency")
      .in("operation_id", operationIds as string[]),
    admin
      .from("operations")
      .select("id, file_code, operator_cost, operator_cost_currency, sale_currency, currency")
      .in("id", operationIds as string[]),
    admin
      .from("operation_services")
      .select("operation_id, operator_payment_id")
      .in("operation_id", operationIds as string[])
      .not("operator_payment_id", "is", null),
  ])

  // Set de operator_payment.id que están vinculados a un operation_service
  // (esos sincronizan contra operation_services.cost_amount, no contra
  // operation_operators.cost). Los excluimos del fix de "base".
  const serviceLinkedPaymentIds = new Set<string>(
    (opServicesRows || [])
      .map((s: any) => s.operator_payment_id)
      .filter((id: any): id is string => Boolean(id))
  )

  const opOpsByOp = new Map<string, any[]>()
  for (const r of opOpsRows || []) {
    const k = (r as any).operation_id
    const arr = opOpsByOp.get(k) || []
    arr.push(r)
    opOpsByOp.set(k, arr)
  }
  const opsById = new Map<string, any>((opsRows || []).map((r: any) => [r.id, r]))

  // Agrupar operator_payments por operation_id para detectar caso legacy single
  const opPaysByOp = new Map<string, any[]>()
  for (const p of opPays as any[]) {
    const arr = opPaysByOp.get(p.operation_id) || []
    arr.push(p)
    opPaysByOp.set(p.operation_id, arr)
  }

  let toFix = 0
  let skippedNoMatch = 0
  let skippedAmbiguousLegacy = 0
  let skippedServiceLinked = 0
  let applied = 0
  let applyErrors = 0

  for (const p of opPays as any[]) {
    const op = opsById.get(p.operation_id)
    if (!op) continue

    if (serviceLinkedPaymentIds.has(p.id)) {
      skippedServiceLinked += 1
      continue
    }

    const opOpsForThis = opOpsByOp.get(p.operation_id) || []
    let expectedCost: number | null = null
    let expectedCurrency: string | null = null

    if (opOpsForThis.length > 0) {
      const match = opOpsForThis.find((r: any) => r.operator_id === p.operator_id)
      if (!match) {
        skippedNoMatch += 1
        continue
      }
      expectedCost = Number(match.cost || 0)
      expectedCurrency = (match.cost_currency || op.operator_cost_currency || op.sale_currency || op.currency || "USD") as string
    } else {
      const sameOpPayments = opPaysByOp.get(p.operation_id) || []
      if (sameOpPayments.length !== 1) {
        skippedAmbiguousLegacy += 1
        continue
      }
      expectedCost = Number(op.operator_cost || 0)
      expectedCurrency = (op.operator_cost_currency || op.sale_currency || op.currency || "USD") as string
    }

    const drift = Number(p.amount || 0) - expectedCost
    if (Math.abs(drift) <= EPS) continue

    toFix += 1
    console.log(
      `[${op.file_code || op.id.slice(0, 8)}] ${p.operator_id.slice(0, 8)} amount ${p.amount} → ${expectedCost} ${expectedCurrency} (drift ${drift.toFixed(2)})`
    )

    if (!dryRun) {
      const { error } = await (admin.from("operator_payments") as any)
        .update({
          amount: expectedCost,
          currency: expectedCurrency,
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id)

      if (error) {
        console.error(`  ✗ Error: ${error.message}`)
        applyErrors += 1
      } else {
        applied += 1
      }
    }
  }

  console.log(`\n=== Resumen ===`)
  console.log(`Drifts detectados: ${toFix}`)
  console.log(`Skipped (no match operator en operation_operators): ${skippedNoMatch}`)
  console.log(`Skipped (legacy con múltiples operator_payments en una op): ${skippedAmbiguousLegacy}`)
  console.log(`Skipped (operator_payment vinculado a operation_service): ${skippedServiceLinked}`)
  if (!dryRun) {
    console.log(`Applied: ${applied}`)
    console.log(`Errors: ${applyErrors}`)
  } else {
    console.log("(dry-run — no se modificó nada. Usá --apply para aplicar)")
  }
})()
