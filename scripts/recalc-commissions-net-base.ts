/**
 * Recálculo de comisiones sobre la base neta de IVA (VIB-95).
 * ==========================================================
 *
 * CONTEXTO: una agencia activa la base de comisiones neta de IVA
 * (financial_settings.commission_base_net_of_iva) con una alícuota y una fecha
 * de corte. Las operaciones NUEVAS ya nacen con la comisión sobre la neta, pero
 * las que se cargaron antes de activar el flag siguen con la comisión sobre la
 * bruta. Este script recalcula esas operaciones para que el reporte cierre desde
 * la fecha de corte (pedido de Yamil: que junio coincida con sus planillas).
 *
 * QUÉ HACE: recorre las operaciones de UNA agencia con operation_date >= corte y
 * re-dispara el cálculo de comisiones de vendedor y de referidor usando la config
 * vigente de la agencia (misma función que la app).
 *
 * QUÉ NO HACE, a propósito:
 *   - NO crea comisiones nuevas. Un corte de base solo recalcula lo que ya
 *     existe; solo procesa operaciones que YA tienen una comisión PENDING
 *     editable (vendedor y/o referidor). Las operaciones sin comisión cargada se
 *     saltean y se listan aparte.
 *   - NO toca lo pagado. `isLocked()` (VIB-94) deja intactas las comisiones
 *     pagadas, parcialmente pagadas o saldadas.
 *   - NO toca el IVA fiscal (iva_sales) ni el libro de IVA. Solo la base de comisión.
 *   - NO cambia nada si la agencia no tiene la base neta activada (sale con error
 *     para no revertir comisiones a bruta por accidente).
 *
 * CORTE: `operations.operation_date` (fecha de venta), igual criterio que el
 * Reporte de Comisiones y que el cierre VIB-94.
 *
 * SEGURIDAD:
 *   - `--org-id` y `--agency-id` obligatorios: el recálculo es de UNA agencia.
 *   - Dry-run por defecto; escribe solo con `--apply`.
 *
 * USO:
 *   npx tsx scripts/recalc-commissions-net-base.ts --org-id=<uuid> --agency-id=<uuid> --cutoff=2026-06-01
 *   npx tsx scripts/recalc-commissions-net-base.ts --org-id=<uuid> --agency-id=<uuid> --cutoff=2026-06-01 --apply
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import {
  recalculateOperationCommissions,
  type CommissionOperation,
} from "@/lib/commissions/calculate"
import { getCommissionBaseConfig } from "@/lib/commissions/net-base"
import { createOrUpdateReferralCommission } from "@/lib/referrals/calculate"

loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const orgId = args.find((a) => a.startsWith("--org-id="))?.split("=")[1] || null
const agencyId = args.find((a) => a.startsWith("--agency-id="))?.split("=")[1] || null
const cutoff = args.find((a) => a.startsWith("--cutoff="))?.split("=")[1] || null

const PAGE = 1000

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

// Editable = misma condición que isLocked() en lib/commissions/calculate.ts.
function isEditableSellerRecord(r: any): boolean {
  return (r.status ?? "PENDING") === "PENDING" && Number(r.amount_paid ?? 0) <= 0 && !r.settled_at
}

async function main() {
  if (!orgId) {
    console.error("Falta --org-id=<uuid>.")
    process.exit(1)
  }
  if (!agencyId) {
    console.error("Falta --agency-id=<uuid>. El recálculo es de una sola agencia.")
    process.exit(1)
  }
  if (!cutoff || !/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
    console.error("Falta --cutoff=YYYY-MM-DD (inclusive). Ej: --cutoff=2026-06-01")
    process.exit(1)
  }

  const config = await getCommissionBaseConfig(admin, agencyId)
  if (!config.enabled) {
    console.error(
      "La agencia NO tiene la base de comisiones neta activada " +
        "(financial_settings.commission_base_net_of_iva = false).\n" +
        "Activala primero en Finanzas → Impuestos; si no, este recálculo volvería " +
        "las comisiones a la ganancia bruta."
    )
    process.exit(1)
  }
  if (config.from && config.from !== cutoff) {
    console.warn(
      `⚠ El corte pasado (${cutoff}) no coincide con commission_net_from de la ` +
        `agencia (${config.from}). El descuento de IVA se aplica según la config ` +
        `(desde ${config.from}); las operaciones entre ambas fechas se recalculan ` +
        `pero podrían quedar en bruta.`
    )
  }

  // Operaciones de la agencia desde el corte, con vendedor. Select "*" para que
  // el objeto tenga agency_id, operation_date, org_id, etc. (igual que la app).
  const operations: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await admin
      .from("operations")
      .select("*")
      .eq("org_id", orgId)
      .eq("agency_id", agencyId)
      .gte("operation_date", cutoff)
      .not("status", "eq", "CANCELLED")
      .not("seller_id", "is", null)
      .order("operation_date", { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) throw new Error(`operations: ${error.message}`)
    if (!data || data.length === 0) break
    operations.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  const opIds = operations.map((o) => o.id)

  // Comisiones de vendedor existentes (para saber cuáles son editables).
  const sellerRecs: any[] = []
  for (let i = 0; i < opIds.length; i += 200) {
    const { data } = await admin
      .from("commission_records")
      .select("operation_id, amount, status, amount_paid, settled_at")
      .in("operation_id", opIds.slice(i, i + 200))
    sellerRecs.push(...(data || []))
  }
  const sellerByOp = new Map<string, any[]>()
  for (const r of sellerRecs) {
    const a = sellerByOp.get(r.operation_id) || []
    a.push(r)
    sellerByOp.set(r.operation_id, a)
  }

  // Comisiones de referidor existentes PENDING (editables).
  const refRecs: any[] = []
  for (let i = 0; i < opIds.length; i += 200) {
    const { data } = await admin
      .from("referral_commissions")
      .select("operation_id, status")
      .in("operation_id", opIds.slice(i, i + 200))
    refRecs.push(...(data || []))
  }
  const editableReferralOps = new Set(
    refRecs.filter((r) => (r.status ?? "PENDING") === "PENDING").map((r) => r.operation_id)
  )

  // Clasificar operaciones.
  const sellerEditableOps: any[] = [] // A: tienen comisión de vendedor editable
  let lockedOnlyOps = 0 // B: tienen comisión pero toda bloqueada
  const noSellerCommissionOps: any[] = [] // C: sin comisión de vendedor
  let editableSellerSumByCur: Record<string, number> = {}

  for (const op of operations) {
    const rs = sellerByOp.get(op.id) || []
    const editable = rs.filter(isEditableSellerRecord)
    if (rs.length === 0) {
      noSellerCommissionOps.push(op)
    } else if (editable.length === 0) {
      lockedOnlyOps++
    } else {
      sellerEditableOps.push(op)
      const cur = op.sale_currency || op.currency || "USD"
      const sum = editable.reduce((a, r) => a + (Number(r.amount) || 0), 0)
      editableSellerSumByCur[cur] = round2((editableSellerSumByCur[cur] || 0) + sum)
    }
  }

  console.log(`\n${apply ? "APLICANDO" : "DRY-RUN"} — recálculo de comisiones (base neta de IVA)`)
  console.log(`Organización: ${orgId}`)
  console.log(`Agencia:      ${agencyId}`)
  console.log(`Corte:        operaciones con fecha de venta >= ${cutoff}`)
  console.log(`Alícuota:     ${(config.rate * 100).toFixed(2)}%  ·  desde: ${config.from ?? "todas"}\n`)
  console.log(`Operaciones alcanzadas: ${operations.length}`)
  console.log(
    `  A) con comisión de vendedor EDITABLE (se recalculan a neta): ${sellerEditableOps.length}`
  )
  for (const [cur, sum] of Object.entries(editableSellerSumByCur)) {
    const nueva = round2(sum * (1 - config.rate))
    console.log(
      `       ${cur}: suma actual ${sum.toLocaleString("es-AR")} → aprox ${nueva.toLocaleString(
        "es-AR"
      )} (baja ~${round2(sum - nueva).toLocaleString("es-AR")})`
    )
  }
  console.log(`  B) con comisión ya pagada/parcial/saldada (NO se tocan): ${lockedOnlyOps}`)
  console.log(
    `  C) SIN comisión de vendedor cargada (SE SALTEAN, no se crean): ${noSellerCommissionOps.length}`
  )
  console.log(`  Referidores PENDING a recalcular: ${editableReferralOps.size}`)

  if (!apply) {
    console.log(`\nDry-run: no se escribió nada. Reejecutar con --apply para recalcular.`)
    return
  }

  // APLICAR: solo operaciones con comisión editable existente. No se crean nuevas.
  let sellerOk = 0
  let referralOk = 0
  const errors: string[] = []

  for (const op of sellerEditableOps) {
    const operation: CommissionOperation = {
      ...op,
      seller_id: op.seller_id,
      seller_secondary_id: op.seller_secondary_id || null,
      org_id: op.org_id || orgId,
      margin_amount: round2((Number(op.sale_amount_total) || 0) - (Number(op.operator_cost) || 0)),
    }
    try {
      await recalculateOperationCommissions(admin, operation, config)
      sellerOk += 1
    } catch (err: any) {
      errors.push(`op ${op.file_code || op.id} (vendedor): ${err?.message || err}`)
    }
  }

  // Referidores: solo los que ya tienen una comisión PENDING (no se crean nuevos).
  for (const op of operations) {
    if (!editableReferralOps.has(op.id)) continue
    try {
      const { data: mainCustomer } = await admin
        .from("operation_customers")
        .select("customer_id")
        .eq("operation_id", op.id)
        .eq("role", "MAIN")
        .maybeSingle()

      await createOrUpdateReferralCommission({
        supabase: admin as any,
        operationId: op.id,
        customerId: (mainCustomer as any)?.customer_id ?? null,
        marginAmount: round2((Number(op.sale_amount_total) || 0) - (Number(op.operator_cost) || 0)),
        orgId,
        agencyId,
        currency: op.sale_currency || op.currency,
        operationDate: op.operation_date,
      })
      referralOk += 1
    } catch (err: any) {
      errors.push(`op ${op.file_code || op.id} (referidor): ${err?.message || err}`)
    }
  }

  console.log(`\nVendedores recalculados: ${sellerOk}`)
  console.log(`Referidores recalculados: ${referralOk}`)
  if (errors.length > 0) {
    console.log(`Con problemas: ${errors.length}`)
    for (const e of errors.slice(0, 20)) console.log(`  ${e}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
