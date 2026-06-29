/**
 * Fix operaciones con seller_id == seller_secondary_id (mismo vendedor como
 * principal Y secundario). Ese estado dispara el split 50/50 en
 * lib/commissions/calculate.ts y reduce la comisión del vendedor a la mitad.
 *
 * Caso reportado: Milla Cero OP-...F790FA44 → 25% sobre USD 103 daba USD 12,88
 * en vez de USD 25,75. Auditoría: 7 ops en 4 orgs.
 *
 * QUÉ HACE (por operación afectada):
 *   1. Anula el secundario inválido en operations:
 *      seller_secondary_id = NULL, commission_split = NULL,
 *      commission_pct_primary = NULL, commission_pct_secondary = NULL.
 *   2. Recalcula la comisión completa: amount = margen × pct_vendedor.
 *      Actualiza el commission_record del vendedor (percentage ya estaba bien).
 *
 * SEGURIDAD:
 *   - Dry-run por defecto. Requiere --apply para escribir.
 *   - Salta la operación COMPLETA si tiene algún commission_record no-PENDING
 *     (no tocar comisiones ya liquidadas/pagadas).
 *   - Filtro opcional --org-id=<uuid> para acotar a una sola org.
 *   - Solo toca ops donde seller_id === seller_secondary_id (invariante inválido).
 *
 * USO:
 *   npx tsx scripts/fix-duplicate-seller-commission.ts                       # dry-run TODAS las orgs
 *   npx tsx scripts/fix-duplicate-seller-commission.ts --org-id=<uuid>       # dry-run 1 org
 *   npx tsx scripts/fix-duplicate-seller-commission.ts --apply               # ejecuta TODAS
 *   npx tsx scripts/fix-duplicate-seller-commission.ts --org-id=<uuid> --apply
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const orgFilter = args.find((a) => a.startsWith("--org-id="))?.split("=")[1] || null
const today = new Date().toISOString().split("T")[0]
const round2 = (n: number) => Math.round(n * 100) / 100

// Replica getSellerPercentage de lib/commissions/calculate.ts
const pctCache = new Map<string, number>()
async function getSellerPercentage(sellerId: string): Promise<number> {
  if (pctCache.has(sellerId)) return pctCache.get(sellerId)!
  let pct = 0
  const { data: sellerRules } = await (admin.from("commission_rules") as any)
    .select("value").eq("type", "SELLER").eq("seller_id", sellerId)
    .lte("valid_from", today).or(`valid_to.is.null,valid_to.gte.${today}`)
    .order("valid_from", { ascending: false }).limit(1)
  if (sellerRules && sellerRules.length > 0) {
    pct = Number(sellerRules[0].value) || 0
  } else {
    const { data: userRow } = await (admin.from("users") as any)
      .select("default_commission_percentage").eq("id", sellerId).maybeSingle()
    const userPct = (userRow as any)?.default_commission_percentage
    if (userPct != null) {
      pct = Number(userPct) || 0
    } else {
      const { data: genericRules } = await (admin.from("commission_rules") as any)
        .select("value").eq("type", "SELLER").is("seller_id", null)
        .lte("valid_from", today).or(`valid_to.is.null,valid_to.gte.${today}`)
        .is("destination_region", null).order("valid_from", { ascending: false }).limit(1)
      if (genericRules && genericRules.length > 0) pct = Number(genericRules[0].value) || 0
    }
  }
  pctCache.set(sellerId, pct)
  return pct
}

async function main() {
  console.log(`=== Fix duplicate-seller commission (${apply ? "APPLY" : "DRY-RUN"}) ===`)
  if (orgFilter) console.log(`Filtro org_id=${orgFilter}`)

  let q = admin
    .from("operations")
    .select("id, file_code, org_id, seller_id, seller_secondary_id, commission_split, sale_amount_total, operator_cost, margin_amount, sale_currency, currency, status")
    .not("seller_secondary_id", "is", null)
  if (orgFilter) q = q.eq("org_id", orgFilter)
  const { data: ops, error } = await q
  if (error) { console.error("Error:", error.message); process.exit(1) }

  const affected = (ops || []).filter(
    (o: any) => o.seller_id && o.seller_secondary_id && o.seller_id === o.seller_secondary_id
  )
  console.log(`Ops con seller_id == seller_secondary_id: ${affected.length}\n`)

  let fixedOps = 0, skippedPaid = 0, updatedRecords = 0, errs = 0

  for (const op of affected as any[]) {
    const margin = (() => {
      const sale = Number(op.sale_amount_total) || 0
      const cost = Number(op.operator_cost) || 0
      const stored = Number(op.margin_amount) || 0
      const recalc = sale - cost
      return Math.abs(recalc - stored) > 1 ? recalc : stored
    })()
    const cur = op.sale_currency || op.currency || "USD"
    const pct = await getSellerPercentage(op.seller_id)
    const fullCommission = margin > 0 && pct > 0 ? round2((margin * pct) / 100) : 0

    // Records de la operación
    const { data: recs } = await admin
      .from("commission_records")
      .select("id, seller_id, amount, percentage, status")
      .eq("operation_id", op.id)

    const hasPaid = (recs || []).some((r: any) => r.status !== "PENDING")
    if (hasPaid) {
      console.log(`⏭  ${op.file_code}: tiene commission_record no-PENDING → SALTEADA (no tocar liquidadas)`)
      skippedPaid++
      continue
    }

    const sellerRecs = (recs || []).filter((r: any) => r.seller_id === op.seller_id)
    console.log(`• ${op.file_code} [${op.status}]  margen=${cur} ${margin}  pct=${pct}%`)
    console.log(`    operations: seller_secondary_id ${op.seller_secondary_id?.slice(0, 8)} → NULL, commission_split ${op.commission_split} → NULL`)
    for (const r of sellerRecs) {
      console.log(`    commission_record ${r.id.slice(0, 8)}: amount ${cur} ${r.amount} → ${fullCommission} (pct ${r.percentage} → ${pct})`)
    }

    if (!apply) { fixedOps++; continue }

    // 1) Anular secundario inválido en la operación
    const { error: opErr } = await (admin.from("operations") as any)
      .update({
        seller_secondary_id: null,
        commission_split: null,
        commission_pct_primary: null,
        commission_pct_secondary: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", op.id)
    if (opErr) { console.error(`    ✗ operations update: ${opErr.message}`); errs++; continue }

    // 2) Recalcular comisión completa en el/los record(s) del vendedor (solo PENDING)
    for (const r of sellerRecs) {
      const { error: recErr } = await (admin.from("commission_records") as any)
        .update({ amount: fullCommission, percentage: pct, updated_at: new Date().toISOString() })
        .eq("id", r.id)
        .eq("status", "PENDING")
      if (recErr) { console.error(`    ✗ commission_record ${r.id.slice(0, 8)}: ${recErr.message}`); errs++ }
      else updatedRecords++
    }
    fixedOps++
  }

  console.log(`\n=== Resumen ===`)
  console.log(`Ops ${apply ? "corregidas" : "a corregir"}: ${fixedOps}`)
  console.log(`Ops salteadas (comisión ya liquidada): ${skippedPaid}`)
  if (apply) console.log(`commission_records actualizados: ${updatedRecords} (errores: ${errs})`)
  if (!apply) console.log(`\n(DRY-RUN — usá --apply para escribir)`)
}

main().catch((e) => { console.error("FATAL:", e?.message || e); process.exit(1) })
