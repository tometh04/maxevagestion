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
  hexToRgb,
} from "@/lib/pdf/report-kit"

const { PRIMARY, DARK, GRAY, LIGHT, WHITE, ZEBRA } = REPORT_COLORS
const { MARGIN, CONTENT_W, RIGHT, FOOTER_TOP } = REPORT_GEOMETRY

/** Color del cuadradito cuando el vendedor no está en `bySeller` (sin total). */
const FALLBACK_SWATCH = "#94A3B8"

/** Etiqueta de origen de la venta, tal como se lee en el detalle. */
function saleTypeLabel(row: {
  role: string
  shared: boolean
  counterpartName: string | null
  managedSellerName?: string | null
}): string {
  // VIB-102: no la vendió, cobra por administrar al vendedor.
  if (row.role === "advisor_manager") {
    return `Administra a ${row.managedSellerName || "un asesor"}`
  }
  if (!row.shared) return "Propia"
  if (row.role === "secondary") return `Socio de ${row.counterpartName || "otro vendedor"}`
  return `Compartida con ${row.counterpartName || "otro vendedor"}`
}

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
      label: "Promedio por vendedor",
      value: money(report.summary.averagePerSeller),
      hint: `${report.summary.sellersCount} vendedor(es) con comisión en el período`,
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
  const composition: string[] = []
  if (report.summary.sharedOperations > 0) {
    composition.push(
      `${report.summary.sharedOperations} operación(es) del período están compartidas entre dos ` +
        `vendedores: cada uno cobra su parte y ambas comisiones se listan por separado.`
    )
  }
  if (report.summary.referredOperations > 0) {
    composition.push(
      `${report.summary.referredOperations} vinieron por un socio referidor. La comisión del ` +
        `referidor se liquida aparte y no está incluida en estos totales.`
    )
  }
  if (composition.length > 0) {
    b.note(composition.join(" "), { advance: 7 })
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
    "Detalle por vendedor",
    truncated
      ? `Se listan las primeras ${detailRows.length} de ${report.detail.length} comisiones del período.`
      : `Qué vendió cada uno y cuánto comisionó, de la venta más reciente a la más antigua.`
  )

  // Agrupado por vendedor y no como lista plana: el reporte se le entrega a cada
  // vendedor, así que lo suyo tiene que leerse junto y con su propio subtotal.
  // Mismo criterio (y mismo pedido del cliente) que el detalle por categoría del
  // Reporte de Gastos. Se respeta el orden de `bySeller`, de mayor a menor.
  const rowsBySeller = new Map<string, typeof detailRows>()
  for (const row of detailRows) {
    const list = rowsBySeller.get(row.sellerId) || []
    list.push(row)
    rowsBySeller.set(row.sellerId, list)
  }
  const orderedSellers = [
    ...report.bySeller.filter((s) => rowsBySeller.has(s.sellerId)),
    ...Array.from(rowsBySeller.keys())
      .filter((id) => !report.bySeller.some((s) => s.sellerId === id))
      .map((id) => ({
        sellerId: id,
        sellerName: rowsBySeller.get(id)?.[0]?.sellerName || "Sin vendedor",
        color: FALLBACK_SWATCH,
      })),
  ]

  // La columna que identifica la fila es el pasajero, no el código de operación
  // (pedido de Lozada). Un nombre necesita bastante más ancho que un file, así
  // que se le da la mayor parte de lo que ocupaba destino.
  const dc = {
    date: MARGIN + 4,
    passenger: MARGIN + 24,
    destination: MARGIN + 72,
    type: MARGIN + 106,
    status: MARGIN + 155,
    amount: RIGHT - 1,
  }
  const widths = { passenger: 46, destination: 32, type: 32 }

  const drawDetailHeader = () => {
    b.setFill(LIGHT)
    doc.rect(MARGIN, b.y, CONTENT_W, 7, "F")
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "bold")
    b.setText(GRAY)
    doc.text("FECHA", dc.date, b.y + 4.7)
    doc.text("PASAJERO", dc.passenger, b.y + 4.7)
    doc.text("DESTINO", dc.destination, b.y + 4.7)
    doc.text("TIPO DE VENTA", dc.type, b.y + 4.7)
    doc.text("ESTADO", dc.status, b.y + 4.7, { align: "right" })
    doc.text("COMISIÓN", dc.amount, b.y + 4.7, { align: "right" })
    b.y += 7
  }
  drawDetailHeader()

  for (const seller of orderedSellers) {
    const rows = rowsBySeller.get(seller.sellerId) || []
    if (rows.length === 0) continue

    const subtotal = rows.reduce((acc, r) => acc + r.amount, 0)

    // El encabezado del vendedor se lleva al menos una fila: solo al pie de una
    // página se leería como si el vendedor no tuviera comisiones.
    if (b.y + 8 + 6.2 > FOOTER_TOP) {
      b.addPage()
      drawDetailHeader()
    }
    b.setFill(LIGHT)
    doc.rect(MARGIN, b.y, CONTENT_W, 8, "F")
    b.setFill(hexToRgb(seller.color))
    doc.roundedRect(MARGIN + 2, b.y + 2.7, 2.6, 2.6, 0.5, 0.5, "F")
    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    b.setText(DARK)
    doc.text(b.truncate(seller.sellerName, 70), MARGIN + 7, b.y + 5.4)
    b.setText(GRAY)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.text(
      `${rows.length} comisión${rows.length === 1 ? "" : "es"}`,
      dc.type,
      b.y + 5.4
    )
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    b.setText(DARK)
    doc.text(money(subtotal), dc.amount, b.y + 5.4, { align: "right" })
    b.y += 8

    rows.forEach((row, i) => {
      // La info opcional (venta, ganancia, referido) va en una sublínea gris en
      // vez de sumar columnas: con seis columnas fijas más dos importes no queda
      // ancho para el destino, y el reporte volvería a ser una pared de números.
      const subline = [
        row.saleAmount != null ? `Venta ${money(row.saleAmount)}` : "",
        row.marginAmount != null ? `Ganancia ${money(row.marginAmount)}` : "",
        row.referralPartnerName ? `Cliente referido por ${row.referralPartnerName}` : "",
      ]
        .filter(Boolean)
        .join("   ·   ")
      const rowHeight = subline ? 9.2 : 6.2
      if (b.y + rowHeight > FOOTER_TOP) {
        b.addPage()
        drawDetailHeader()
      }
      if (i % 2 === 1) {
        b.setFill(ZEBRA)
        doc.rect(MARGIN, b.y, CONTENT_W, rowHeight, "F")
      }

      doc.setFontSize(7.5)
      doc.setFont("helvetica", "normal")
      b.setText(GRAY)
      doc.text(fmtDate(row.operationDate), dc.date, b.y + 4.2)

      b.setText(DARK)
      doc.text(b.truncate(row.passengerName || row.fileCode, widths.passenger), dc.passenger, b.y + 4.2)
      doc.text(b.truncate(row.destination, widths.destination), dc.destination, b.y + 4.2)

      b.setText(GRAY)
      doc.text(b.truncate(saleTypeLabel(row), widths.type), dc.type, b.y + 4.2)

      b.setText(row.status === "PAID" ? REPORT_COLORS.SUCCESS : GRAY)
      doc.text(row.status === "PAID" ? "Pagada" : "Por pagar", dc.status, b.y + 4.2, {
        align: "right",
      })

      doc.setFont("helvetica", "bold")
      b.setText(DARK)
      doc.text(money(row.amount), dc.amount, b.y + 4.2, { align: "right" })

      // Contexto de la fila. El referido va sin monto a propósito: esa comisión
      // es del socio que trajo al cliente y se informa en su propia sección,
      // para que nadie la lea como parte de lo que cobra el vendedor.
      if (subline) {
        doc.setFont("helvetica", "italic")
        doc.setFontSize(6.5)
        b.setText(GRAY)
        doc.text(b.truncate(subline, 130), dc.passenger, b.y + 7.6)
        doc.setFont("helvetica", "normal")
      }
      b.y += rowHeight
    })
  }

  if (b.y + 9 > FOOTER_TOP) b.addPage()
  b.setFill(PRIMARY)
  doc.rect(MARGIN, b.y, CONTENT_W, 8, "F")
  doc.setFontSize(8.5)
  doc.setFont("helvetica", "bold")
  b.setText(WHITE)
  doc.text(
    truncated
      ? `TOTAL DEL PERÍODO (${report.detail.length} comisiones)`
      : "TOTAL DEL PERÍODO",
    dc.date,
    b.y + 5.4
  )
  doc.text(money(report.summary.total), dc.amount - 1, b.y + 5.4, { align: "right" })
  b.y += 12

  // ============================================ REFERIDOS (aparte) =======
  //
  // Sección propia y fuera de todos los totales de arriba: lo que se le paga a
  // un socio referidor no sale de la comisión del vendedor ni se le informa a
  // él. Solo aparece si se pidió incluirla.
  if (report.byReferralPartner.length > 0) {
    const referralTotal = report.byReferralPartner.reduce((acc, r) => acc + r.total, 0)
    const referralPending = report.byReferralPartner.reduce((acc, r) => acc + r.pending, 0)

    b.ensure(24 + report.byReferralPartner.length * 6.5)
    b.sectionTitle(
      "Comisiones de referidos",
      "Lo que le corresponde a cada socio que trajo un cliente. No está incluido en los totales de arriba."
    )

    b.table({
      rows: report.byReferralPartner,
      columns: [
        {
          header: "SOCIO REFERIDOR",
          x: MARGIN + 2,
          width: 70,
          cell: (r) => r.partnerName,
          color: () => DARK,
        },
        {
          header: "OPS",
          x: MARGIN + 96,
          align: "right",
          cell: (r) => String(r.operationsCount),
        },
        {
          header: "POR PAGAR",
          x: MARGIN + 128,
          align: "right",
          cell: (r) => money(r.pending),
        },
        {
          header: "PAGADAS",
          x: MARGIN + 155,
          align: "right",
          cell: (r) => money(r.paid),
        },
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
          { x: MARGIN + 2, text: "TOTAL REFERIDOS" },
          { x: MARGIN + 128, align: "right", text: money(referralPending) },
          { x: RIGHT - 2, align: "right", text: money(referralTotal) },
        ],
      },
    })
  }

  // Criterios y exclusiones al pie: el reporte tiene que poder circular solo.
  const notes: string[] = [
    "El mes de cada comisión es el de la fecha de venta de la operación, no el del cálculo.",
  ]
  if (report.summary.cancelledRecords > 0) {
    notes.push(
      `${report.summary.cancelledRecords} comisión(es) de operaciones canceladas quedaron fuera del total.`
    )
  }
  if (report.summary.settledRecords > 0) {
    notes.push(
      `${report.summary.settledRecords} comisión(es) del período están saldadas y quedaron fuera: ` +
        `se cerraron sin pago y no son deuda.`
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
