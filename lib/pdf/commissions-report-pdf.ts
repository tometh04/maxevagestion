/**
 * Generador del PDF "Reporte de Comisiones" (VIB-65).
 *
 * Función pura sobre `lib/pdf/report-kit.ts`: recibe el reporte ya agregado por
 * `lib/reports/commissions-report.ts` y el branding del tenant.
 *
 * Está pensado para presentarle a cada vendedor (o a la dirección) de dónde sale
 * su comisión: cuánto, sobre qué venta, en qué mes, y qué parte corresponde a
 * operaciones compartidas con otro vendedor.
 */

import type { ReportCompany } from "@/lib/reports/report-company"
import type { CommissionsReport } from "@/lib/reports/commissions-report"
import type { CommissionsReportFilters } from "@/lib/reports/commissions-report-data"
import {
  REPORT_COLORS,
  REPORT_GEOMETRY,
  ReportPdfBuilder,
  drawStackedBarChart,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtPct,
} from "@/lib/pdf/report-kit"

const { PRIMARY, DARK, GRAY } = REPORT_COLORS
const { MARGIN, CONTENT_W, RIGHT } = REPORT_GEOMETRY

/** Máximo de filas del detalle. Si se supera, el PDF lo dice explícitamente. */
const MAX_DETAIL_ROWS = 1000

/** Límites para que la matriz vendedor × mes siga siendo legible impresa. */
const MATRIX_MAX_MONTHS = 14
const MATRIX_MAX_SELLERS = 20

export interface CommissionsReportPdfParams {
  report: CommissionsReport
  filters: CommissionsReportFilters
  company: ReportCompany
  generatedAt?: Date
}

