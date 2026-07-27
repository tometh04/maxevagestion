/**
 * Generador del PDF "Reporte de Gastos" (VIB-64).
 *
 * Función pura: recibe el reporte ya agregado por `lib/reports/expenses-report.ts`
 * y el branding del tenant; no toca Supabase. Todo el andamiaje del documento
 * (banda de marca, KPIs, títulos de sección, torta, barras, pie con "Página X de
 * Y") vive en `lib/pdf/report-kit.ts`, compartido con los demás reportes.
 *
 * Las dos tablas de este reporte quedaron escritas a mano en vez de usar
 * `builder.table()`: migrarlas cambiaría el orden de operadores que emite jsPDF y
 * con eso un documento que ya está en producción. El test de caracterización de
 * `lib/pdf/__tests__/expenses-report-pdf.test.ts` bloquea ese cambio.
 */

import type { ExpensesReport } from "@/lib/reports/expenses-report"
import type {
  ExpensesReportCompany,
  ExpensesReportFilters,
} from "@/lib/reports/expenses-report-data"
import {
  REPORT_COLORS,
  REPORT_GEOMETRY,
  ReportPdfBuilder,
  drawBarChart,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  hexToRgb,
} from "@/lib/pdf/report-kit"

const { PRIMARY, DARK, GRAY, LIGHT, WHITE, ZEBRA, TRACK } = REPORT_COLORS
const { MARGIN, CONTENT_W, RIGHT, FOOTER_TOP } = REPORT_GEOMETRY

export interface ExpensesReportPdfParams {
  report: ExpensesReport
  filters: ExpensesReportFilters
  company: ExpensesReportCompany
  /** Fecha de generación (inyectable para tests deterministas). */
  generatedAt?: Date
}

/** Máximo de filas del detalle. Si se supera, el PDF lo dice explícitamente. */
const MAX_DETAIL_ROWS = 1000

