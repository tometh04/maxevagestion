/**
 * Generador del PDF "Reporte de Gastos" (VIB-64).
 *
 * Server-side jsPDF, mismo patrón que `lib/pdf/operation-statement-pdf.ts`:
 * `new jsPDF(...)` + `doc.output("arraybuffer")`. Función pura — recibe el
 * reporte ya agregado por `lib/reports/expenses-report.ts` y el branding del
 * tenant; no toca Supabase.
 *
 * El documento replica lo que se ve en pantalla y está pensado para imprimir /
 * presentar: portada con KPIs, torta por categoría, evolución del gasto,
 * desgloses por categoría, tipo y cuenta, y el detalle gasto por gasto.
 *
 * Los gráficos se dibujan con primitivas de jsPDF (polígonos y rectángulos):
 * no hay canvas ni librería de charts en el server.
 */

import jsPDF from "jspdf"
import type { ExpensesReport } from "@/lib/reports/expenses-report"
import type {
  ExpensesReportCompany,
  ExpensesReportFilters,
} from "@/lib/reports/expenses-report-data"

// ---------------------------------------------------------------- paleta ----
const PRIMARY = [66, 88, 229] as const // Vibook indigo (--primary)
const DARK = [30, 35, 48] as const
const GRAY = [122, 130, 145] as const
const LIGHT = [242, 244, 249] as const
const BORDER = [223, 227, 236] as const
const WHITE = [255, 255, 255] as const

// ------------------------------------------------------------- geometría ----
const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 15
const CONTENT_W = PAGE_W - MARGIN * 2
const RIGHT = PAGE_W - MARGIN
const FOOTER_TOP = 281 // por debajo de esto solo va el pie de página

const CURRENCY_SYMBOL: Record<string, string> = { ARS: "$", USD: "US$" }

type RGB = readonly [number, number, number]

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "")
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean.padEnd(6, "0").slice(0, 6)
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return PRIMARY
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}

function fmtMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? currency
  return `${symbol} ${Number(amount || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Monto compacto para ejes y etiquetas de barras ($ 1,2 M / $ 350 k). */
function fmtCompact(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? currency
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return `${symbol} ${(amount / 1_000_000).toFixed(1).replace(".", ",")} M`
  if (abs >= 1_000) return `${symbol} ${Math.round(amount / 1_000)} k`
  return `${symbol} ${Math.round(amount)}`
}

function fmtDate(dateKey: string): string {
  if (!dateKey || dateKey.length < 10) return "-"
  const [y, m, d] = dateKey.split("-")
  return `${d}/${m}/${y}`
}

function fmtDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

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
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const currency = report.currency
  let y = 0

  // ------------------------------------------------------------ helpers ----
  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2])
  const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2])
  const setText = (c: RGB) => doc.setTextColor(c[0], c[1], c[2])

  const truncate = (text: string, maxWidth: number): string => {
    const value = text ?? ""
    if (doc.getTextWidth(value) <= maxWidth) return value
    let out = value
    while (out.length > 1 && doc.getTextWidth(`${out}…`) > maxWidth) {
      out = out.slice(0, -1)
    }
    return `${out.trim()}…`
  }

  /** Cabecera compacta de las páginas 2+. */
  const drawContinuationHeader = () => {
    setFill(PRIMARY)
    doc.rect(0, 0, PAGE_W, 12, "F")
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    setText(WHITE)
    doc.text(company.name.toUpperCase(), MARGIN, 7.8)
    doc.setFont("helvetica", "normal")
    doc.text(
      `Reporte de gastos · ${fmtDate(report.dateFrom)} – ${fmtDate(report.dateTo)} · ${currency}`,
      RIGHT,
      7.8,
      { align: "right" }
    )
  }

  const addPage = () => {
    doc.addPage()
    drawContinuationHeader()
    y = 22
  }

  /** Salta de página si no entran `needed` mm antes del pie. */
  const ensure = (needed: number) => {
    if (y + needed > FOOTER_TOP) addPage()
  }

  const sectionTitle = (title: string, subtitle?: string) => {
    ensure(subtitle ? 16 : 12)
    setFill(PRIMARY)
    doc.rect(MARGIN, y, 2.2, 6, "F")
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    setText(DARK)
    doc.text(title, MARGIN + 5, y + 4.6)
    if (subtitle) {
      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")
      setText(GRAY)
      doc.text(subtitle, MARGIN + 5, y + 9.4)
      y += 13
    } else {
      y += 9
    }
  }

  // =========================================================== PORTADA ====
  // Banda de marca
  setFill(PRIMARY)
  doc.rect(0, 0, PAGE_W, 34, "F")

  let brandBottom = 13
  if (company.logo) {
    // El logo va sobre una tarjeta blanca: así cualquier logo (claro u oscuro,
    // con o sin transparencia) se lee bien sobre la banda de color.
    try {
      const format = company.logo.includes("image/jpeg") || company.logo.includes("image/jpg")
        ? "JPEG"
        : "PNG"
      setFill(WHITE)
      doc.roundedRect(MARGIN, 8, 46, 18, 2, 2, "F")
      doc.addImage(company.logo, format, MARGIN + 3, 10, 40, 14)
      brandBottom = 26
    } catch {
      doc.setFontSize(16)
      doc.setFont("helvetica", "bold")
      setText(WHITE)
      doc.text(truncate(company.name.toUpperCase(), 95), MARGIN, 16)
      brandBottom = 18
    }
  } else {
    doc.setFontSize(16)
    doc.setFont("helvetica", "bold")
    setText(WHITE)
    doc.text(truncate(company.name.toUpperCase(), 95), MARGIN, 16)
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    const companyLine = [company.taxId ? `CUIT ${company.taxId}` : "", company.phone, company.email]
      .filter(Boolean)
      .join("  ·  ")
    if (companyLine) doc.text(truncate(companyLine, 95), MARGIN, 21.5)
    brandBottom = 24
  }

  doc.setFontSize(15)
  doc.setFont("helvetica", "bold")
  setText(WHITE)
  doc.text("REPORTE DE GASTOS", RIGHT, 15, { align: "right" })
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(
    `${fmtDate(report.dateFrom)}  –  ${fmtDate(report.dateTo)}`,
    RIGHT,
    21,
    { align: "right" }
  )
  doc.setFontSize(8)
  doc.text(`Moneda: ${currency}`, RIGHT, 26, { align: "right" })

  y = 34 + 7

  // Línea de filtros aplicados: el reporte tiene que ser autoexplicativo
  // cuando se imprime y circula fuera del sistema.
  const filterParts = [
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
  ].filter(Boolean)

  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  setText(GRAY)
  doc.text(filterParts.join("   ·   "), MARGIN, y)
  y += 7

  // ------------------------------------------------------------- KPIs -----
  const recurring = report.byType.find((t) => t.type === "recurring")
  const variable = report.byType.find((t) => t.type === "variable")

  const kpis: Array<{ label: string; value: string; hint: string; accent?: boolean }> = [
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
  ]

  const kpiGap = 4
  const kpiW = (CONTENT_W - kpiGap * 3) / 4
  const kpiH = 24
  kpis.forEach((kpi, i) => {
    const x = MARGIN + i * (kpiW + kpiGap)
    setFill(kpi.accent ? PRIMARY : LIGHT)
    setDraw(BORDER)
    doc.setLineWidth(0.2)
    doc.roundedRect(x, y, kpiW, kpiH, 1.8, 1.8, kpi.accent ? "F" : "FD")

    doc.setFontSize(7)
    doc.setFont("helvetica", "bold")
    setText(kpi.accent ? WHITE : GRAY)
    doc.text(kpi.label.toUpperCase(), x + 3.5, y + 6)

    doc.setFontSize(kpi.accent ? 11.5 : 10.5)
    setText(kpi.accent ? WHITE : DARK)
    doc.text(truncate(kpi.value, kpiW - 7), x + 3.5, y + 13.5)

    doc.setFontSize(6.8)
    doc.setFont("helvetica", "normal")
    setText(kpi.accent ? WHITE : GRAY)
    doc.text(truncate(kpi.hint, kpiW - 7), x + 3.5, y + 19.5)
  })
  y += kpiH + 4

  // Nota de la otra moneda: se informa, NO se suma (sin TC real no se mezcla).
  if (report.summary.otherCurrency) {
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "italic")
    setText(GRAY)
    doc.text(
      `En el mismo período también se registraron ${report.summary.otherCurrency.count} gasto(s) en ` +
        `${report.summary.otherCurrency.currency} por ${fmtMoney(
          report.summary.otherCurrency.total,
          report.summary.otherCurrency.currency
        )}. No se suman a este reporte: se informan por separado para no mezclar monedas.`,
      MARGIN,
      y + 3
    )
    doc.setFont("helvetica", "normal")
    y += 8
  } else {
    y += 2
  }

  // Reporte vacío: se documenta el período consultado y se corta acá.
  if (report.summary.count === 0) {
    y += 6
    setFill(LIGHT)
    setDraw(BORDER)
    doc.roundedRect(MARGIN, y, CONTENT_W, 22, 2, 2, "FD")
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    setText(DARK)
    doc.text("Sin gastos registrados en el período", MARGIN + 6, y + 9)
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    setText(GRAY)
    doc.text(
      `No se encontraron gastos en ${currency} entre ${fmtDate(report.dateFrom)} y ${fmtDate(
        report.dateTo
      )} con los filtros aplicados.`,
      MARGIN + 6,
      y + 15.5
    )
    drawFooters()
    return doc.output("arraybuffer")
  }

  // ================================================ DISTRIBUCIÓN (torta) ==
  const legendRows = Math.min(report.byCategory.length, 9)
  ensure(18 + Math.max(62, legendRows * 6 + 8))
  sectionTitle(
    "Distribución por categoría",
    `Participación de cada categoría sobre ${fmtMoney(report.summary.total, currency)}`
  )

  const chartTop = y
  const pieCx = MARGIN + 32
  const pieCy = chartTop + 32
  const pieR = 28

  let angle = -Math.PI / 2
  const drawnSlices = report.byCategory.filter((c) => c.total > 0)
  for (const slice of drawnSlices) {
    const sweep = (slice.total / report.summary.total) * Math.PI * 2
    drawPieSlice(doc, pieCx, pieCy, pieR, angle, angle + sweep, hexToRgb(slice.color))
    angle += sweep
  }

  // Aro interior: donut + total al centro.
  setFill(WHITE)
  doc.circle(pieCx, pieCy, pieR * 0.56, "F")
  doc.setFontSize(6.5)
  doc.setFont("helvetica", "normal")
  setText(GRAY)
  doc.text("TOTAL", pieCx, pieCy - 2.5, { align: "center" })
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  setText(DARK)
  doc.text(truncate(fmtCompact(report.summary.total, currency), pieR * 1.05), pieCx, pieCy + 3, {
    align: "center",
  })

  // Leyenda a la derecha (top 9 + agrupado "Otras").
  const legendX = MARGIN + 70
  const legendW = RIGHT - legendX
  let legendY = chartTop + 4
  const shown = report.byCategory.slice(0, 9)
  const rest = report.byCategory.slice(9)

  for (const slice of shown) {
    setFill(hexToRgb(slice.color))
    doc.roundedRect(legendX, legendY - 2.6, 3, 3, 0.6, 0.6, "F")
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    setText(DARK)
    doc.text(truncate(slice.category, legendW - 52), legendX + 5, legendY)
    doc.setFont("helvetica", "bold")
    doc.text(fmtMoney(slice.total, currency), RIGHT - 14, legendY, { align: "right" })
    setText(GRAY)
    doc.setFont("helvetica", "normal")
    doc.text(`${slice.share.toFixed(1)}%`, RIGHT, legendY, { align: "right" })
    legendY += 6
  }

  if (rest.length > 0) {
    const restTotal = rest.reduce((acc, c) => acc + c.total, 0)
    const restShare = rest.reduce((acc, c) => acc + c.share, 0)
    setFill(BORDER)
    doc.roundedRect(legendX, legendY - 2.6, 3, 3, 0.6, 0.6, "F")
    doc.setFontSize(8)
    doc.setFont("helvetica", "italic")
    setText(DARK)
    doc.text(`Otras ${rest.length} categorías`, legendX + 5, legendY)
    doc.setFont("helvetica", "bold")
    doc.text(fmtMoney(restTotal, currency), RIGHT - 14, legendY, { align: "right" })
    setText(GRAY)
    doc.setFont("helvetica", "normal")
    doc.text(`${restShare.toFixed(1)}%`, RIGHT, legendY, { align: "right" })
    legendY += 6
  }

  y = Math.max(pieCy + pieR + 8, legendY + 4)

  // ================================================ EVOLUCIÓN (barras) ====
  if (report.byBucket.length > 1) {
    ensure(62)
    sectionTitle(
      "Evolución del gasto",
      report.bucketMode === "day" ? "Total gastado por día" : "Total gastado por mes"
    )
    y = drawBarChart(doc, {
      x: MARGIN,
      y,
      width: CONTENT_W,
      height: 44,
      buckets: report.byBucket,
      currency,
    })
    y += 8
  }

  // ================================================ TABLA POR CATEGORÍA ===
  sectionTitle("Desglose por categoría")

  const catCols = {
    name: MARGIN + 6,
    countRight: MARGIN + 88,
    totalRight: MARGIN + 130,
    barX: MARGIN + 136,
  }
  const catBarW = RIGHT - catCols.barX - 14
  const drawCategoryHeader = () => {
    setFill(LIGHT)
    doc.rect(MARGIN, y, CONTENT_W, 7, "F")
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "bold")
    setText(GRAY)
    doc.text("CATEGORÍA", catCols.name, y + 4.7)
    doc.text("CANT.", catCols.countRight, y + 4.7, { align: "right" })
    doc.text("TOTAL", catCols.totalRight, y + 4.7, { align: "right" })
    doc.text("% DEL TOTAL", RIGHT - 2, y + 4.7, { align: "right" })
    y += 7
  }
  drawCategoryHeader()

  report.byCategory.forEach((slice, i) => {
    if (y + 7 > FOOTER_TOP) {
      addPage()
      drawCategoryHeader()
    }
    if (i % 2 === 1) {
      setFill([250, 251, 253] as const)
      doc.rect(MARGIN, y, CONTENT_W, 7, "F")
    }
    setFill(hexToRgb(slice.color))
    doc.roundedRect(MARGIN + 2, y + 2.2, 2.6, 2.6, 0.5, 0.5, "F")

    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    setText(DARK)
    doc.text(truncate(slice.category, 72), catCols.name, y + 4.8)
    setText(GRAY)
    doc.text(String(slice.count), catCols.countRight, y + 4.8, { align: "right" })
    doc.setFont("helvetica", "bold")
    setText(DARK)
    doc.text(fmtMoney(slice.total, currency), catCols.totalRight, y + 4.8, { align: "right" })

    // Barra de participación + %
    setFill([233, 236, 243] as const)
    doc.roundedRect(catCols.barX, y + 2.6, catBarW, 2, 1, 1, "F")
    if (slice.share > 0) {
      setFill(hexToRgb(slice.color))
      doc.roundedRect(
        catCols.barX,
        y + 2.6,
        Math.max(0.8, (catBarW * slice.share) / 100),
        2,
        1,
        1,
        "F"
      )
    }
    doc.setFont("helvetica", "normal")
    setText(GRAY)
    doc.setFontSize(7.5)
    doc.text(`${slice.share.toFixed(1)}%`, RIGHT - 2, y + 4.8, { align: "right" })
    y += 7
  })

  // Fila de total
  setFill(LIGHT)
  if (y + 8 > FOOTER_TOP) addPage()
  doc.rect(MARGIN, y, CONTENT_W, 8, "F")
  doc.setFontSize(8.5)
  doc.setFont("helvetica", "bold")
  setText(DARK)
  doc.text("TOTAL", catCols.name, y + 5.4)
  doc.text(String(report.summary.count), catCols.countRight, y + 5.4, { align: "right" })
  doc.text(fmtMoney(report.summary.total, currency), catCols.totalRight, y + 5.4, {
    align: "right",
  })
  doc.text("100%", RIGHT - 2, y + 5.4, { align: "right" })
  y += 14

  // ======================================= TIPO DE GASTO + CUENTA (2 col) ==
  const topAccounts = report.byAccount.slice(0, 6)
  ensure(20 + Math.max(report.byType.length, topAccounts.length) * 6.5)
  sectionTitle("Composición del gasto")

  const colW = (CONTENT_W - 8) / 2
  const leftX = MARGIN
  const rightX = MARGIN + colW + 8
  const blockTop = y

  const drawMiniTable = (
    x: number,
    startY: number,
    title: string,
    rows: Array<{ label: string; value: string; hint: string }>
  ): number => {
    let ty = startY
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "bold")
    setText(GRAY)
    doc.text(title.toUpperCase(), x, ty)
    ty += 3
    setDraw(BORDER)
    doc.setLineWidth(0.2)
    doc.line(x, ty, x + colW, ty)
    ty += 4.5

    for (const row of rows) {
      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")
      setText(DARK)
      doc.text(truncate(row.label, colW - 42), x, ty)
      doc.setFont("helvetica", "bold")
      doc.text(row.value, x + colW - 16, ty, { align: "right" })
      doc.setFont("helvetica", "normal")
      setText(GRAY)
      doc.setFontSize(7.5)
      doc.text(row.hint, x + colW, ty, { align: "right" })
      ty += 6.5
    }
    return ty
  }

  const typeEndY = drawMiniTable(
    leftX,
    blockTop,
    "Por tipo",
    report.byType.map((t) => ({
      label: t.label,
      value: fmtMoney(t.total, currency),
      hint: `${t.share.toFixed(1)}%`,
    }))
  )

  const accountEndY = drawMiniTable(
    rightX,
    blockTop,
    "Por cuenta pagadora",
    topAccounts.length > 0
      ? topAccounts.map((a) => ({
          label: a.account,
          value: fmtMoney(a.total, currency),
          hint: `${a.count}`,
        }))
      : [{ label: "Sin cuentas registradas", value: "-", hint: "" }]
  )

  y = Math.max(typeEndY, accountEndY) + 4

  if (report.byAccount.length > topAccounts.length) {
    doc.setFontSize(7)
    doc.setFont("helvetica", "italic")
    setText(GRAY)
    doc.text(
      `Se listan las ${topAccounts.length} cuentas con mayor gasto de ${report.byAccount.length}.`,
      rightX,
      y
    )
    doc.setFont("helvetica", "normal")
    y += 5
  }

  // ============================================== DETALLE DE GASTOS ======
  const detailRows = report.detail.slice(0, MAX_DETAIL_ROWS)
  const truncated = report.detail.length > detailRows.length

  // El detalle arranca en la página actual si quedan al menos ~9 filas útiles;
  // si no, en una nueva, para no cortar la sección apenas empezada.
  ensure(72)
  sectionTitle(
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
    setFill(LIGHT)
    doc.rect(MARGIN, y, CONTENT_W, 7, "F")
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "bold")
    setText(GRAY)
    doc.text("FECHA", dc.date, y + 4.7)
    doc.text("DESCRIPCIÓN", dc.desc, y + 4.7)
    doc.text("CATEGORÍA", dc.cat, y + 4.7)
    doc.text("TIPO", dc.type, y + 4.7)
    doc.text("CUENTA", dc.account, y + 4.7)
    doc.text("IMPORTE", dc.amount, y + 4.7, { align: "right" })
    y += 7
  }
  drawDetailHeader()

  detailRows.forEach((row, i) => {
    if (y + 6.2 > FOOTER_TOP) {
      addPage()
      drawDetailHeader()
    }
    if (i % 2 === 1) {
      setFill([250, 251, 253] as const)
      doc.rect(MARGIN, y, CONTENT_W, 6.2, "F")
    }
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "normal")
    setText(GRAY)
    doc.text(fmtDate(row.date), dc.date, y + 4.2)

    setText(DARK)
    doc.text(truncate(row.description, widths.desc), dc.desc, y + 4.2)

    setFill(hexToRgb(row.categoryColor))
    doc.roundedRect(dc.cat, y + 1.9, 2.2, 2.2, 0.4, 0.4, "F")
    setText(GRAY)
    doc.text(truncate(row.category, widths.cat - 4), dc.cat + 3.6, y + 4.2)
    doc.text(row.type === "recurring" ? "Fijo" : "Variable", dc.type, y + 4.2)
    doc.text(truncate(row.account, widths.account), dc.account, y + 4.2)

    doc.setFont("helvetica", "bold")
    setText(DARK)
    doc.text(fmtMoney(row.amount, currency), dc.amount, y + 4.2, { align: "right" })
    y += 6.2
  })

  if (y + 9 > FOOTER_TOP) addPage()
  setFill(PRIMARY)
  doc.rect(MARGIN, y, CONTENT_W, 8, "F")
  doc.setFontSize(8.5)
  doc.setFont("helvetica", "bold")
  setText(WHITE)
  doc.text(
    truncated ? `TOTAL DEL PERÍODO (${report.detail.length} gastos)` : "TOTAL DEL PERÍODO",
    dc.date + 1,
    y + 5.4
  )
  doc.text(fmtMoney(report.summary.total, currency), dc.amount - 1, y + 5.4, { align: "right" })
  y += 12

  drawFooters()
  return doc.output("arraybuffer")

  // ------------------------------------------------------------ footer ----
  function drawFooters() {
    const pages = doc.getNumberOfPages()
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p)
      setDraw(BORDER)
      doc.setLineWidth(0.2)
      doc.line(MARGIN, PAGE_H - 12, RIGHT, PAGE_H - 12)
      doc.setFontSize(7)
      doc.setFont("helvetica", "normal")
      setText(GRAY)
      const left = [company.name, company.taxId ? `CUIT ${company.taxId}` : ""]
        .filter(Boolean)
        .join("  ·  ")
      doc.text(left, MARGIN, PAGE_H - 8)
      doc.text(
        `Generado el ${fmtDateTime(generatedAt)}  ·  Página ${p} de ${pages}`,
        RIGHT,
        PAGE_H - 8,
        { align: "right" }
      )
    }
  }
}

/**
 * Sector de torta como polígono. jsPDF no tiene primitiva de arco: se aproxima
 * el arco con segmentos de 5° (imperceptible al imprimir).
 */
function drawPieSlice(
  doc: jsPDF,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  color: RGB
) {
  const sweep = endAngle - startAngle
  if (sweep <= 0) return
  const segments = Math.max(2, Math.ceil(sweep / (Math.PI / 36)))
  const deltas: Array<[number, number]> = []
  let prevX = cx
  let prevY = cy

  for (let i = 0; i <= segments; i++) {
    const a = startAngle + (sweep * i) / segments
    const px = cx + radius * Math.cos(a)
    const py = cy + radius * Math.sin(a)
    deltas.push([px - prevX, py - prevY])
    prevX = px
    prevY = py
  }

  doc.setFillColor(color[0], color[1], color[2])
  doc.lines(deltas, cx, cy, [1, 1], "F", true)
}

/** Gráfico de barras verticales con eje Y de 3 marcas. Devuelve el `y` final. */
function drawBarChart(
  doc: jsPDF,
  opts: {
    x: number
    y: number
    width: number
    height: number
    buckets: Array<{ label: string; total: number }>
    currency: string
  }
): number {
  const { x, y, width, height, buckets, currency } = opts
  const axisW = 20 // espacio para las etiquetas del eje Y
  const plotX = x + axisW
  const plotW = width - axisW
  const plotBottom = y + height
  const max = Math.max(...buckets.map((b) => b.total), 0)

  // Grilla + eje Y (0 / mitad / máximo)
  doc.setFontSize(6.5)
  doc.setFont("helvetica", "normal")
  for (const step of [0, 0.5, 1]) {
    const value = max * step
    const gy = plotBottom - height * step
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2])
    doc.setLineWidth(0.15)
    doc.line(plotX, gy, plotX + plotW, gy)
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2])
    doc.text(fmtCompact(value, currency), plotX - 2, gy + 1.5, { align: "right" })
  }

  // Barras
  const slot = plotW / buckets.length
  const barW = Math.min(slot * 0.62, 9)
  buckets.forEach((bucket, i) => {
    const barH = max > 0 ? (bucket.total / max) * height : 0
    const bx = plotX + slot * i + (slot - barW) / 2
    if (barH > 0.3) {
      doc.setFillColor(PRIMARY[0], PRIMARY[1], PRIMARY[2])
      doc.roundedRect(bx, plotBottom - barH, barW, barH, 0.6, 0.6, "F")
    }
  })

  // Etiquetas del eje X: se saltean si no entran para no encimarse.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / Math.floor(plotW / 9)))
  doc.setFontSize(6)
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2])
  buckets.forEach((bucket, i) => {
    if (i % labelEvery !== 0 && i !== buckets.length - 1) return
    doc.text(bucket.label, plotX + slot * i + slot / 2, plotBottom + 4, { align: "center" })
  })

  return plotBottom + 7
}