export function generateCommissionsReportPdf({
  report,
  filters,
  company,
  generatedAt = new Date(),
}: CommissionsReportPdfParams): ArrayBuffer {
  const currency = report.currency
  const money = (amount: number) => fmtMoney(amount, currency)

  const b = new ReportPdfBuilder({
    company,
    generatedAt,
    title: "REPORTE DE COMISIONES",
    subtitle: `${fmtDate(report.dateFrom)}  –  ${fmtDate(report.dateTo)}`,
    meta: `Moneda: ${currency}`,
    continuationLine: `Reporte de comisiones · ${fmtDate(report.dateFrom)} – ${fmtDate(
      report.dateTo
    )} · ${currency}`,
  })
  const doc = b.doc

  b.coverBand()

  b.filtersLine([
    `Vendedor: ${filters.sellerName || (filters.ownDataOnly ? "Propias" : "Todos")}`,
    `Agencia: ${filters.agencyName || "Todas"}`,
    "Mes según fecha de venta",
    `Generado: ${fmtDateTime(generatedAt)}`,
  ])

  b.kpiRow([
    {
      label: "Comisiones del período",
      value: money(report.summary.total),
      hint: `${report.summary.count} comisión(es) · ${report.summary.operationsCount} operaciones`,
      accent: true,
    },
    {
      label: "Por pagar",
      value: money(report.summary.pending),
      hint: `${fmtPct(report.byStatus.find((s) => s.status === "PENDING")?.share ?? 0)} del total`,
    },
    {
      label: "Pagadas",
      value: money(report.summary.paid),
      hint: `${fmtPct(report.byStatus.find((s) => s.status === "PAID")?.share ?? 0)} del total`,
    },
    {
      label: "Sobre venta de",
      value: money(report.summary.baseSale),
      hint: `${fmtPct(report.summary.effectiveRate, 2)} efectivo · ${
        report.summary.sellersCount
      } vendedor(es)`,
    },
  ])

  if (report.summary.otherCurrency) {
    b.note(
      `En el mismo período también hay ${report.summary.otherCurrency.count} comisión(es) en ` +
        `${report.summary.otherCurrency.currency} por ${fmtMoney(
          report.summary.otherCurrency.total,
          report.summary.otherCurrency.currency
        )}. No se suman a este reporte: se informan por separado para no mezclar monedas.`
    )
  } else {
    b.y += 2
  }

  if (report.summary.count === 0) {
    b.emptyState(
      "Sin comisiones en el período",
      `No se encontraron comisiones en ${currency} sobre ventas entre ${fmtDate(
        report.dateFrom
      )} y ${fmtDate(report.dateTo)} con los filtros aplicados.`
    )
    return b.finish()
  }

  // ================================================= TORTA POR VENDEDOR ===
  const legendRows = Math.min(report.bySeller.length, 9)
  b.ensure(18 + Math.max(62, legendRows * 6 + 8))
  b.sectionTitle(
    "Participación por vendedor",
    `Reparto de ${money(report.summary.total)} entre ${report.summary.sellersCount} vendedor(es)`
  )
  b.donutWithLegend({
    slices: report.bySeller.map((s) => ({
      label: s.sellerName,
      value: s.total,
      share: s.share,
      color: s.color,
    })),
    total: report.summary.total,
    currency,
    restLabel: (n) => `Otros ${n} vendedores`,
  })

  // ================================================= EVOLUCIÓN POR MES ====
  if (report.byMonth.length > 1) {
    b.ensure(70)
    b.sectionTitle("Evolución mensual", "Comisiones por mes de venta, pagadas y por pagar")
    b.y = drawStackedBarChart(doc, {
      x: MARGIN,
      y: b.y,
      width: CONTENT_W,
      height: 42,
      buckets: report.byMonth.map((m) => ({ label: m.label, segments: [m.paid, m.pending] })),
      series: [
        { label: "Pagadas", color: REPORT_COLORS.SUCCESS },
        { label: "Por pagar", color: PRIMARY },
      ],
      currency,
    })
    b.y += 6
  }

  // ================================================= TABLA POR VENDEDOR ===
  b.sectionTitle("Detalle por vendedor")

  // Tres columnas de dinero conviven ajustadas: cada importe formateado ocupa
  // ~24 mm a 8 pt, así que los bordes derechos van cada 28 mm.
  const sellerCols = {
    name: MARGIN + 2,
    ops: MARGIN + 49,
    pending: MARGIN + 77,
    paid: MARGIN + 105,
    total: MARGIN + 133,
    barX: MARGIN + 136,
  }
  const sellerBarW = RIGHT - sellerCols.barX - 14
  b.table({
    rows: report.bySeller,
    columns: [
      {
        header: "VENDEDOR",
        x: sellerCols.name,
        width: 40,
        cell: (s) => s.sellerName,
        color: () => DARK,
        swatch: (s) => s.color,
      },
      {
        header: "OPS",
        x: sellerCols.ops,
        align: "right",
        cell: (s) => String(s.operationsCount),
      },
      {
        header: "POR PAGAR",
        x: sellerCols.pending,
        align: "right",
        cell: (s) => money(s.pending),
      },
      {
        header: "PAGADAS",
        x: sellerCols.paid,
        align: "right",
        cell: (s) => money(s.paid),
      },
      {
        header: "TOTAL",
        x: sellerCols.total,
        align: "right",
        cell: (s) => money(s.total),
        bold: true,
      },
      {
        header: "% DEL TOTAL",
        x: RIGHT - 2,
        align: "right",
        cell: (s) => fmtPct(s.share),
      },
    ],
    bar: {
      x: sellerCols.barX,
      width: sellerBarW,
      share: (s) => s.share,
      color: (s) => s.color,
    },
    total: {
      cells: [
        { x: sellerCols.name, text: "TOTAL" },
        { x: sellerCols.ops, align: "right", text: String(report.summary.operationsCount) },
        { x: sellerCols.pending, align: "right", text: money(report.summary.pending) },
        { x: sellerCols.paid, align: "right", text: money(report.summary.paid) },
        { x: sellerCols.total, align: "right", text: money(report.summary.total) },
        { x: RIGHT - 2, align: "right", text: "100%" },
      ],
    },
  })

  // Ventas compartidas: se explica por qué un vendedor puede tener comisión de
  // una operación que "no es suya".
  if (report.summary.sharedOperations > 0) {
    b.note(
      `${report.summary.sharedOperations} operación(es) del período están compartidas entre dos ` +
        `vendedores: cada uno cobra su parte y ambas comisiones se listan por separado.`,
      { advance: 7 }
    )
  }

  // ============================================ COMPOSICIÓN (2 columnas) ==
  const colW = (CONTENT_W - 8) / 2
  const rightX = MARGIN + colW + 8
  b.ensure(20 + Math.max(report.byStatus.length, report.byAgency.length) * 6.5)
  b.sectionTitle("Composición")

  const blockTop = b.y
  const statusEndY = b.miniTable(
    MARGIN,
    blockTop,
    "Por estado",
    report.byStatus.map((s) => ({
      label: s.label,
      value: money(s.total),
      hint: `${s.count}`,
    })),
    colW
  )
  const agencyEndY = b.miniTable(
    rightX,
    blockTop,
    "Por agencia",
    report.byAgency.length > 0
      ? report.byAgency.slice(0, 6).map((a) => ({
          label: a.agencyName,
          value: money(a.total),
          hint: fmtPct(a.share),
        }))
      : [{ label: "Sin agencias", value: "-", hint: "" }],
    colW
  )
  b.y = Math.max(statusEndY, agencyEndY) + 4

  // ========================================== MATRIZ VENDEDOR × MES =======
  const months = report.byMonth
  const matrixFits =
    months.length > 1 &&
    months.length <= MATRIX_MAX_MONTHS &&
    report.bySellerMonth.length <= MATRIX_MAX_SELLERS

  if (months.length > 1) {
    b.ensure(24 + Math.min(report.bySellerMonth.length, MATRIX_MAX_SELLERS) * 6)
    b.sectionTitle("Comisiones por vendedor y mes")

    if (!matrixFits) {
      b.note(
        `La matriz se omite: el período tiene ${months.length} meses y ${report.bySellerMonth.length} ` +
          `vendedores, y no entra legible en una hoja. Acotá el rango de fechas o filtrá por vendedor ` +
          `para verla.`,
        { advance: 8 }
      )
    } else {
      const nameW = 42
      const gridX = MARGIN + nameW + 4
      const cellW = (RIGHT - gridX - 26) / months.length

      b.table({
        rows: report.bySellerMonth,
        fontSize: 7,
        columns: [
          {
            header: "VENDEDOR",
            x: MARGIN + 2,
            width: nameW,
            cell: (r) => r.sellerName,
            color: () => DARK,
          },
          ...months.map((m, i) => ({
            header: m.label,
            x: gridX + cellW * (i + 1) - 1,
            align: "right" as const,
            cell: (r: (typeof report.bySellerMonth)[number]) =>
              r.cells[m.key] ? money(r.cells[m.key]) : "-",
          })),
          {
            header: "TOTAL",
            x: RIGHT - 2,
            align: "right",
            cell: (r) => money(r.total),
            bold: true,
          },
        ],
        total: {
          cells: [
            { x: MARGIN + 2, text: "TOTAL" },
            ...months.map((m, i) => ({
              x: gridX + cellW * (i + 1) - 1,
              align: "right" as const,
              text: money(m.total),
            })),
            { x: RIGHT - 2, align: "right" as const, text: money(report.summary.total) },
          ],
        },
      })
    }
  }

  // ==================================================== DETALLE ===========
  const detailRows = report.detail.slice(0, MAX_DETAIL_ROWS)
  const truncated = report.detail.length > detailRows.length

  b.ensure(72)
  b.sectionTitle(
    "Detalle de comisiones",
    truncated
      ? `Se listan las primeras ${detailRows.length} de ${report.detail.length} comisiones del período.`
      : `${report.detail.length} comisión(es), de la venta más reciente a la más antigua.`
  )

  b.table({
    rows: detailRows,
    rowHeight: 6.2,
    fontSize: 7.5,
    columns: [
      { header: "FECHA", x: MARGIN + 1, width: 18, cell: (r) => fmtDate(r.operationDate) },
      { header: "FILE", x: MARGIN + 21, width: 20, cell: (r) => r.fileCode },
      {
        header: "VENDEDOR",
        x: MARGIN + 43,
        width: 32,
        cell: (r) => r.sellerName,
        color: () => DARK,
      },
      {
        header: "ROL",
        x: MARGIN + 77,
        width: 16,
        cell: (r) =>
          r.role === "primary" ? "Principal" : r.role === "secondary" ? "Socio" : "-",
      },
      {
        header: "VENTA",
        x: MARGIN + 122,
        align: "right",
        cell: (r) => money(r.saleAmount),
      },
      {
        header: "%",
        x: MARGIN + 136,
        align: "right",
        cell: (r) => (r.percentage != null ? fmtPct(r.percentage) : "-"),
      },
      {
        header: "ESTADO",
        x: MARGIN + 152,
        align: "right",
        cell: (r) => (r.status === "PAID" ? "Pagada" : "Por pagar"),
        color: (r) => (r.status === "PAID" ? REPORT_COLORS.SUCCESS : GRAY),
      },
      {
        header: "COMISIÓN",
        x: RIGHT - 1,
        align: "right",
        cell: (r) => money(r.amount),
        bold: true,
      },
    ],
    total: {
      accent: true,
      cells: [
        {
          x: MARGIN + 2,
          text: truncated
            ? `TOTAL DEL PERÍODO (${report.detail.length} comisiones)`
            : "TOTAL DEL PERÍODO",
        },
        { x: RIGHT - 2, align: "right", text: money(report.summary.total) },
      ],
    },
  })

  // Criterios y exclusiones al pie: el reporte tiene que poder circular solo.
  const notes: string[] = [
    "El mes de cada comisión es el de la fecha de venta de la operación, no el del cálculo.",
  ]
  if (report.summary.cancelledRecords > 0) {
    notes.push(
      `${report.summary.cancelledRecords} comisión(es) de operaciones canceladas quedaron fuera del total.`
    )
  }
  if (report.summary.truncated) {
    notes.push(
      "El período supera el máximo de filas leídas: los totales son parciales. Acotá el rango."
    )
  }

  b.ensure(6 + notes.length * 4)
  doc.setFontSize(7)
  doc.setFont("helvetica", "italic")
  b.setText(GRAY)
  for (const line of notes) {
    doc.text(line, MARGIN, b.y)
    b.y += 4
  }
  doc.setFont("helvetica", "normal")

  return b.finish()
}