export function generateExpensesReportPdf({
  report,
  filters,
  company,
  generatedAt = new Date(),
}: ExpensesReportPdfParams): ArrayBuffer {
  const currency = report.currency

  const b = new ReportPdfBuilder({
    company,
    generatedAt,
    title: "REPORTE DE GASTOS",
    subtitle: `${fmtDate(report.dateFrom)}  –  ${fmtDate(report.dateTo)}`,
    meta: `Moneda: ${currency}`,
    continuationLine: `Reporte de gastos · ${fmtDate(report.dateFrom)} – ${fmtDate(
      report.dateTo
    )} · ${currency}`,
  })
  const doc = b.doc

  // =========================================================== PORTADA ====
  b.coverBand()

  b.filtersLine([
    `Agencia: ${filters.agencyName || "Todas"}`,
    filters.agencyId
      ? `Criterio: ${filters.agencyMode === "account" ? "Cuenta pagadora" : "Oficina del gasto"}`
      : "",
    `Tipo: ${
      filters.type === "recurring"
        ? "Fijos / Recurrentes"
        : filters.type === "variable"
        ? "Variables"
        : "Fijos + Variables"
    }`,
    `Generado: ${fmtDateTime(generatedAt)}`,
  ])

  // ------------------------------------------------------------- KPIs -----
  const recurring = report.byType.find((t) => t.type === "recurring")
  const variable = report.byType.find((t) => t.type === "variable")

  b.kpiRow([
    {
      label: "Total del período",
      value: fmtMoney(report.summary.total, currency),
      hint: `${report.summary.count} gasto${report.summary.count === 1 ? "" : "s"} · ${
        report.summary.days
      } día${report.summary.days === 1 ? "" : "s"}`,
      accent: true,
    },
    {
      label: "Fijos / Recurrentes",
      value: fmtMoney(recurring?.total || 0, currency),
      hint: `${(recurring?.share || 0).toFixed(1)}% del total · ${recurring?.count || 0} pagos`,
    },
    {
      label: "Variables",
      value: fmtMoney(variable?.total || 0, currency),
      hint: `${(variable?.share || 0).toFixed(1)}% del total · ${variable?.count || 0} gastos`,
    },
    {
      label: "Promedio por día",
      value: fmtMoney(report.summary.dailyAverage, currency),
      hint: `Por gasto: ${fmtMoney(report.summary.average, currency)}`,
    },
  ])

  // Nota de la otra moneda: se informa, NO se suma (sin TC real no se mezcla).
  if (report.summary.otherCurrency) {
    b.note(
      `En el mismo período también se registraron ${report.summary.otherCurrency.count} gasto(s) en ` +
        `${report.summary.otherCurrency.currency} por ${fmtMoney(
          report.summary.otherCurrency.total,
          report.summary.otherCurrency.currency
        )}. No se suman a este reporte: se informan por separado para no mezclar monedas.`
    )
  } else {
    b.y += 2
  }

  // Reporte vacío: se documenta el período consultado y se corta acá.
  if (report.summary.count === 0) {
    b.emptyState(
      "Sin gastos registrados en el período",
      `No se encontraron gastos en ${currency} entre ${fmtDate(report.dateFrom)} y ${fmtDate(
        report.dateTo
      )} con los filtros aplicados.`
    )
    return b.finish()
  }

  // ================================================ DISTRIBUCIÓN (torta) ==
  const legendRows = Math.min(report.byCategory.length, 9)
  b.ensure(18 + Math.max(62, legendRows * 6 + 8))
  b.sectionTitle(
    "Distribución por categoría",
    `Participación de cada categoría sobre ${fmtMoney(report.summary.total, currency)}`
  )
  b.donutWithLegend({
    slices: report.byCategory.map((c) => ({
      label: c.category,
      value: c.total,
      share: c.share,
      color: c.color,
    })),
    total: report.summary.total,
    currency,
    restLabel: (n) => `Otras ${n} categorías`,
  })

  // ================================================ EVOLUCIÓN (barras) ====
  if (report.byBucket.length > 1) {
    b.ensure(62)
    b.sectionTitle(
      "Evolución del gasto",
      report.bucketMode === "day" ? "Total gastado por día" : "Total gastado por mes"
    )
    b.y = drawBarChart(doc, {
      x: MARGIN,
      y: b.y,
      width: CONTENT_W,
      height: 44,
      buckets: report.byBucket,
      currency,
    })
    b.y += 8
  }

  // ================================================ TABLA POR CATEGORÍA ===
  b.sectionTitle("Desglose por categoría")

  const catCols = {
    name: MARGIN + 6,
    countRight: MARGIN + 88,
    totalRight: MARGIN + 130,
    barX: MARGIN + 136,
  }
  const catBarW = RIGHT - catCols.barX - 14
  const drawCategoryHeader = () => {
    b.setFill(LIGHT)
    doc.rect(MARGIN, b.y, CONTENT_W, 7, "F")
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "bold")
    b.setText(GRAY)
    doc.text("CATEGORÍA", catCols.name, b.y + 4.7)
    doc.text("CANT.", catCols.countRight, b.y + 4.7, { align: "right" })
    doc.text("TOTAL", catCols.totalRight, b.y + 4.7, { align: "right" })
    doc.text("% DEL TOTAL", RIGHT - 2, b.y + 4.7, { align: "right" })
    b.y += 7
  }
  drawCategoryHeader()

  report.byCategory.forEach((slice, i) => {
    if (b.y + 7 > FOOTER_TOP) {
      b.addPage()
      drawCategoryHeader()
    }
    if (i % 2 === 1) {
      b.setFill(ZEBRA)
      doc.rect(MARGIN, b.y, CONTENT_W, 7, "F")
    }
    b.setFill(hexToRgb(slice.color))
    doc.roundedRect(MARGIN + 2, b.y + 2.2, 2.6, 2.6, 0.5, 0.5, "F")

    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    b.setText(DARK)
    doc.text(b.truncate(slice.category, 72), catCols.name, b.y + 4.8)
    b.setText(GRAY)
    doc.text(String(slice.count), catCols.countRight, b.y + 4.8, { align: "right" })
    doc.setFont("helvetica", "bold")
    b.setText(DARK)
    doc.text(fmtMoney(slice.total, currency), catCols.totalRight, b.y + 4.8, { align: "right" })

    // Barra de participación + %
    b.setFill(TRACK)
    doc.roundedRect(catCols.barX, b.y + 2.6, catBarW, 2, 1, 1, "F")
    if (slice.share > 0) {
      b.setFill(hexToRgb(slice.color))
      doc.roundedRect(
        catCols.barX,
        b.y + 2.6,
        Math.max(0.8, (catBarW * slice.share) / 100),
        2,
        1,
        1,
        "F"
      )
    }
    doc.setFont("helvetica", "normal")
    b.setText(GRAY)
    doc.setFontSize(7.5)
    doc.text(`${slice.share.toFixed(1)}%`, RIGHT - 2, b.y + 4.8, { align: "right" })
    b.y += 7
  })

  // Fila de total
  b.setFill(LIGHT)
  if (b.y + 8 > FOOTER_TOP) b.addPage()
  doc.rect(MARGIN, b.y, CONTENT_W, 8, "F")
  doc.setFontSize(8.5)
  doc.setFont("helvetica", "bold")
  b.setText(DARK)
  doc.text("TOTAL", catCols.name, b.y + 5.4)
  doc.text(String(report.summary.count), catCols.countRight, b.y + 5.4, { align: "right" })
  doc.text(fmtMoney(report.summary.total, currency), catCols.totalRight, b.y + 5.4, {
    align: "right",
  })
  doc.text("100%", RIGHT - 2, b.y + 5.4, { align: "right" })
  b.y += 14

  // ======================================= TIPO DE GASTO + CUENTA (2 col) ==
  const topAccounts = report.byAccount.slice(0, 6)
  b.ensure(20 + Math.max(report.byType.length, topAccounts.length) * 6.5)
  b.sectionTitle("Composición del gasto")

  const colW = (CONTENT_W - 8) / 2
  const leftX = MARGIN
  const rightX = MARGIN + colW + 8
  const blockTop = b.y

  const typeEndY = b.miniTable(
    leftX,
    blockTop,
    "Por tipo",
    report.byType.map((t) => ({
      label: t.label,
      value: fmtMoney(t.total, currency),
      hint: `${t.share.toFixed(1)}%`,
    })),
    colW
  )

  const accountEndY = b.miniTable(
    rightX,
    blockTop,
    "Por cuenta pagadora",
    topAccounts.length > 0
      ? topAccounts.map((a) => ({
          label: a.account,
          value: fmtMoney(a.total, currency),
          hint: `${a.count}`,
        }))
      : [{ label: "Sin cuentas registradas", value: "-", hint: "" }],
    colW
  )

  b.y = Math.max(typeEndY, accountEndY) + 4

  if (report.byAccount.length > topAccounts.length) {
    b.note(
      `Se listan las ${topAccounts.length} cuentas con mayor gasto de ${report.byAccount.length}.`,
      { x: rightX, fontSize: 7, dy: 0, advance: 5 }
    )
  }

  // ============================================== DETALLE DE GASTOS ======
  const detailRows = report.detail.slice(0, MAX_DETAIL_ROWS)
  const truncated = report.detail.length > detailRows.length

  // El detalle arranca en la página actual si quedan al menos ~9 filas útiles;
  // si no, en una nueva, para no cortar la sección apenas empezada.
  b.ensure(72)
  b.sectionTitle(
    "Detalle de gastos",
    truncated
      ? `Se listan los primeros ${detailRows.length} de ${report.detail.length} gastos del período (ordenados por fecha).`
      : `${report.detail.length} gasto${report.detail.length === 1 ? "" : "s"} ordenados por fecha (más reciente primero).`
  )

  // Fecha 20 | Descripción 60 | Categoría 32 | Tipo 16 | Cuenta 26 | Importe 26
  const dc = {
    date: MARGIN + 1,
    desc: MARGIN + 21,
    cat: MARGIN + 81,
    type: MARGIN + 113,
    account: MARGIN + 129,
    amount: RIGHT - 1,
  }
  const widths = { desc: 58, cat: 30, type: 14, account: 24 }

  const drawDetailHeader = () => {
    b.setFill(LIGHT)
    doc.rect(MARGIN, b.y, CONTENT_W, 7, "F")
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "bold")
    b.setText(GRAY)
    doc.text("FECHA", dc.date, b.y + 4.7)
    doc.text("DESCRIPCIÓN", dc.desc, b.y + 4.7)
    doc.text("CATEGORÍA", dc.cat, b.y + 4.7)
    doc.text("TIPO", dc.type, b.y + 4.7)
    doc.text("CUENTA", dc.account, b.y + 4.7)
    doc.text("IMPORTE", dc.amount, b.y + 4.7, { align: "right" })
    b.y += 7
  }
  drawDetailHeader()

  detailRows.forEach((row, i) => {
    if (b.y + 6.2 > FOOTER_TOP) {
      b.addPage()
      drawDetailHeader()
    }
    if (i % 2 === 1) {
      b.setFill(ZEBRA)
      doc.rect(MARGIN, b.y, CONTENT_W, 6.2, "F")
    }
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "normal")
    b.setText(GRAY)
    doc.text(fmtDate(row.date), dc.date, b.y + 4.2)

    b.setText(DARK)
    doc.text(b.truncate(row.description, widths.desc), dc.desc, b.y + 4.2)

    b.setFill(hexToRgb(row.categoryColor))
    doc.roundedRect(dc.cat, b.y + 1.9, 2.2, 2.2, 0.4, 0.4, "F")
    b.setText(GRAY)
    doc.text(b.truncate(row.category, widths.cat - 4), dc.cat + 3.6, b.y + 4.2)
    doc.text(row.type === "recurring" ? "Fijo" : "Variable", dc.type, b.y + 4.2)
    doc.text(b.truncate(row.account, widths.account), dc.account, b.y + 4.2)

    doc.setFont("helvetica", "bold")
    b.setText(DARK)
    doc.text(fmtMoney(row.amount, currency), dc.amount, b.y + 4.2, { align: "right" })
    b.y += 6.2
  })

  if (b.y + 9 > FOOTER_TOP) b.addPage()
  b.setFill(PRIMARY)
  doc.rect(MARGIN, b.y, CONTENT_W, 8, "F")
  doc.setFontSize(8.5)
  doc.setFont("helvetica", "bold")
  b.setText(WHITE)
  doc.text(
    truncated ? `TOTAL DEL PERÍODO (${report.detail.length} gastos)` : "TOTAL DEL PERÍODO",
    dc.date + 1,
    b.y + 5.4
  )
  doc.text(fmtMoney(report.summary.total, currency), dc.amount - 1, b.y + 5.4, { align: "right" })
  b.y += 12

  return b.finish()
}
