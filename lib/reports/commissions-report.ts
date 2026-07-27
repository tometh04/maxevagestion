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
 * Asimetría deliberada de `baseSale`: en el total del período la venta de una
 * operación compartida se cuenta UNA vez (si no, la venta base quedaría inflada
 * y el % efectivo saldría a la mitad); en cambio, para cada vendedor se cuenta
 * ENTERA, porque cada uno comisiona sobre la venta completa de la operación.
 */

import { roundMoney } from "@/lib/currency"
import { seriesColor } from "@/lib/reports/palette"
import { monthKeysBetween, monthLabel, safeDiv } from "@/lib/reports/period"
import type { CommissionRecordRow } from "@/lib/commissions/fetch-commission-records"

export type CommissionSellerRole = "primary" | "secondary" | "unknown"

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
  /** Venta de las operaciones en las que participó, entera. */
  baseSale: number
  /** total / baseSale * 100. */
  effectiveRate: number
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
  destination: string
  month: string
  operationDate: string
  sellerId: string
  sellerName: string
  role: CommissionSellerRole
  commissionSplit: number | null
  saleAmount: number
  percentage: number | null
  amount: number
  amountPaid: number
  status: "PENDING" | "PAID"
  datePaid: string | null
  /** true si la operación tiene un segundo vendedor. */
  shared: boolean
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
    /** Venta de las operaciones del período, deduplicada. */
    baseSale: number
    effectiveRate: number
    averagePerSeller: number
    sharedOperations: number
    /** Comisiones del período cuya operación está cancelada (no se cuentan). */
    cancelledRecords: number
    truncated: boolean
    otherCurrency: { currency: string; total: number; count: number } | null
  }
  bySeller: CommissionsReportSeller[]
  byMonth: CommissionsReportMonth[]
  bySellerMonth: CommissionsReportSellerMonth[]
  byAgency: CommissionsReportAgency[]
  byStatus: CommissionsReportStatusRow[]
  detail: CommissionsReportDetailRow[]
}

export interface BuildCommissionsReportParams {
  /** Registros del período en TODAS las monedas. */
  records: CommissionRecordRow[]
  sellerNames: Map<string, string>
  agencyNames: Map<string, string>
  currency: string
  dateFrom: string
  dateTo: string
  cancelledRecords?: number
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
  // Comisión histórica cuyo vendedor ya no figura en la operación (reasignada).
  return "unknown"
}

export function buildCommissionsReport({
  records,
  sellerNames,
  agencyNames,
  currency,
  dateFrom,
  dateTo,
  cancelledRecords = 0,
  truncated = false,
}: BuildCommissionsReportParams): CommissionsReport {
  const inCurrency = records.filter((r) => currencyOf(r) === currency)
  const otherCurrencyCode = currency === "ARS" ? "USD" : "ARS"
  const otherRows = records.filter((r) => currencyOf(r) === otherCurrencyCode)

  const total = inCurrency.reduce((acc, r) => acc + Number(r.amount || 0), 0)

  // ---- Venta base del período (deduplicada por operación) ----
  const saleByOperation = new Map<string, number>()
  const sharedOperationIds = new Set<string>()
  for (const r of inCurrency) {
    const op = r.operations
    if (!op) continue
    saleByOperation.set(op.id, Number(op.sale_amount_total || 0))
    if (op.seller_secondary_id) sharedOperationIds.add(op.id)
  }
  const baseSale = Array.from(saleByOperation.values()).reduce((acc, v) => acc + v, 0)

  // ---- Por vendedor ----
  interface SellerAcc {
    total: number
    pending: number
    paid: number
    amountPaid: number
    count: number
    primaryTotal: number
    secondaryTotal: number
    operations: Set<string>
    saleByOperation: Map<string, number>
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
        operations: new Set<string>(),
        saleByOperation: new Map<string, number>(),
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
    else acc.primaryTotal += amount

    if (r.operations) {
      acc.operations.add(r.operations.id)
      // Cada vendedor comisiona sobre la venta ENTERA de la operación.
      acc.saleByOperation.set(r.operations.id, Number(r.operations.sale_amount_total || 0))
    }

    sellerAcc.set(r.seller_id, acc)
  }

  const bySeller: CommissionsReportSeller[] = Array.from(sellerAcc.entries())
    .map(([sellerId, acc]) => {
      const sellerBaseSale = Array.from(acc.saleByOperation.values()).reduce(
        (sum, v) => sum + v,
        0
      )
      return {
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
        baseSale: sellerBaseSale,
      }
    })
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
      baseSale: roundMoney(row.baseSale),
      effectiveRate: roundMoney(safeDiv(row.total, row.baseSale) * 100, 2),
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
      return {
        id: r.id,
        operationId: r.operation_id,
        fileCode: op?.file_code || "-",
        destination: op?.destination || "-",
        month: operationDate.slice(0, 7),
        operationDate,
        sellerId: r.seller_id,
        sellerName: sellerNames.get(r.seller_id) || "Sin vendedor",
        role: roleOf(r),
        commissionSplit: op?.commission_split ?? null,
        saleAmount: roundMoney(Number(op?.sale_amount_total || 0)),
        percentage: r.percentage != null ? Number(r.percentage) : null,
        amount: roundMoney(Number(r.amount || 0)),
        amountPaid: roundMoney(Number(r.amount_paid || 0)),
        status: statusOf(r.status),
        datePaid: r.date_paid,
        shared: !!op?.seller_secondary_id,
      }
    })
    .sort(
      (a, b) =>
        b.operationDate.localeCompare(a.operationDate) ||
        a.fileCode.localeCompare(b.fileCode) ||
        a.sellerName.localeCompare(b.sellerName)
    )

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
      operationsCount: saleByOperation.size,
      sellersCount: bySeller.length,
      baseSale: roundMoney(baseSale),
      effectiveRate: roundMoney(safeDiv(total, baseSale) * 100, 2),
      averagePerSeller: roundMoney(safeDiv(total, bySeller.length)),
      sharedOperations: sharedOperationIds.size,
      cancelledRecords,
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
  }
}
