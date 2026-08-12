/**
 * Agregación del Reporte de Referidores (VIB-122).
 *
 * Función pura: recibe las comisiones ya leídas por
 * `lib/referrals/fetch-referral-commission-records.ts` y devuelve lo que muestran
 * la pantalla y el PDF. Es el gemelo del Reporte de Comisiones del vendedor, pero
 * centrado en el socio que trajo al cliente.
 *
 * Reglas (idénticas al reporte de comisiones):
 *  - ARS y USD NUNCA se mezclan. El reporte se arma para UNA moneda; el total de
 *    la otra se informa aparte.
 *  - El mes de una comisión lo define `operations.operation_date`, no
 *    `date_calculated`: un recálculo masivo no debe reescribir la historia.
 *  - Hay una sola comisión por operación (constraint UNIQUE en `operation_id`):
 *    no existe el problema de la venta compartida, así que no hay que deduplicar.
 */

import { roundMoney } from "@/lib/currency"
import { seriesColor } from "@/lib/reports/palette"
import { monthKeysBetween, monthLabel, safeDiv } from "@/lib/reports/period"
import {
  customerNameOf,
  type ReferralCommissionRecordRow,
} from "@/lib/referrals/fetch-referral-commission-records"

export interface ReferralsReportPartner {
  partnerId: string
  partnerName: string
  color: string
  total: number
  pending: number
  paid: number
  /** Cobrado a cuenta (pagos parciales de la comisión). */
  amountPaid: number
  count: number
  operationsCount: number
  share: number
}

export interface ReferralsReportMonth {
  key: string
  label: string
  total: number
  pending: number
  paid: number
  count: number
}

export interface ReferralsReportPartnerMonth {
  partnerId: string
  partnerName: string
  /** monthKey → total del referidor en ese mes. */
  cells: Record<string, number>
  total: number
}

export interface ReferralsReportAgency {
  agencyId: string | null
  agencyName: string
  total: number
  pending: number
  paid: number
  count: number
  share: number
}

export interface ReferralsReportStatusRow {
  status: "PENDING" | "PAID"
  label: string
  total: number
  count: number
  share: number
}

export interface ReferralsReportDetailRow {
  id: string
  operationId: string
  fileCode: string
  destination: string
  month: string
  operationDate: string
  partnerId: string
  partnerName: string
  customerName: string | null
  percentage: number | null
  /** Base sobre la que se calculó la comisión (ganancia o venta según config). */
  baseAmount: number | null
  amount: number
  amountPaid: number
  status: "PENDING" | "PAID"
  datePaid: string | null
  /**
   * true si está pagada pero sin salida de caja (flujo viejo, `settlement_id`
   * NULL): la pantalla de Referidos la ofrece regularizar (VIB-86).
   */
  paidWithoutSettlement: boolean
}

export interface ReferralsReport {
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
    partnersCount: number
    averagePerPartner: number
    /** Comisiones del período cuya operación está cancelada (no se cuentan). */
    cancelledRecords: number
    truncated: boolean
    otherCurrency: { currency: string; total: number; count: number } | null
  }
  byPartner: ReferralsReportPartner[]
  byMonth: ReferralsReportMonth[]
  byPartnerMonth: ReferralsReportPartnerMonth[]
  byAgency: ReferralsReportAgency[]
  byStatus: ReferralsReportStatusRow[]
  detail: ReferralsReportDetailRow[]
}

