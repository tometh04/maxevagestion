/**
 * Auditoría de servicios adicionales impagos en la deuda del cliente (READ-ONLY).
 *
 * Para una org, mide cuánto cambiaría la deuda del cliente (cuentas por cobrar)
 * al activar la flag `features.include_services_in_sale_total`, y flaggea las
 * operaciones sospechosas de DOBLE CONTEO antes de prender:
 *
 *   debtOff = max(0, S − P)                (comportamiento actual)
 *   debtOn  = max(0, S + Σsvc − P)         (con la flag ON)
 *   delta   = debtOn − debtOff             (el agujero real que aparece)
 *
 * donde, EN LA MONEDA DE VENTA de la op:
 *   S    = sale_amount_total (viaje base)
 *   Σsvc = Σ operation_services.sale_amount con sale_currency == moneda de venta
 *   P    = Σ pagos netos del cliente (INCOME − EXPENSE, PAID, payer_type=CUSTOMER)
 *
 * Flags de riesgo:
 *   suspectWipe  → sale_amount_total ≈ Σsvc (todas las monedas): el recalc pisó
 *                  la venta base con los servicios. Sumar servicios cuenta doble.
 *   suspectAllIn → el cliente ya pagó casi todo (P ≥ S*0.99) y hay servicios con
 *                  payment_id: probable "todo en la base + servicio de tracking".
 *
 * Solo cuenta como "agujero legítimo" el delta de ops NO sospechosas.
 *
 * Run: npx tsx scripts/audit-customer-debt-services.ts [orgId]
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ORG_ID = process.argv[2] || "586bca09-029e-4cc9-8762-2ad01d468428" // VICO por defecto

const round = (n: number) => Math.round(n * 100) / 100
const EPS = 0.5 // tolerancia para comparar S vs Σsvc (misma-plata)
const MATERIAL_MIN = 50 // umbral de materialidad del delta (en moneda de venta)

async function fetchAll<T>(build: (from: number, to: number) => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return out
}

;(async () => {
  const { data: flagRow } = await admin
    .from("organization_settings")
    .select("value")
    .eq("org_id", ORG_ID)
    .eq("key", "features.include_services_in_sale_total")
    .maybeSingle()
  const flagOn = ["true", "1", "yes"].includes(String(flagRow?.value ?? "").trim().toLowerCase())
  console.log(`\nAuditoría servicios en deuda — org ${ORG_ID}`)
  console.log(`Flag include_services_in_sale_total: ${flagOn ? "ON" : "OFF"}\n`)

  const operations = await fetchAll<any>((f, t) =>
    admin
      .from("operations")
      .select("id, file_code, status, sale_amount_total, sale_currency, currency")
      .eq("org_id", ORG_ID)
      .neq("status", "CANCELLED")
      .range(f, t)
  )
  const opIds = operations.map((o) => o.id)
  const saleCurByOp: Record<string, string> = {}
  for (const o of operations) saleCurByOp[o.id] = o.sale_currency || o.currency || "USD"

  // Servicios por operación (todas las monedas, para detectar wipe).
  const services = await fetchAll<any>((f, t) =>
    admin
      .from("operation_services")
      .select("operation_id, sale_amount, sale_currency, payment_id")
      .range(f, t)
  )
  const svcSameCurByOp: Record<string, number> = {}
  const svcAllCurByOp: Record<string, number> = {}
  const svcHasPaymentByOp: Record<string, boolean> = {}
  for (const s of services) {
    const opId = s.operation_id
    if (!(opId in saleCurByOp)) continue // op no está en el set (cancelada u otra org)
    const amt = Number(s.sale_amount) || 0
    svcAllCurByOp[opId] = (svcAllCurByOp[opId] || 0) + amt
    if (s.sale_currency === saleCurByOp[opId]) {
      svcSameCurByOp[opId] = (svcSameCurByOp[opId] || 0) + amt
    }
    if (s.payment_id) svcHasPaymentByOp[opId] = true
  }

  // Pagos netos del cliente por operación, en la moneda de venta (nominal).
  const paidByOp: Record<string, number> = {}
  const chunk = 200
  for (let i = 0; i < opIds.length; i += chunk) {
    const slice = opIds.slice(i, i + chunk)
    const payments = await fetchAll<any>((f, t) =>
      admin
        .from("payments")
        .select("operation_id, amount, currency, status, direction, payer_type")
        .in("operation_id", slice)
        .eq("org_id", ORG_ID)
        .eq("payer_type", "CUSTOMER")
        .range(f, t)
    )
    for (const p of payments) {
      if (p.status !== "PAID") continue
      if (p.direction !== "INCOME" && p.direction !== "EXPENSE") continue
      // Nominal: sin conversión (aproximación de auditoría; el fix netea en la moneda de venta).
      const sign = p.direction === "EXPENSE" ? -1 : 1
      paidByOp[p.operation_id] = (paidByOp[p.operation_id] || 0) + sign * (Number(p.amount) || 0)
    }
  }

  let totalDeltaLegit = 0
  let opsWithUnpaidSvc = 0
  let nWipe = 0
  let nAllIn = 0
  const rows: any[] = []

  for (const op of operations) {
    const S = Number(op.sale_amount_total) || 0
    const svcSame = round(svcSameCurByOp[op.id] || 0)
    const svcAll = round(svcAllCurByOp[op.id] || 0)
    if (svcSame <= 0) continue // sin servicios en la moneda de venta → no cambia

    const P = round(paidByOp[op.id] || 0)
    const debtOff = Math.max(0, round(S - P))
    const debtOn = Math.max(0, round(S + svcSame - P))
    const delta = round(debtOn - debtOff)

    const suspectWipe = svcAll > 0 && Math.abs(S - svcAll) < EPS
    const suspectAllIn = svcSame > 0 && P >= S * 0.99 && !!svcHasPaymentByOp[op.id]

    if (debtOn > debtOff + 0.01) opsWithUnpaidSvc++
    if (suspectWipe) nWipe++
    if (suspectAllIn) nAllIn++
    if (!suspectWipe && !suspectAllIn && delta >= MATERIAL_MIN) totalDeltaLegit += delta

    if (delta >= 0.01 || suspectWipe || suspectAllIn) {
      rows.push({
        op: op.file_code || op.id.slice(0, 8),
        status: op.status,
        ccy: saleCurByOp[op.id],
        S: round(S),
        svc: svcSame,
        P,
        debtOff,
        debtOn,
        delta,
        wipe: suspectWipe ? "⚠" : "",
        allIn: suspectAllIn ? "⚠" : "",
      })
    }
  }

  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  console.log(`Operaciones (no canceladas): ${operations.length}`)
  console.log(`Con servicios en la moneda de venta: ${rows.length}`)
  console.log(`Con servicio impago (delta > 0): ${opsWithUnpaidSvc}`)
  console.log(`Agujero legítimo estimado (delta de ops NO sospechosas ≥ ${MATERIAL_MIN}): ${round(totalDeltaLegit)} (nominal, moneda de venta)`)
  console.log(`⚠ suspectWipe (base pisada por servicios): ${nWipe}`)
  console.log(`⚠ suspectAllIn (base ya incluye el servicio): ${nAllIn}\n`)

  if (rows.length > 0) {
    console.table(rows.slice(0, 50))
    if (rows.length > 50) console.log(`... y ${rows.length - 50} más`)
  }

  if (nWipe > 0 || nAllIn > 0) {
    console.log(
      `\n⚠ Hay ${nWipe + nAllIn} operaciones sospechosas de doble conteo. Revisalas ANTES de prender la flag para esta org.`
    )
  } else {
    console.log(`\n✔ Sin operaciones sospechosas de doble conteo. Seguro prender la flag.`)
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
