/**
 * Recalcula comisiones PENDING al modelo canónico de la app.
 * =========================================================
 *
 * PROBLEMA: comisiones viejas quedaron con % incorrecto (típicamente servicios
 * comisionados al 50% por el bug del path viejo de "agregar servicio", que
 * ignoraba el % real del vendedor). El fix para ventas futuras ya está
 * desplegado; este script corrige los registros viejos PENDING.
 *
 * MODELO CANÓNICO (idéntico a lib/commissions/calculate.ts):
 *   margen = sale_amount_total − operator_cost   (recalculado si difiere del stored)
 *   % vendedor = getSellerPercentage (regla específica → users.default_commission_percentage → regla genérica)
 *   - 1 vendedor:  amount = margen × pct
 *   - 2 vendedores con overrides (commission_pct_primary/secondary): valores absolutos
 *   - 2 vendedores legacy: cada uno = margen × pct × (commission_split/100)
 *   El registro guarda percentage = % FULL del vendedor; amount = monto ya con split.
 *
 * SEGURIDAD (data financiera sensible):
 *   - Solo UPDATE de commission_records, con guard status='PENDING'.
 *   - Saltea la operación COMPLETA si tiene algún commission_record PAID
 *     (no tocar comisiones ya liquidadas).
 *   - Dry-run por defecto. Requiere --apply para escribir.
 *   - --org-id OBLIGATORIO.
 *   - No crea registros nuevos ni borra: solo ajusta amount/percentage de los PENDING existentes.
 *
 * USO:
 *   npx tsx scripts/recalc-commissions-pending.ts --org-id=<uuid>            # dry-run
 *   npx tsx scripts/recalc-commissions-pending.ts --org-id=<uuid> --apply    # ejecuta
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
const includeSuspect = args.includes("--include-suspect")
const orgId = args.find((a) => a.startsWith("--org-id="))?.split("=")[1] || null
// Una baja grande de monto (> este umbral) sugiere que el monto viejo o los
// totales de la operación son sospechosos → se marca SUSPECT y se omite salvo --include-suspect.
const SUSPECT_DROP = 200
const today = new Date().toISOString().split("T")[0]
const PAGE = 1000
const EPS = 0.01

async function page<T>(tbl: string, sel: string, col: string, val: string): Promise<T[]> {
  const out: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await admin.from(tbl).select(sel).eq(col, val).range(from, from + PAGE - 1)
    if (error) throw new Error(`${tbl}: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

// Cache de % por vendedor (replica getSellerPercentage de lib/commissions/calculate.ts).
const pctCache = new Map<string, number>()
async function getSellerPercentage(sellerId: string): Promise<number> {
  if (pctCache.has(sellerId)) return pctCache.get(sellerId)!
  let pct = 0
  // 1. Regla específica por vendedor
  const { data: sellerRules } = await (admin.from("commission_rules") as any)
    .select("value")
    .eq("type", "SELLER")
    .eq("seller_id", sellerId)
    .lte("valid_from", today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
    .order("valid_from", { ascending: false })
    .limit(1)
  if (sellerRules && sellerRules.length > 0) {
    pct = Number(sellerRules[0].value) || 0
  } else {
    // 2. users.default_commission_percentage (canónico)
    const { data: userRow } = await (admin.from("users") as any)
      .select("default_commission_percentage")
      .eq("id", sellerId)
      .maybeSingle()
    const userPct = (userRow as any)?.default_commission_percentage
    if (userPct != null) {
      pct = Number(userPct) || 0
    } else {
      // 3. Regla genérica de la org
      const { data: genericRules } = await (admin.from("commission_rules") as any)
        .select("value")
        .eq("type", "SELLER")
        .is("seller_id", null)
        .lte("valid_from", today)
        .or(`valid_to.is.null,valid_to.gte.${today}`)
        .is("destination_region", null)
        .order("valid_from", { ascending: false })
        .limit(1)
      if (genericRules && genericRules.length > 0) pct = Number(genericRules[0].value) || 0
    }
  }
  pctCache.set(sellerId, pct)
  return pct
}

const round2 = (n: number) => Math.round(n * 100) / 100

// Replica calculateCommission de lib/commissions/calculate.ts
async function calcCommission(op: any): Promise<{
  percentage: number
  primaryCommission: number
  secondaryCommission: number | null
  secondaryPercentage: number | null
}> {
  const sellerId = op.seller_primary_id || op.seller_id
  const margin = op.margin_amount
  if (!sellerId || margin <= 0) {
    return { percentage: 0, primaryCommission: 0, secondaryCommission: null, secondaryPercentage: null }
  }
  const primaryPct = await getSellerPercentage(sellerId)
  const hasSecondary = !!op.seller_secondary_id

  if (hasSecondary) {
    const hasOverrides = op.commission_pct_primary != null && op.commission_pct_secondary != null
    let effPrimary: number
    let effSecondary: number
    let secondaryPct: number
    if (hasOverrides) {
      effPrimary = Number(op.commission_pct_primary) || 0
      effSecondary = Number(op.commission_pct_secondary) || 0
      secondaryPct = await getSellerPercentage(op.seller_secondary_id)
    } else {
      const splitFactor = (op.commission_split ?? 50) / 100
      effPrimary = primaryPct * splitFactor
      secondaryPct = await getSellerPercentage(op.seller_secondary_id)
      effSecondary = secondaryPct * splitFactor
    }
    return {
      percentage: round2(primaryPct),
      primaryCommission: round2((margin * effPrimary) / 100),
      secondaryCommission: round2((margin * effSecondary) / 100),
      secondaryPercentage: round2(secondaryPct),
    }
  }

  if (primaryPct <= 0) {
    return { percentage: 0, primaryCommission: 0, secondaryCommission: null, secondaryPercentage: null }
  }
  return {
    percentage: round2(primaryPct),
    primaryCommission: round2((margin * primaryPct) / 100),
    secondaryCommission: null,
    secondaryPercentage: null,
  }
}

async function main() {
  console.log(`=== Recalc comisiones PENDING (${apply ? "APPLY" : "DRY-RUN"}) ===`)
  if (!orgId) {
    console.error("ERROR: --org-id=<uuid> es obligatorio.")
    process.exit(1)
  }
  console.log(`org_id=${orgId}`)

  const records = await page<any>("commission_records", "id, operation_id, seller_id, amount, percentage, status", "org_id", orgId)
  console.log(`commission_records en org: ${records.length}`)

  // Agrupar por operación
  const byOp = new Map<string, any[]>()
  for (const r of records) {
    const a = byOp.get(r.operation_id) || []; a.push(r); byOp.set(r.operation_id, a)
  }

  // Cargar operaciones involucradas (en chunks)
  const opIds = Array.from(byOp.keys())
  const opsById = new Map<string, any>()
  // Select "*" para evitar errores por nombres de columna (igual que processCommissionsForOperations).
  const opSelect = "*"
  for (let i = 0; i < opIds.length; i += 100) {
    const slice = opIds.slice(i, i + 100)
    const { data, error } = await admin.from("operations").select(opSelect).in("id", slice)
    if (error) throw new Error(`operations: ${error.message}`)
    for (const o of data || []) opsById.set((o as any).id, o)
  }

  type Upd = { id: string; file: string; seller: string; role: "P" | "S"; fromPct: number; toPct: number; fromAmt: number; toAmt: number; cur: string; suspect: boolean }
  const updates: Upd[] = []
  let skippedPaidOps = 0
  let skippedNotFiftyBug = 0
  let skippedWouldZero = 0
  let skippedNoOp = 0

  for (const [opId, recs] of byOp.entries()) {
    // Saltear operaciones con algún record PAID (no tocar liquidadas)
    if (recs.some((r) => r.status !== "PENDING")) { skippedPaidOps++; continue }
    const op = opsById.get(opId)
    if (!op) { skippedNoOp++; continue }

    // Margen canónico (recalculado si difiere del stored, igual que processCommissionsForOperations)
    const sale = Number(op.sale_amount_total) || 0
    const cost = Number(op.operator_cost) || 0
    const storedMargin = Number(op.margin_amount) || 0
    const recalcMargin = sale - cost
    const margin = Math.abs(recalcMargin - storedMargin) > 1 ? recalcMargin : storedMargin
    const cur = op.sale_currency || op.currency || "USD"

    const cc = await calcCommission({ ...op, margin_amount: margin })

    const primarySeller = op.seller_primary_id || op.seller_id
    for (const r of recs) {
      let toPct: number | null = null
      let toAmt: number | null = null
      let role: "P" | "S" = "P"
      if (r.seller_id === primarySeller) {
        toPct = cc.percentage; toAmt = cc.primaryCommission; role = "P"
      } else if (op.seller_secondary_id && r.seller_id === op.seller_secondary_id) {
        toPct = cc.secondaryPercentage ?? 0; toAmt = cc.secondaryCommission ?? 0; role = "S"
      } else {
        // Record de un vendedor que ya no corresponde a la operación → no tocar.
        continue
      }
      const fromPct = Number(r.percentage) || 0
      const fromAmt = Number(r.amount) || 0
      // SCOPE QUIRÚRGICO: solo el bug del 50%. Corregimos únicamente registros
      // que están al ~50% y cuyo % canónico del vendedor es DISTINTO de 50.
      // - Vendedores legítimamente al 50% → se dejan intactos.
      // - Cualquier otro drift de monto (% ya correcto) → NO se toca (no fue reportado).
      const isWrongFifty = Math.abs(fromPct - 50) < 0.01 && Math.abs(toPct - 50) >= 0.01
      if (!isWrongFifty) { skippedNotFiftyBug++; continue }
      // No anular comisiones de vendedores sin % configurado (toPct=0): sería destructivo.
      if (toPct <= 0) { skippedWouldZero++; continue }
      const suspect = fromAmt - toAmt > SUSPECT_DROP
      updates.push({ id: r.id, file: op.file_code, seller: r.seller_id.slice(0, 8), role, fromPct, toPct, fromAmt, toAmt, cur, suspect })
    }
  }

  console.log(`\nOps salteadas (tienen algún PAID): ${skippedPaidOps}`)
  console.log(`Ops sin fila en operations: ${skippedNoOp}`)
  console.log(`Records fuera de scope (no es bug 50%): ${skippedNotFiftyBug}`)
  console.log(`Records 50% salteados por vendedor sin % (no anular): ${skippedWouldZero}`)

  const clean = updates.filter((u) => !u.suspect)
  const suspect = updates.filter((u) => u.suspect)
  const fmtRow = (u: Upd) => ({
    file: u.file, seller: u.seller, rol: u.role,
    pct: `${u.fromPct}% → ${u.toPct}%`,
    amount: `${u.cur} ${u.fromAmt} → ${u.toAmt}`,
    diff: round2(u.toAmt - u.fromAmt),
  })

  console.log(`\n— A CORREGIR (bug 50%, monto razonable): ${clean.length} —`)
  console.table(clean.slice(0, 50).map(fmtRow))
  if (clean.length > 50) console.log(`  (... ${clean.length - 50} más)`)

  if (suspect.length) {
    console.log(`\n— ⚠ SUSPECT (baja de monto > USD ${SUSPECT_DROP}; revisar totales de la operación): ${suspect.length} —`)
    console.table(suspect.map(fmtRow))
    console.log(`  ${includeSuspect ? "Se INCLUYEN (--include-suspect)" : "OMITIDAS por defecto. Revisalas; usá --include-suspect para aplicarlas."}`)
  }

  const toApply = includeSuspect ? updates : clean
  console.log(`\nTotal a aplicar: ${toApply.length}`)

  if (!apply) {
    console.log(`\n(DRY-RUN — usá --apply para escribir)`)
    return
  }

  let ok = 0, err = 0
  for (const u of toApply) {
    const { error } = await (admin.from("commission_records") as any)
      .update({ amount: u.toAmt, percentage: u.toPct, updated_at: new Date().toISOString() })
      .eq("id", u.id)
      .eq("status", "PENDING") // guard: no tocar si pasó a PAID en el medio
    if (error) { console.error(`✗ ${u.file} (${u.seller}): ${error.message}`); err++ }
    else ok++
  }
  console.log(`\n=== Resultado ===`)
  console.log(`Records actualizados: ${ok} (errores: ${err})`)
}

main().catch((e) => { console.error("FATAL:", e?.message || e); process.exit(1) })
