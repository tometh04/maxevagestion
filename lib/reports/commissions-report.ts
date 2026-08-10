/**
 * Agregación del Reporte de Comisiones (VIB-65).
 *
 * Función pura: recibe los registros ya leídos por
 * `lib/commissions/fetch-commission-records.ts` y devuelve lo que muestran la
 * pantalla y el PDF.
 *
 * Reglas:
 *  - ARS y USD NUNCA se mezclan. El reporte se arma para UNA moneda (la de la
 *    venta de cada operación); el total de la otra se informa aparte. La pantalla
 *    de Comisiones actual sí las suma en un mismo total: eso no se replica.
 *  - El mes de una comisión lo define `operations.operation_date`, no
 *    `date_calculated`: un recálculo masivo no debe reescribir la historia.
 *  - Operaciones compartidas: el constraint (operation_id, seller_id) hace que
 *    una venta compartida tenga dos filas, una por vendedor. El rol se deriva
 *    comparando contra `operations.seller_id` / `seller_secondary_id`.
 *
 * El reporte NO expone la economía del paquete (VIB-94). Antes publicaba la
 * venta base del período y un "% efectivo" = comisiones / venta base, y ese
 * número no era el porcentaje de nadie: las comisiones se calculan sobre el
 * MARGEN de la operación (ver `lib/commissions/calculate.ts`), no sobre la
 * venta, así que la fila mostraba tres números que no cerraban entre sí. Lo que
 * se le presenta a un vendedor es lo suyo: qué operación y cuánto comisionó.
 */

import { roundMoney } from "@/lib/currency"
import { seriesColor } from "@/lib/reports/palette"
import { monthKeysBetween, monthLabel, safeDiv } from "@/lib/reports/period"
import type {
  CommissionRecordRow,
  ReferralInfo,
} from "@/lib/commissions/fetch-commission-records"

export type CommissionSellerRole =
  | "primary"
  | "secondary"
  /** No vendió: cobra por administrar al vendedor de la operación (VIB-102). */
  | "advisor_manager"
  | "unknown"

export interface CommissionsReportSeller {
  sellerId: string
  sellerName: string
  color: string
  total: number
  pending: number
  paid: number
  /** Cobrado a cuenta (pagos parciales de la comisión). */
  amountPaid: number
  count: number
  operationsCount: number
  primaryTotal: number
  secondaryTotal: number
  /** Lo que cobró por administrar a otros vendedores, no por vender (VIB-102). */
  advisorManagerTotal: number
  share: number
}

export interface CommissionsReportMonth {
  key: string
  label: string
  total: number
  pending: number
  paid: number
  count: number
  operationsCount: number
}

export interface CommissionsReportAgency {
  agencyId: string | null
  agencyName: string
  total: number
  pending: number
  paid: number
  count: number
  share: number
}

export interface CommissionsReportStatusRow {
  status: "PENDING" | "PAID"
  label: string
  total: number
  count: number
  share: number
}

export interface CommissionsReportSellerMonth {
  sellerId: string
  sellerName: string
  /** monthKey → total del vendedor en ese mes. */
  cells: Record<string, number>
  total: number
}

export interface CommissionsReportDetailRow {
  id: string
  operationId: string
  fileCode: string
  /**
   * Pasajero principal de la operación. Es lo que se muestra para identificar
   * la fila: el vendedor reconoce al pasajero, no el código (pedido de Lozada).
   * Vacío cuando la operación no tiene pasajero principal cargado.
   */
  passengerName: string
  destination: string
  month: string
  operationDate: string
  sellerId: string
  sellerName: string
  role: CommissionSellerRole
  commissionSplit: number | null
  /** Solo con `include.sale`. Null = no se pidió incluirlo. */
  saleAmount: number | null
  /** Solo con `include.margin`: la ganancia de la operación. */
  marginAmount: number | null
  percentage: number | null
  amount: number
  amountPaid: number
  status: "PENDING" | "PAID"
  datePaid: string | null
  /** true si la operación tiene un segundo vendedor. */
  shared: boolean
  /** El otro vendedor de la venta compartida, visto desde esta fila. */
  counterpartName: string | null
  /**
   * Solo con `role = 'advisor_manager'`: el vendedor administrado que generó la
   * comisión. Es lo único que explica por qué esta persona cobra una operación
   * que no vendió.
   */
  managedSellerName: string | null
  /** Socio que refirió al cliente, si la venta vino por un referido. */
  referralPartnerName: string | null
}

