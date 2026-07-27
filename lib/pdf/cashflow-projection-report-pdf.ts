/**
 * Generador del PDF "Reporte de Caja y flujo proyectado" (VIB-67).
 *
 * Función pura sobre `lib/pdf/report-kit.ts`.
 *
 * A diferencia de los otros tres reportes, este NO tiene selector de moneda:
 * pesos y dólares se presentan en bloques separados, uno debajo del otro. Una
 * deuda en pesos no se cancela con dólares, así que sumarlas daría un número
 * que no sirve para decidir nada.
 */

import type { ReportCompany } from "@/lib/reports/report-company"
import type {
  CashflowAmounts,
  CashflowProjectionReport,
} from "@/lib/reports/cashflow-projection-report"
import { NO_DATE_KEY } from "@/lib/reports/cashflow-projection-report"
import type { CashflowProjectionReportFilters } from "@/lib/reports/cashflow-projection-report-data"
import {
  REPORT_COLORS,
  REPORT_GEOMETRY,
  ReportPdfBuilder,
  drawStackedBarChart,
  fmtDate,
  fmtDateTime,
  fmtMoney,
} from "@/lib/pdf/report-kit"

const { DARK, GRAY, DANGER, SUCCESS } = REPORT_COLORS
const { MARGIN, CONTENT_W, RIGHT } = REPORT_GEOMETRY

const MAX_OVERDUE_ROWS = 40

export interface CashflowProjectionReportPdfParams {
  report: CashflowProjectionReport
  filters: CashflowProjectionReportFilters
  company: ReportCompany
  generatedAt?: Date
}

