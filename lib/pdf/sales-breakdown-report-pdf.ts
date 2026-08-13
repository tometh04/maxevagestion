/**
 * Generador del PDF "Reporte de Ventas por producto" (VIB-66).
 *
 * Función pura sobre `lib/pdf/report-kit.ts`. Muestra qué se vendió (vuelo,
 * hotel, paquete, asistencia…), quién lo vendió y en qué oficina.
 *
 * Incluye un bloque explícito con el criterio de prorrateo: como la venta vive
 * a nivel operación y el tipo de producto a nivel ítem, hay un reparto de por
 * medio, y quien recibe el reporte tiene derecho a saber cómo se hizo.
 */

import type { ReportCompany } from "@/lib/reports/report-company"
import type { SalesBreakdownReport } from "@/lib/reports/sales-breakdown-report"
import type { SalesBreakdownReportFilters } from "@/lib/reports/sales-breakdown-report-data"
import {
  REPORT_COLORS,
  REPORT_GEOMETRY,
  ReportPdfBuilder,
  drawBarChart,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtPct,
} from "@/lib/pdf/report-kit"

const { DARK, GRAY } = REPORT_COLORS
const { MARGIN, CONTENT_W, RIGHT } = REPORT_GEOMETRY

const MAX_DETAIL_ROWS = 1000

export interface SalesBreakdownReportPdfParams {
  report: SalesBreakdownReport
  filters: SalesBreakdownReportFilters
  company: ReportCompany
  generatedAt?: Date
}