/** Fila de la sección de referidos: lo que le toca al socio, no al vendedor. */
export interface CommissionsReportReferralPartner {
  partnerId: string
  partnerName: string
  operationsCount: number
  total: number
  pending: number
  paid: number
}

export interface CommissionsReport {
  currency: string
  dateFrom: string
  dateTo: string
  summary: {
    total: number
    pending: number
    paid: number
    amountPaid: number
    count: number
    operationsCount: number
    sellersCount: number
    averagePerSeller: number
    sharedOperations: number
    /** Operaciones del período que vinieron por un socio referidor. */
    referredOperations: number
    /** Comisiones del período cuya operación está cancelada (no se cuentan). */
    cancelledRecords: number
    /** Comisiones del período saldadas sin pago (no se cuentan). */
    settledRecords: number
    truncated: boolean
    otherCurrency: { currency: string; total: number; count: number } | null
  }
  bySeller: CommissionsReportSeller[]
  byMonth: CommissionsReportMonth[]
  bySellerMonth: CommissionsReportSellerMonth[]
  byAgency: CommissionsReportAgency[]
  byStatus: CommissionsReportStatusRow[]
  detail: CommissionsReportDetailRow[]
  /**
   * Comisiones de los socios referidores del período. Vacío si no se pidieron.
   * Van en su propia sección y NUNCA suman a `summary.total`: es plata del
   * socio, no del vendedor.
   */
  byReferralPartner: CommissionsReportReferralPartner[]
}

export interface BuildCommissionsReportParams {
  /** Registros del período en TODAS las monedas. */
  records: CommissionRecordRow[]
  sellerNames: Map<string, string>
  agencyNames: Map<string, string>
  /** operationId → referido. Ausente = ninguna venta vino referida. */
  referralPartners?: Map<string, ReferralInfo>
  /** operationId → pasajero principal. Ausente = se muestra el código. */
  mainPassengers?: Map<string, string>
  /** Qué datos de la agencia incluir. Default: ninguno. */
  include?: { sale?: boolean; margin?: boolean; referrals?: boolean }
  currency: string
  dateFrom: string
  dateTo: string
  cancelledRecords?: number
  settledRecords?: number
  truncated?: boolean
}

function statusOf(raw: string): "PENDING" | "PAID" {
  return String(raw).toUpperCase() === "PAID" ? "PAID" : "PENDING"
}

function currencyOf(record: CommissionRecordRow): string {
  return record.operations?.sale_currency || record.operations?.currency || "USD"
}

function roleOf(record: CommissionRecordRow): CommissionSellerRole {
  const op = record.operations
  if (!op) return "unknown"
  if (op.seller_id && op.seller_id === record.seller_id) return "primary"
  if (op.seller_secondary_id && op.seller_secondary_id === record.seller_id) return "secondary"
  // El administrador del vendedor no figura en la operación y es correcto que
  // no figure: sin este chequeo su comisión se leería como "huérfana", que es
  // la marca que el reporte usa para señalar datos inconsistentes.
  if (record.kind === "ADVISOR_MANAGER") return "advisor_manager"
  // Comisión histórica cuyo vendedor ya no figura en la operación (reasignada).
  return "unknown"
}

/**
 * El otro vendedor de una venta compartida, visto desde esta comisión. Null si
 * la venta no es compartida o si el vendedor ya no figura en la operación: en
 * ese caso no hay "socio" que nombrar, sólo una comisión huérfana.
 */
function counterpartOf(
  record: CommissionRecordRow,
  role: CommissionSellerRole
): string | null {
  const op = record.operations
  if (!op?.seller_secondary_id) return null
  if (role === "primary") return op.seller_secondary_id
  if (role === "secondary") return op.seller_id ?? null
  return null
}

