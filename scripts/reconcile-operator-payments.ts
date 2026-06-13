/**
 * Reconciliación integral de operator_payments contra la liquidación intencional
 * (operation_operators + operation_services), usando la MISMA función que el
 * runtime: `reconcileOperatorPayments()` de lib/accounting. Esto elimina la
 * divergencia script-vs-runtime (antes el script reimplementaba las reglas y se
 * desincronizaba del endpoint).
 *
 * Read-only por defecto. Para aplicar: --apply
 *   Auditar:  npx tsx scripts/reconcile-operator-payments.ts [orgId]
 *   Aplicar:  npx tsx scripts/reconcile-operator-payments.ts [orgId] --apply
 *
 * Sin orgId: todas las orgs.
 *
 * ⚠️ Recordá: en orgs con el flag `operator_debt_from_operator_payments` OFF, los
 * reportes usan el modelo legacy (operator_cost) — aplicar acá puede cambiar deuda
 * que hoy no se muestra. Revisar BLOCKED siempre a mano.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import { reconcileOperatorPayments } from "@/lib/accounting/operator-payment-reconciliation"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const ORG_ID = args.find((a) => !a.startsWith("--")) || null

async function fetchAll<T>(build: (f: number, t: number) => any, ps = 1000): Promise<T[]> {
  const out: T[] = []
  let f = 0
  for (;;) {
    const { data, error } = await build(f, f + ps - 1)
    if (error) throw error
    if (!data || !data.length) break
    out.push(...(data as T[]))
    if (data.length < ps) break
    f += ps
  }
  return out
}

;(async () => {
  console.log(`\n=== Reconciliación operator_payments ${APPLY ? "(APPLY)" : "(DRY-RUN)"} ===`)
  console.log(ORG_ID ? `Org: ${ORG_ID}\n` : `Org: TODAS\n`)

  // Operaciones candidatas = las que tienen deuda al operador o liquidación cargada.
  const scope = (q: any) => (ORG_ID ? q.eq("org_id", ORG_ID) : q)
  const [pays, oos] = await Promise.all([
    fetchAll<any>((f, t) => scope(admin.from("operator_payments").select("operation_id, org_id")).range(f, t)),
    fetchAll<any>((f, t) => scope(admin.from("operation_operators").select("operation_id, org_id")).range(f, t)),
  ])

  const orgByOp = new Map<string, string>()
  for (const r of [...pays, ...oos]) {
    if (r.operation_id) orgByOp.set(r.operation_id, r.org_id)
  }
  const opIds = Array.from(orgByOp.keys())
  console.log(`Operaciones a revisar: ${opIds.length}`)

  const byKind: Record<string, number> = {}
  const perOrg = new Map<string, number>()
  let totalActions = 0
  let appliedTotal = 0
  const detailLines: string[] = []

  for (const opId of opIds) {
    const orgId = orgByOp.get(opId) || null
    const res = await reconcileOperatorPayments(admin, opId, { orgId, dryRun: !APPLY })
    if (res.actions.length === 0) continue
    totalActions += res.actions.length
    appliedTotal += res.appliedCount
    perOrg.set(orgId || "(null)", (perOrg.get(orgId || "(null)") || 0) + res.actions.length)
    for (const a of res.actions) {
      byKind[`${a.scope}:${a.kind}`] = (byKind[`${a.scope}:${a.kind}`] || 0) + 1
      detailLines.push(`  ${opId.slice(0, 8)} | ${a.scope}:${a.kind} | ${a.detail}`)
    }
  }

  if (totalActions === 0) {
    console.log("\n✅ Sin drift. operator_payments alineados con la liquidación.")
    return
  }

  console.log(`\nAcciones por tipo:`)
  for (const [k, n] of Object.entries(byKind).sort()) console.log(`  ${k}: ${n}`)

  // Nombres de org
  const orgIds = Array.from(perOrg.keys()).filter((k) => k !== "(null)")
  const { data: orgs } = await admin.from("organizations").select("id, name").in("id", orgIds)
  const orgName = (id: string) =>
    id === "(null)" ? "(org_id null)" : ((orgs || []).find((o: any) => o.id === id)?.name || id.slice(0, 8))
  console.log(`\nPor org:`)
  for (const [id, n] of Array.from(perOrg.entries())) console.log(`  ${orgName(id)}: ${n}`)

  console.log(`\nDetalle:`)
  for (const line of detailLines) console.log(line)

  console.log(
    `\nTotal acciones: ${totalActions}${APPLY ? ` | aplicadas: ${appliedTotal}` : ""}.`
  )
  if (!APPLY) console.log("Dry-run — re-ejecutá con --apply para escribir. (BLOCKED nunca se aplica.)")
})()