export function generateCashflowProjectionReportPdf({
  report,
  filters,
  company,
  generatedAt = new Date(),
}: CashflowProjectionReportPdfParams): ArrayBuffer {
  const b = new ReportPdfBuilder({
    company,
    generatedAt,
    title: "REPORTE DE CAJA",
    subtitle: `Al ${fmtDate(report.today)}`,
    meta: `Tramos: ${report.tramos.join(" · ")} días`,
    continuationLine: `Reporte de caja · al ${fmtDate(report.today)}`,
  })
  const doc = b.doc

  b.coverBand()

  b.filtersLine([
    `Agencia: ${filters.agencyName || "Todas"}`,
    `Tramos: ${report.tramos.join(", ")} días`,
    `Generado: ${fmtDateTime(generatedAt)}`,
  ])

  const hasMovement = (currency: keyof CashflowAmounts) =>
    report.summary.totalReceivable[currency] !== 0 ||
    report.summary.totalPayable[currency] !== 0 ||
    report.balances.totals[currency] !== 0

  const currencies = (["ARS", "USD"] as const).filter(hasMovement)

  if (currencies.length === 0) {
    b.emptyState(
      "Sin movimientos por cobrar ni por pagar",
      `Al ${fmtDate(report.today)} no hay cobranzas pendientes, deuda con operadores ni saldo en cuentas.`
    )
    return b.finish()
  }

  for (const currency of currencies) {
    const money = (amount: number) => fmtMoney(amount, currency)
    const label = currency === "ARS" ? "Pesos (ARS)" : "Dólares (USD)"

    b.ensure(40)
    b.sectionTitle(
      label,
      `Saldo, vencimientos y proyección en ${currency}. No se mezcla con la otra moneda.`
    )

    b.kpiRow([
      {
        label: "Saldo en cuentas hoy",
        value: money(report.balances.totals[currency]),
        hint: `${report.balances.byAccount.filter((a) => a.currency === currency).length} cuenta(s)`,
        accent: true,
      },
      {
        label: "Vencido a cobrar",
        value: money(report.summary.overdueReceivable[currency]),
        hint: `${report.summary.overdueReceivableCount[currency]} operación(es) vencida(s)`,
      },
      {
        label: "Vencido a pagar",
        value: money(report.summary.overduePayable[currency]),
        hint: `${report.summary.overduePayableCount[currency]} pago(s) vencido(s)`,
      },
      {
        label: "Neto del horizonte",
        value: money(report.summary.horizonNet[currency]),
        hint:
          report.summary.firstShortfall[currency]
            ? "Hay un tramo con saldo negativo"
            : "Sin faltantes proyectados",
      },
    ])

    // ---- Tramos ----
    const bucketRows = report.buckets.filter(
      (bucket) =>
        bucket.receivable[currency] !== 0 ||
        bucket.payable[currency] !== 0 ||
        bucket.key !== NO_DATE_KEY
    )

    b.ensure(20 + bucketRows.length * 7)
    b.sectionTitle("Vencimientos por tramo")
    b.table({
      rows: bucketRows,
      columns: [
        {
          header: "TRAMO",
          x: MARGIN + 2,
          width: 42,
          cell: (r) => r.label,
          color: (r) => (r.key === "OVERDUE" ? DANGER : DARK),
        },
        {
          header: "A COBRAR",
          x: MARGIN + 82,
          align: "right",
          cell: (r) => money(r.receivable[currency]),
        },
        {
          header: "OPS",
          x: MARGIN + 94,
          align: "right",
          cell: (r) => String(r.receivableCount[currency]),
        },
        {
          header: "A PAGAR",
          x: MARGIN + 134,
          align: "right",
          cell: (r) => money(r.payable[currency]),
        },
        {
          header: "PAGOS",
          x: MARGIN + 146,
          align: "right",
          cell: (r) => String(r.payableCount[currency]),
        },
        {
          header: "NETO",
          x: RIGHT - 2,
          align: "right",
          cell: (r) => money(r.net[currency]),
          bold: true,
          color: (r) => (r.net[currency] < 0 ? DANGER : DARK),
        },
      ],
      total: {
        cells: [
          { x: MARGIN + 2, text: "TOTAL" },
          {
            x: MARGIN + 82,
            align: "right",
            text: money(report.summary.totalReceivable[currency]),
          },
          {
            x: MARGIN + 134,
            align: "right",
            text: money(report.summary.totalPayable[currency]),
          },
          {
            x: RIGHT - 2,
            align: "right",
            text: money(
              report.summary.totalReceivable[currency] - report.summary.totalPayable[currency]
            ),
          },
        ],
      },
    })

    // ---- Gráfico cobrar vs pagar ----
    const chartBuckets = report.buckets.filter((bucket) => bucket.key !== NO_DATE_KEY)
    if (chartBuckets.some((bk) => bk.receivable[currency] || bk.payable[currency])) {
      b.ensure(64)
      b.sectionTitle("A cobrar y a pagar por tramo")
      b.y = drawStackedBarChart(doc, {
        x: MARGIN,
        y: b.y,
        width: CONTENT_W,
        height: 40,
        mode: "grouped",
        buckets: chartBuckets.map((bk) => ({
          label: bk.label,
          segments: [bk.receivable[currency], bk.payable[currency]],
        })),
        series: [
          { label: "A cobrar", color: SUCCESS },
          { label: "A pagar", color: DANGER },
        ],
        currency,
      })
      b.y += 6
    }

    // ---- Proyección ----
    b.ensure(20 + report.projection.length * 7)
    b.sectionTitle(
      "Proyección de caja",
      "Escenario: todo se cobra y se paga en su fecha de vencimiento."
    )
    b.table({
      rows: report.projection,
      columns: [
        { header: "TRAMO", x: MARGIN + 2, width: 42, cell: (p) => p.label, color: () => DARK },
        {
          header: "SALDO INICIAL",
          x: MARGIN + 84,
          align: "right",
          cell: (p) => money(p.opening[currency]),
        },
        {
          header: "INGRESOS",
          x: MARGIN + 120,
          align: "right",
          cell: (p) => money(p.inflow[currency]),
          color: () => SUCCESS,
        },
        {
          header: "EGRESOS",
          x: MARGIN + 156,
          align: "right",
          cell: (p) => money(p.outflow[currency]),
          color: () => DANGER,
        },
        {
          header: "SALDO FINAL",
          x: RIGHT - 2,
          align: "right",
          cell: (p) => money(p.closing[currency]),
          bold: true,
          color: (p) => (p.closing[currency] < 0 ? DANGER : DARK),
        },
      ],
    })

    const shortfall = report.summary.firstShortfall[currency]
    if (shortfall) {
      const point = report.projection.find((p) => p.bucketKey === shortfall)
      b.note(
        `Atención: con este escenario el saldo en ${currency} se vuelve negativo en el tramo ` +
          `"${point?.label ?? shortfall}" (${money(point?.closing[currency] ?? 0)}).`,
        { advance: 8 }
      )
    }
  }

  // ---- Saldos por cuenta ----
  if (report.balances.byAccount.length > 0) {
    b.ensure(20 + report.balances.byAccount.length * 7)
    b.sectionTitle("Saldos por cuenta")
    b.table({
      rows: report.balances.byAccount,
      columns: [
        { header: "CUENTA", x: MARGIN + 2, width: 60, cell: (a) => a.name, color: () => DARK },
        {
          header: "AGENCIA",
          x: MARGIN + 66,
          width: 40,
          cell: (a) => a.agencyName || "Sin agencia",
        },
        { header: "MONEDA", x: MARGIN + 120, align: "right", cell: (a) => a.currency },
        {
          header: "SALDO",
          x: RIGHT - 2,
          align: "right",
          cell: (a) => fmtMoney(a.balance, a.currency),
          bold: true,
          color: (a) => (a.balance < 0 ? DANGER : DARK),
        },
      ],
    })
  }

  // ---- Detalle de vencidas ----
  const overdueReceivables = report.receivables
    .filter((r) => r.bucketKey === "OVERDUE")
    .slice(0, MAX_OVERDUE_ROWS)
  if (overdueReceivables.length > 0) {
    b.ensure(60)
    b.sectionTitle(
      "Cobranzas vencidas",
      `${
        report.summary.overdueReceivableCount.ARS + report.summary.overdueReceivableCount.USD
      } operación(es) con saldo vencido, de la más atrasada a la más reciente. Cada fila muestra su propia moneda.`
    )
    b.table({
      rows: overdueReceivables,
      rowHeight: 6.2,
      fontSize: 7.5,
      columns: [
        { header: "VENCIÓ", x: MARGIN + 1, width: 18, cell: (r) => fmtDate(r.dueDate || "") },
        {
          header: "DÍAS",
          x: MARGIN + 30,
          align: "right",
          cell: (r) => String(r.daysOverdue),
          color: () => DANGER,
        },
        { header: "FILE", x: MARGIN + 34, width: 20, cell: (r) => r.fileCode },
        {
          header: "CLIENTE",
          x: MARGIN + 56,
          width: 34,
          cell: (r) => r.customerName,
          color: () => DARK,
        },
        { header: "DESTINO", x: MARGIN + 92, width: 24, cell: (r) => r.destination },
        { header: "VENDEDOR", x: MARGIN + 118, width: 24, cell: (r) => r.sellerName },
        {
          header: "SALDO",
          x: RIGHT - 1,
          align: "right",
          cell: (r) => fmtMoney(r.debt, r.currency),
          bold: true,
        },
      ],
    })
  }

  const overduePayables = report.payables
    .filter((p) => p.bucketKey === "OVERDUE")
    .slice(0, MAX_OVERDUE_ROWS)
  if (overduePayables.length > 0) {
    b.ensure(60)
    b.sectionTitle(
      "Pagos a operadores vencidos",
      `${
        report.summary.overduePayableCount.ARS + report.summary.overduePayableCount.USD
      } pago(s) con saldo vencido. Cada fila muestra su propia moneda.`
    )
    b.table({
      rows: overduePayables,
      rowHeight: 6.2,
      fontSize: 7.5,
      columns: [
        { header: "VENCIÓ", x: MARGIN + 1, width: 18, cell: (p) => fmtDate(p.dueDate || "") },
        {
          header: "DÍAS",
          x: MARGIN + 30,
          align: "right",
          cell: (p) => String(p.daysOverdue),
          color: () => DANGER,
        },
        { header: "FILE", x: MARGIN + 34, width: 22, cell: (p) => p.fileCode },
        {
          header: "OPERADOR",
          x: MARGIN + 58,
          width: 44,
          cell: (p) => p.operatorName,
          color: () => DARK,
        },
        {
          header: "PAGADO",
          x: MARGIN + 150,
          align: "right",
          cell: (p) => fmtMoney(p.paidAmount, p.currency),
        },
        {
          header: "PENDIENTE",
          x: RIGHT - 1,
          align: "right",
          cell: (p) => fmtMoney(p.pending, p.currency),
          bold: true,
        },
      ],
    })
  }

  // ---- Criterios ----
  const notes: string[] = [
    `Las cobranzas no existen como comprobantes pendientes: se derivan de la venta menos los ` +
      `cobros ya registrados, con la misma fórmula que la pantalla de Deudas.`,
    `Vencimiento de la cobranza: fecha límite de pago cargada en la operación en ` +
      `${report.dueDateSource.fromPaymentDeadline} caso(s), fecha de salida del viaje en ` +
      `${report.dueDateSource.fromDepartureDate}, y sin ninguna de las dos en ` +
      `${report.dueDateSource.missing} (van al tramo "Sin fecha" y quedan fuera de la proyección).`,
    `La proyección es un escenario, no una promesa: asume que todo se cobra y se paga el día que vence.`,
  ]
  if (report.summary.truncated) {
    notes.push(
      "El tenant supera el máximo de filas leídas: los totales son parciales. Filtrá por agencia."
    )
  }

  b.ensure(8 + notes.length * 8)
  b.sectionTitle("Criterios del reporte")
  doc.setFontSize(7.5)
  doc.setFont("helvetica", "normal")
  b.setText(GRAY)
  for (const line of notes) {
    const lines = doc.splitTextToSize(line, CONTENT_W) as string[]
    b.ensure(lines.length * 4 + 2)
    for (const l of lines) {
      doc.text(l, MARGIN, b.y)
      b.y += 4
    }
    b.y += 1.5
  }

  return b.finish()
}