export function buildCommissionsReport({
  records,
  sellerNames,
  agencyNames,
  referralPartners,
  mainPassengers,
  include,
  currency,
  dateFrom,
  dateTo,
  cancelledRecords = 0,
  settledRecords = 0,
  truncated = false,
}: BuildCommissionsReportParams): CommissionsReport {
  const inCurrency = records.filter((r) => currencyOf(r) === currency)
  const otherCurrencyCode = currency === "ARS" ? "USD" : "ARS"
  const otherRows = records.filter((r) => currencyOf(r) === otherCurrencyCode)

  const total = inCurrency.reduce((acc, r) => acc + Number(r.amount || 0), 0)

  // ---- Operaciones del período (deduplicadas: una compartida es UNA venta) ----
  const operationIds = new Set<string>()
  const sharedOperationIds = new Set<string>()
  const referredOperationIds = new Set<string>()
  for (const r of inCurrency) {
    const op = r.operations
    if (!op) continue
    operationIds.add(op.id)
    if (op.seller_secondary_id) sharedOperationIds.add(op.id)
    if (referralPartners?.has(op.id)) referredOperationIds.add(op.id)
  }

  // ---- Por vendedor ----
  interface SellerAcc {
    total: number
    pending: number
    paid: number
    amountPaid: number
    count: number
    primaryTotal: number
    secondaryTotal: number
    advisorManagerTotal: number
    operations: Set<string>
  }
  const sellerAcc = new Map<string, SellerAcc>()

  for (const r of inCurrency) {
    const acc =
      sellerAcc.get(r.seller_id) ??
      {
        total: 0,
        pending: 0,
        paid: 0,
        amountPaid: 0,
        count: 0,
        primaryTotal: 0,
        secondaryTotal: 0,
        advisorManagerTotal: 0,
        operations: new Set<string>(),
      }

    const amount = Number(r.amount || 0)
    const status = statusOf(r.status)
    acc.total += amount
    acc.count += 1
    acc.amountPaid += Number(r.amount_paid || 0)
    if (status === "PAID") acc.paid += amount
    else acc.pending += amount

    const role = roleOf(r)
    if (role === "secondary") acc.secondaryTotal += amount
    else if (role === "advisor_manager") acc.advisorManagerTotal += amount
    else acc.primaryTotal += amount

    if (r.operations) acc.operations.add(r.operations.id)

    sellerAcc.set(r.seller_id, acc)
  }

  const bySeller: CommissionsReportSeller[] = Array.from(sellerAcc.entries())
    .map(([sellerId, acc]) => ({
      sellerId,
      sellerName: sellerNames.get(sellerId) || "Sin vendedor",
      total: acc.total,
      pending: acc.pending,
      paid: acc.paid,
      amountPaid: acc.amountPaid,
      count: acc.count,
      operationsCount: acc.operations.size,
      primaryTotal: acc.primaryTotal,
      secondaryTotal: acc.secondaryTotal,
      advisorManagerTotal: acc.advisorManagerTotal,
    }))
    .sort((a, b) => b.total - a.total || a.sellerName.localeCompare(b.sellerName))
    .map((row, i) => ({
      sellerId: row.sellerId,
      sellerName: row.sellerName,
      color: seriesColor(i),
      total: roundMoney(row.total),
      pending: roundMoney(row.pending),
      paid: roundMoney(row.paid),
      amountPaid: roundMoney(row.amountPaid),
      count: row.count,
      operationsCount: row.operationsCount,
      primaryTotal: roundMoney(row.primaryTotal),
      secondaryTotal: roundMoney(row.secondaryTotal),
      advisorManagerTotal: roundMoney(row.advisorManagerTotal),
      share: roundMoney(safeDiv(row.total, total) * 100, 1),
    }))

  // ---- Por mes (de operation_date), con los meses vacíos en cero ----
  const monthAcc = new Map<
    string,
    { total: number; pending: number; paid: number; count: number; operations: Set<string> }
  >()
  for (const r of inCurrency) {
    const key = (r.operations?.operation_date || "").slice(0, 7)
    if (!key) continue
    const acc =
      monthAcc.get(key) ??
      { total: 0, pending: 0, paid: 0, count: 0, operations: new Set<string>() }
    const amount = Number(r.amount || 0)
    acc.total += amount
    acc.count += 1
    if (statusOf(r.status) === "PAID") acc.paid += amount
    else acc.pending += amount
    if (r.operations) acc.operations.add(r.operations.id)
    monthAcc.set(key, acc)
  }

  const monthKeys = monthKeysBetween(dateFrom, dateTo)
  const keys = monthKeys.length > 0 ? monthKeys : Array.from(monthAcc.keys()).sort()
  const byMonth: CommissionsReportMonth[] = keys.map((key) => {
    const acc = monthAcc.get(key)
    return {
      key,
      label: monthLabel(key),
      total: roundMoney(acc?.total || 0),
      pending: roundMoney(acc?.pending || 0),
      paid: roundMoney(acc?.paid || 0),
      count: acc?.count || 0,
      operationsCount: acc?.operations.size || 0,
    }
  })

  // ---- Matriz vendedor × mes ----
  const cellAcc = new Map<string, Map<string, number>>()
  for (const r of inCurrency) {
    const key = (r.operations?.operation_date || "").slice(0, 7)
    if (!key) continue
    const row = cellAcc.get(r.seller_id) ?? new Map<string, number>()
    row.set(key, (row.get(key) || 0) + Number(r.amount || 0))
    cellAcc.set(r.seller_id, row)
  }
  const bySellerMonth: CommissionsReportSellerMonth[] = bySeller.map((seller) => {
    const row = cellAcc.get(seller.sellerId) ?? new Map<string, number>()
    const cells: Record<string, number> = {}
    for (const key of keys) cells[key] = roundMoney(row.get(key) || 0)
    return {
      sellerId: seller.sellerId,
      sellerName: seller.sellerName,
      cells,
      total: seller.total,
    }
  })

  // ---- Por agencia ----
  const agencyAcc = new Map<
    string,
    { total: number; pending: number; paid: number; count: number }
  >()
  for (const r of inCurrency) {
    const key = r.operations?.agency_id || ""
    const acc = agencyAcc.get(key) ?? { total: 0, pending: 0, paid: 0, count: 0 }
    const amount = Number(r.amount || 0)
    acc.total += amount
    acc.count += 1
    if (statusOf(r.status) === "PAID") acc.paid += amount
    else acc.pending += amount
    agencyAcc.set(key, acc)
  }
  const byAgency: CommissionsReportAgency[] = Array.from(agencyAcc.entries())
    .map(([key, acc]) => ({
      agencyId: key || null,
      agencyName: key ? agencyNames.get(key) || "Sin agencia" : "Sin agencia",
      total: roundMoney(acc.total),
      pending: roundMoney(acc.pending),
      paid: roundMoney(acc.paid),
      count: acc.count,
      share: roundMoney(safeDiv(acc.total, total) * 100, 1),
    }))
    .sort((a, b) => b.total - a.total || a.agencyName.localeCompare(b.agencyName))

  // ---- Por estado ----
  const pending = inCurrency
    .filter((r) => statusOf(r.status) === "PENDING")
    .reduce((acc, r) => acc + Number(r.amount || 0), 0)
  const paid = inCurrency
    .filter((r) => statusOf(r.status) === "PAID")
    .reduce((acc, r) => acc + Number(r.amount || 0), 0)
  const pendingCount = inCurrency.filter((r) => statusOf(r.status) === "PENDING").length
  const paidCount = inCurrency.length - pendingCount

  const byStatus: CommissionsReportStatusRow[] = [
    {
      status: "PENDING" as const,
      label: "Por pagar",
      total: roundMoney(pending),
      count: pendingCount,
      share: roundMoney(safeDiv(pending, total) * 100, 1),
    },
    {
      status: "PAID" as const,
      label: "Pagadas",
      total: roundMoney(paid),
      count: paidCount,
      share: roundMoney(safeDiv(paid, total) * 100, 1),
    },
  ]

  // ---- Detalle ----
  const detail: CommissionsReportDetailRow[] = inCurrency
    .map((r) => {
      const op = r.operations
      const operationDate = op?.operation_date || ""
      const role = roleOf(r)
      const counterpartId = counterpartOf(r, role)
      return {
        id: r.id,
        operationId: r.operation_id,
        fileCode: op?.file_code || "-",
        passengerName: (op && mainPassengers?.get(op.id)) || "",
        destination: op?.destination || "-",
        month: operationDate.slice(0, 7),
        operationDate,
        sellerId: r.seller_id,
        sellerName: sellerNames.get(r.seller_id) || "Sin vendedor",
        role,
        commissionSplit: op?.commission_split ?? null,
        saleAmount: include?.sale ? roundMoney(Number(op?.sale_amount_total || 0)) : null,
        marginAmount: include?.margin ? roundMoney(Number(op?.margin_amount || 0)) : null,
        percentage: r.percentage != null ? Number(r.percentage) : null,
        amount: roundMoney(Number(r.amount || 0)),
        amountPaid: roundMoney(Number(r.amount_paid || 0)),
        status: statusOf(r.status),
        datePaid: r.date_paid,
        shared: !!op?.seller_secondary_id,
        counterpartName: counterpartId ? sellerNames.get(counterpartId) || null : null,
        managedSellerName:
          role === "advisor_manager" && r.source_seller_id
            ? sellerNames.get(r.source_seller_id) || null
            : null,
        referralPartnerName: (op && referralPartners?.get(op.id)?.partnerName) || null,
      }
    })
    .sort(
      (a, b) =>
        b.operationDate.localeCompare(a.operationDate) ||
        a.fileCode.localeCompare(b.fileCode) ||
        a.sellerName.localeCompare(b.sellerName)
    )

  // ---- Referidos (sección aparte, nunca suman al total del vendedor) ----
  //
  // Se recorren las operaciones del período una sola vez: una venta compartida
  // tiene dos comisiones de vendedor, pero un solo referido, y contarlo dos
  // veces duplicaría lo que la agencia le debe al socio.
  const referralAcc = new Map<
    string,
    { partnerName: string; total: number; pending: number; paid: number; operations: Set<string> }
  >()
  if (include?.referrals && referralPartners) {
    for (const operationId of Array.from(operationIds)) {
      const referral = referralPartners.get(operationId)
      if (!referral) continue
      const acc =
        referralAcc.get(referral.partnerId) ?? {
          partnerName: referral.partnerName,
          total: 0,
          pending: 0,
          paid: 0,
          operations: new Set<string>(),
        }
      acc.total += referral.amount
      if (statusOf(referral.status) === "PAID") acc.paid += referral.amount
      else acc.pending += referral.amount
      acc.operations.add(operationId)
      referralAcc.set(referral.partnerId, acc)
    }
  }

  const byReferralPartner: CommissionsReportReferralPartner[] = Array.from(referralAcc.entries())
    .map(([partnerId, acc]) => ({
      partnerId,
      partnerName: acc.partnerName,
      operationsCount: acc.operations.size,
      total: roundMoney(acc.total),
      pending: roundMoney(acc.pending),
      paid: roundMoney(acc.paid),
    }))
    .sort((a, b) => b.total - a.total || a.partnerName.localeCompare(b.partnerName))

  const otherTotal = otherRows.reduce((acc, r) => acc + Number(r.amount || 0), 0)

  return {
    currency,
    dateFrom,
    dateTo,
    summary: {
      total: roundMoney(total),
      pending: roundMoney(pending),
      paid: roundMoney(paid),
      amountPaid: roundMoney(
        inCurrency.reduce((acc, r) => acc + Number(r.amount_paid || 0), 0)
      ),
      count: inCurrency.length,
      operationsCount: operationIds.size,
      sellersCount: bySeller.length,
      averagePerSeller: roundMoney(safeDiv(total, bySeller.length)),
      sharedOperations: sharedOperationIds.size,
      referredOperations: referredOperationIds.size,
      cancelledRecords,
      settledRecords,
      truncated,
      otherCurrency: otherRows.length
        ? {
            currency: otherCurrencyCode,
            total: roundMoney(otherTotal),
            count: otherRows.length,
          }
        : null,
    },
    bySeller,
    byMonth,
    bySellerMonth,
    byAgency,
    byStatus,
    detail,
    byReferralPartner,
  }
}