export interface BuildReferralsReportParams {
  /** Registros del período en TODAS las monedas. */
  records: ReferralCommissionRecordRow[]
  partnerNames: Map<string, string>
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

function currencyOf(record: ReferralCommissionRecordRow): string {
  return (
    record.currency ||
    record.operations?.sale_currency ||
    record.operations?.currency ||
    "USD"
  )
}

export function buildReferralsReport({
  records,
  partnerNames,
  agencyNames,
  currency,
  dateFrom,
  dateTo,
  cancelledRecords = 0,
  truncated = false,
}: BuildReferralsReportParams): ReferralsReport {
  const inCurrency = records.filter((r) => currencyOf(r) === currency)
  const otherCurrencyCode = currency === "ARS" ? "USD" : "ARS"
  const otherRows = records.filter((r) => currencyOf(r) === otherCurrencyCode)

  const total = inCurrency.reduce((acc, r) => acc + Number(r.amount || 0), 0)

  // ---- Por referidor ----
  interface PartnerAcc {
    total: number
    pending: number
    paid: number
    amountPaid: number
    count: number
    operations: Set<string>
  }
  const partnerAcc = new Map<string, PartnerAcc>()

  for (const r of inCurrency) {
    const acc =
      partnerAcc.get(r.referral_partner_id) ??
      { total: 0, pending: 0, paid: 0, amountPaid: 0, count: 0, operations: new Set<string>() }

    const amount = Number(r.amount || 0)
    acc.total += amount
    acc.count += 1
    acc.amountPaid += Number(r.amount_paid || 0)
    if (statusOf(r.status) === "PAID") acc.paid += amount
    else acc.pending += amount
    acc.operations.add(r.operation_id)

    partnerAcc.set(r.referral_partner_id, acc)
  }

  const byPartner: ReferralsReportPartner[] = Array.from(partnerAcc.entries())
    .map(([partnerId, acc]) => ({
      partnerId,
      partnerName: partnerNames.get(partnerId) || "Sin referidor",
      total: acc.total,
      pending: acc.pending,
      paid: acc.paid,
      amountPaid: acc.amountPaid,
      count: acc.count,
      operationsCount: acc.operations.size,
    }))
    .sort((a, b) => b.total - a.total || a.partnerName.localeCompare(b.partnerName))
    .map((row, i) => ({
      partnerId: row.partnerId,
      partnerName: row.partnerName,
      color: seriesColor(i),
      total: roundMoney(row.total),
      pending: roundMoney(row.pending),
      paid: roundMoney(row.paid),
      amountPaid: roundMoney(row.amountPaid),
      count: row.count,
      operationsCount: row.operationsCount,
      share: roundMoney(safeDiv(row.total, total) * 100, 1),
    }))

  // ---- Por mes (de operation_date), con los meses vacíos en cero ----
  const monthAcc = new Map<
    string,
    { total: number; pending: number; paid: number; count: number }
  >()
  for (const r of inCurrency) {
    const key = (r.operations?.operation_date || "").slice(0, 7)
    if (!key) continue
    const acc = monthAcc.get(key) ?? { total: 0, pending: 0, paid: 0, count: 0 }
    const amount = Number(r.amount || 0)
    acc.total += amount
    acc.count += 1
    if (statusOf(r.status) === "PAID") acc.paid += amount
    else acc.pending += amount
    monthAcc.set(key, acc)
  }

  const monthKeys = monthKeysBetween(dateFrom, dateTo)
  const keys = monthKeys.length > 0 ? monthKeys : Array.from(monthAcc.keys()).sort()
  const byMonth: ReferralsReportMonth[] = keys.map((key) => {
    const acc = monthAcc.get(key)
    return {
      key,
      label: monthLabel(key),
      total: roundMoney(acc?.total || 0),
      pending: roundMoney(acc?.pending || 0),
      paid: roundMoney(acc?.paid || 0),
      count: acc?.count || 0,
    }
  })

  // ---- Matriz referidor × mes ----
  const cellAcc = new Map<string, Map<string, number>>()
  for (const r of inCurrency) {
    const key = (r.operations?.operation_date || "").slice(0, 7)
    if (!key) continue
    const row = cellAcc.get(r.referral_partner_id) ?? new Map<string, number>()
    row.set(key, (row.get(key) || 0) + Number(r.amount || 0))
    cellAcc.set(r.referral_partner_id, row)
  }
  const byPartnerMonth: ReferralsReportPartnerMonth[] = byPartner.map((partner) => {
    const row = cellAcc.get(partner.partnerId) ?? new Map<string, number>()
    const cells: Record<string, number> = {}
    for (const key of keys) cells[key] = roundMoney(row.get(key) || 0)
    return {
      partnerId: partner.partnerId,
      partnerName: partner.partnerName,
      cells,
      total: partner.total,
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
  const byAgency: ReferralsReportAgency[] = Array.from(agencyAcc.entries())
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

  const byStatus: ReferralsReportStatusRow[] = [
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
  const detail: ReferralsReportDetailRow[] = inCurrency
    .map((r) => {
      const op = r.operations
      const operationDate = op?.operation_date || ""
      const status = statusOf(r.status)
      return {
        id: r.id,
        operationId: r.operation_id,
        fileCode: op?.file_code || "-",
        destination: op?.destination || "-",
        month: operationDate.slice(0, 7),
        operationDate,
        partnerId: r.referral_partner_id,
        partnerName: partnerNames.get(r.referral_partner_id) || "Sin referidor",
        customerName: customerNameOf(r),
        percentage: r.percentage != null ? Number(r.percentage) : null,
        baseAmount: r.base_amount != null ? roundMoney(Number(r.base_amount)) : null,
        amount: roundMoney(Number(r.amount || 0)),
        amountPaid: roundMoney(Number(r.amount_paid || 0)),
        status,
        datePaid: r.date_paid,
        paidWithoutSettlement: status === "PAID" && !r.settlement_id,
      }
    })
    .sort(
      (a, b) =>
        b.operationDate.localeCompare(a.operationDate) ||
        a.partnerName.localeCompare(b.partnerName) ||
        a.fileCode.localeCompare(b.fileCode)
    )

  const operationIds = new Set(inCurrency.map((r) => r.operation_id))
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
      partnersCount: byPartner.length,
      averagePerPartner: roundMoney(safeDiv(total, byPartner.length)),
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
    byPartner,
    byMonth,
    byPartnerMonth,
    byAgency,
    byStatus,
    detail,
  }
}