export function generateSalesBreakdownReportPdf({
  report,
  filters,
  company,
  generatedAt = new Date(),
}: SalesBreakdownReportPdfParams): ArrayBuffer {
  const currency = report.currency
  const money = (amount: number) => fmtMoney(amount, currency)

  const b = new ReportPdfBuilder({
    company,
    generatedAt,
    title: "REPORTE DE VENTAS",
    subtitle: `${fmtDate(report.dateFrom)}  –  ${fmtDate(report.dateTo)}`,
    meta: `Moneda: ${currency}`,
    continuationLine: `Reporte de ventas · ${fmtDate(report.dateFrom)} – ${fmtDate(
      report.dateTo
    )} · ${currency}`,
  })
  const doc = b.doc

  b.coverBand()

  b.filtersLine([
    `Vendedor: ${filters.sellerName || (filters.ownDataOnly ? "Propias" : "Todos")}`,
    `Agencia: ${filters.agencyName || "Todas"}`,
    report.summary.includeServices ? "Incluye servicios adicionales" : "",
    `Generado: ${fmtDateTime(generatedAt)}`,
  ])

  b.kpiRow([
    {
      label: "Ventas del período",
      value: money(report.summary.sale),
      hint: `${report.summary.operations} operaciones`,
      accent: true,
    },
    {
      label: "Costo",
      value: money(report.summary.cost),
      hint: `${fmtPct(100 - report.summary.marginPct)} de la venta`,
    },
    {
      label: "Margen",
      value: money(report.summary.margin),
      hint: `${fmtPct(report.summary.marginPct)} sobre la venta`,
    },
    {
      label: "Ticket promedio",
      value: money(report.summary.averageTicket),
      hint: `${report.byProduct.length} tipo(s) de producto`,
    },
  ])

  if (report.summary.otherCurrency) {
    b.note(
      `En el mismo período también hay ${report.summary.otherCurrency.operations} operación(es) en ` +
        `${report.summary.otherCurrency.currency} por ${fmtMoney(
          report.summary.otherCurrency.sale,
          report.summary.otherCurrency.currency
        )}. No se suman a este reporte: se informan por separado para no mezclar monedas.`
    )
  } else {
    b.y += 2
  }

  if (report.summary.operations === 0) {
    b.emptyState(
      "Sin ventas en el período",
      `No se encontraron operaciones en ${currency} entre ${fmtDate(
        report.dateFrom
      )} y ${fmtDate(report.dateTo)} con los filtros aplicados.`
    )
    return b.finish()
  }

  // ================================================= TORTA POR PRODUCTO ===
  const legendRows = Math.min(report.byProduct.length, 9)
  b.ensure(18 + Math.max(62, legendRows * 6 + 8))
  b.sectionTitle(
    "Ventas por tipo de producto",
    `Reparto de ${money(report.summary.sale)} entre ${report.byProduct.length} tipo(s)`
  )
  b.donutWithLegend({
    slices: report.byProduct.map((p) => ({
      label: p.label,
      value: p.sale,
      share: p.share,
      color: p.color,
    })),
    total: report.summary.sale,
    currency,
    restLabel: (n) => `Otros ${n} productos`,
  })

  // ================================================= EVOLUCIÓN MENSUAL ====
  if (report.byMonth.length > 1) {
    b.ensure(62)
    b.sectionTitle("Evolución de ventas", "Total vendido por mes")
    b.y = drawBarChart(doc, {
      x: MARGIN,
      y: b.y,
      width: CONTENT_W,
      height: 42,
      buckets: report.byMonth.map((m) => ({ label: m.label, total: m.sale })),
      currency,
    })
    b.y += 8
  }

  // ================================================= TABLA POR PRODUCTO ===
  b.sectionTitle("Desglose por producto")

  const prodCols = {
    name: MARGIN + 2,
    ops: MARGIN + 60,
    sale: MARGIN + 90,
    margin: MARGIN + 118,
    marginPct: MARGIN + 133,
    barX: MARGIN + 136,
  }
  b.table({
    rows: report.byProduct,
    columns: [
      {
        header: "PRODUCTO",
        x: prodCols.name,
        width: 50,
        cell: (p) => p.label,
        color: () => DARK,
        swatch: (p) => p.color,
      },
      { header: "OPS", x: prodCols.ops, align: "right", cell: (p) => String(p.operations) },
      {
        header: "VENTA",
        x: prodCols.sale,
        align: "right",
        cell: (p) => money(p.sale),
        bold: true,
      },
      {
        header: "MARGEN",
        x: prodCols.margin,
        align: "right",
        cell: (p) => (p.margin != null ? money(p.margin) : "-"),
      },
      {
        header: "%",
        x: prodCols.marginPct,
        align: "right",
        cell: (p) => (p.marginPct != null ? fmtPct(p.marginPct) : "-"),
      },
      {
        header: "% DEL TOTAL",
        x: RIGHT - 2,
        align: "right",
        cell: (p) => fmtPct(p.share),
      },
    ],
    bar: {
      x: prodCols.barX,
      width: RIGHT - prodCols.barX - 14,
      share: (p) => p.share,
      color: (p) => p.color,
    },
    total: {
      cells: [
        { x: prodCols.name, text: "TOTAL" },
        { x: prodCols.ops, align: "right", text: String(report.summary.operations) },
        { x: prodCols.sale, align: "right", text: money(report.summary.sale) },
        { x: prodCols.margin, align: "right", text: money(report.summary.margin) },
        { x: prodCols.marginPct, align: "right", text: fmtPct(report.summary.marginPct) },
        { x: RIGHT - 2, align: "right", text: "100%" },
      ],
    },
  })

  // La columna OPS suma más que el total a propósito: una operación con vuelo y
  // hotel cuenta en los dos productos. El total son operaciones distintas.
  b.note(
    "Una operación con varios productos cuenta en cada uno de ellos, por eso la columna OPS " +
      `suma más que el total: el período tiene ${report.summary.operations} operaciones distintas.`,
    { advance: report.byProduct.some((p) => p.margin == null) ? 4 : 7 }
  )

  if (report.byProduct.some((p) => p.margin == null)) {
    b.note(
      "Los productos sin margen tienen costos cargados en otra moneda que la venta: " +
        "se informan sin margen en vez de mezclar monedas.",
      { advance: 7 }
    )
  }

  // ============================================ VENDEDOR Y AGENCIA ========
  const colW = (CONTENT_W - 8) / 2
  const rightX = MARGIN + colW + 8
  const topSellers = report.bySeller.slice(0, 8)
  const topAgencies = report.byAgency.slice(0, 8)
  b.ensure(20 + Math.max(topSellers.length, topAgencies.length) * 6.5)
  b.sectionTitle("Ventas por vendedor y por agencia")

  const blockTop = b.y
  const sellerEndY = b.miniTable(
    MARGIN,
    blockTop,
    "Por vendedor",
    topSellers.length > 0
      ? topSellers.map((s) => ({
          label: s.sellerName,
          value: money(s.sale),
          hint: fmtPct(s.share),
        }))
      : [{ label: "Sin vendedores", value: "-", hint: "" }],
    colW
  )
  const agencyEndY = b.miniTable(
    rightX,
    blockTop,
    "Por agencia",
    topAgencies.length > 0
      ? topAgencies.map((a) => ({
          label: a.agencyName,
          value: money(a.sale),
          hint: fmtPct(a.share),
        }))
      : [{ label: "Sin agencias", value: "-", hint: "" }],
    colW
  )
  b.y = Math.max(sellerEndY, agencyEndY) + 4

  const sharedSellers = report.bySeller.filter((s) => s.secondaryOperations > 0)
  if (sharedSellers.length > 0) {
    b.note(
      "En las ventas compartidas el importe se atribuye al vendedor principal, para que la suma " +
        "por vendedor coincida con el total. La participación como socio se detalla en pantalla.",
      { advance: 7 }
    )
  }

  // =========================================== CRITERIO DE PRORRATEO ======
  const a = report.summary.attribution
  b.ensure(30)
  b.sectionTitle("Cómo se repartió la venta entre productos")
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  b.setText(GRAY)
  const lines = [
    `La venta se registra a nivel operación y el tipo de producto a nivel ítem, así que de las ` +
      `${report.summary.operations} operaciones del período:`,
    `· ${a.operationsByItemSale} se repartieron según el importe de venta de cada ítem.`,
    `· ${a.operationsByItemCost} se repartieron según el costo de cada ítem (no tenían importe de venta cargado).`,
    `· ${a.operationsEven} se repartieron en partes iguales (costos en monedas distintas).`,
    `· ${a.operationsWithoutItems} no tenían ítems: se imputaron enteras al tipo de la operación.`,
    `El reparto no altera el total: la suma de los productos es exactamente ${money(
      report.summary.sale
    )}.`,
  ]
  for (const line of lines) {
    b.ensure(5)
    doc.text(line, MARGIN, b.y)
    b.y += 4.4
  }
  b.y += 4

  // ==================================================== DETALLE ===========
  const detailRows = report.detail.slice(0, MAX_DETAIL_ROWS)
  const truncated = report.detail.length > detailRows.length

  b.ensure(72)
  b.sectionTitle(
    "Detalle de operaciones",
    truncated
      ? `Se listan las primeras ${detailRows.length} de ${report.detail.length} operaciones del período.`
      : `${report.detail.length} operación(es), de la venta más reciente a la más antigua.`
  )

  b.table({
    rows: detailRows,
    rowHeight: 6.2,
    fontSize: 7.5,
    columns: [
      { header: "FECHA", x: MARGIN + 1, width: 17, cell: (r) => fmtDate(r.date) },
      { header: "FILE", x: MARGIN + 19, width: 20, cell: (r) => r.fileCode },
      {
        header: "DESTINO",
        x: MARGIN + 40,
        width: 20,
        cell: (r) => r.destination,
        color: () => DARK,
      },
      {
        header: "PRODUCTOS",
        x: MARGIN + 61,
        width: 40,
        cell: (r) => r.products.map((p) => p.label).join(", "),
      },
      { header: "VENDEDOR", x: MARGIN + 102, width: 22, cell: (r) => r.sellerName },
      {
        header: "MARGEN",
        x: MARGIN + 150,
        align: "right",
        cell: (r) => money(r.margin),
      },
      {
        header: "VENTA",
        x: RIGHT - 1,
        align: "right",
        cell: (r) => money(r.sale),
        bold: true,
      },
    ],
    total: {
      accent: true,
      cells: [
        {
          x: MARGIN + 2,
          text: truncated
            ? `TOTAL DEL PERÍODO (${report.detail.length} operaciones)`
            : "TOTAL DEL PERÍODO",
        },
        { x: MARGIN + 150, align: "right", text: money(report.summary.margin) },
        { x: RIGHT - 2, align: "right", text: money(report.summary.sale) },
      ],
    },
  })

  if (report.summary.truncated) {
    b.note(
      "El período supera el máximo de filas leídas: los totales son parciales. Acotá el rango.",
      { advance: 6 }
    )
  }

  return b.finish()
}
