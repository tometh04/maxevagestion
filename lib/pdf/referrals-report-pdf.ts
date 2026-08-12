/**
 * Generador del PDF "Reporte de Referidores" (VIB-122).
 *
 * Función pura sobre `lib/pdf/report-kit.ts`: recibe el reporte ya agregado por
 * `lib/reports/referrals-report.ts` y el branding del tenant. Gemelo del PDF de
 * comisiones del vendedor, pero centrado en el socio que trajo al cliente.
 *
 * Está pensado para presentarle a la dirección (o al propio referidor) cuánto le
 * corresponde: sobre qué operaciones, en qué mes y qué parte ya se pagó.
 */

import type { ReportCompany } from "@/lib/reports/report-company"
import type { ReferralsReport } from "@/lib/reports/referrals-report"
import type { ReferralsReportFilters } from "@/lib/reports/referrals-report-data"
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

/** Color del cuadradito cuando el referidor no está en `byPartner` (sin total). */
const FALLBACK_SWATCH = "#94A3B8"

/** Máximo de filas del detalle. Si se supera, el PDF lo dice explícitamente. */
const MAX_DETAIL_ROWS = 1000

/** Límites para que la matriz referidor × mes siga siendo legible impresa. */
const MATRIX_MAX_MONTHS = 14
const MATRIX_MAX_PARTNERS = 20

export interface ReferralsReportPdfParams {
  report: ReferralsReport
  filters: ReferralsReportFilters
  company: ReportCompany
  generatedAt?: Date
}

export function generateReferralsReportPdf({
  report,
  filters,
  company,
  generatedAt = new Date(),
}: ReferralsReportPdfParams): ArrayBuffer {
  const currency = report.currency
  const money = (amount: number) => fmtMoney(amount, currency)

  const b = new ReportPdfBuilder({
    company,
    generatedAt,
    title: "REPORTE DE REFERIDORES",
    subtitle: `${fmtDate(report.dateFrom)}  –  ${fmtDate(report.dateTo)}`,
    meta: `Moneda: ${currency}`,
    continuationLine: `Reporte de referidores · ${fmtDate(report.dateFrom)} – ${fmtDate(
      report.dateTo
    )} · ${currency}`,
  })
  const doc = b.doc

  b.coverBand()

  b.filtersLine([
    `Referidor: ${filters.partnerName || "Todos"}`,
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
      label: "Promedio por referidor",
      value: money(report.summary.averagePerPartner),
      hint: `${report.summary.partnersCount} referidor(es) con comisión en el período`,
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
      "Sin comisiones de referidor en el período",
      `No se encontraron comisiones en ${currency} sobre ventas entre ${fmtDate(
        report.dateFrom
      )} y ${fmtDate(report.dateTo)} con los filtros aplicados.`
    )
    return b.finish()
  }

  // ================================================= TORTA POR REFERIDOR ===
  const legendRows = Math.min(report.byPartner.length, 9)
  b.ensure(18 + Math.max(62, legendRows * 6 + 8))
  b.sectionTitle(
    "Participación por referidor",
    `Reparto de ${money(report.summary.total)} entre ${report.summary.partnersCount} referidor(es)`
  )
  b.donutWithLegend({
    slices: report.byPartner.map((p) => ({
      label: p.partnerName,
      value: p.total,
      share: p.share,
      color: p.color,
    })),
    total: report.summary.total,
    currency,
    restLabel: (n) => `Otros ${n} referidores`,
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

  // ================================================= TABLA POR REFERIDOR ===
  b.sectionTitle("Detalle por referidor")

  const partnerCols = {
    name: MARGIN + 2,
    ops: MARGIN + 49,
    pending: MARGIN + 77,
    paid: MARGIN + 105,
    total: MARGIN + 133,
    barX: MARGIN + 136,
  }
  const partnerBarW = RIGHT - partnerCols.barX - 14
  b.table({
    rows: report.byPartner,
    columns: [
      {
        header: "REFERIDOR",
        x: partnerCols.name,
        width: 40,
        cell: (p) => p.partnerName,
        color: () => DARK,
        swatch: (p) => p.color,
      },
      {
        header: "OPS",
        x: partnerCols.ops,
        align: "right",
        cell: (p) => String(p.operationsCount),
      },
      {
        header: "POR PAGAR",
        x: partnerCols.pending,
        align: "right",
        cell: (p) => money(p.pending),
      },
      {
        header: "PAGADAS",
        x: partnerCols.paid,
        align: "right",
        cell: (p) => money(p.paid),
      },
      {
        header: "TOTAL",
        x: partnerCols.total,
        align: "right",
        cell: (p) => money(p.total),
        bold: true,
      },
      {
        header: "% DEL TOTAL",
        x: RIGHT - 2,
        align: "right",
        cell: (p) => fmtPct(p.share),
      },
    ],
    bar: {
      x: partnerCols.barX,
      width: partnerBarW,
      share: (p) => p.share,
      color: (p) => p.color,
    },
    total: {
      cells: [
        { x: partnerCols.name, text: "TOTAL" },
        { x: partnerCols.ops, align: "right", text: String(report.summary.operationsCount) },
        { x: partnerCols.pending, align: "right", text: money(report.summary.pending) },
        { x: partnerCols.paid, align: "right", text: money(report.summary.paid) },
        { x: partnerCols.total, align: "right", text: money(report.summary.total) },
        { x: RIGHT - 2, align: "right", text: "100%" },
      ],
    },
  })

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

  // ========================================== MATRIZ REFERIDOR × MES =======
  const months = report.byMonth
  const matrixFits =
    months.length > 1 &&
    months.length <= MATRIX_MAX_MONTHS &&
    report.byPartnerMonth.length <= MATRIX_MAX_PARTNERS

  if (months.length > 1) {
    b.ensure(24 + Math.min(report.byPartnerMonth.length, MATRIX_MAX_PARTNERS) * 6)
    b.sectionTitle("Comisiones por referidor y mes")

    if (!matrixFits) {
      b.note(
        `La matriz se omite: el período tiene ${months.length} meses y ${report.byPartnerMonth.length} ` +
          `referidores, y no entra legible en una hoja. Acotá el rango de fechas o filtrá por referidor ` +
          `para verla.`,
        { advance: 8 }
      )
    } else {
      const nameW = 42
      const gridX = MARGIN + nameW + 4
      const cellW = (RIGHT - gridX - 26) / months.length

      b.table({
        rows: report.byPartnerMonth,
        fontSize: 7,
        columns: [
          {
            header: "REFERIDOR",
            x: MARGIN + 2,
            width: nameW,
            cell: (r) => r.partnerName,
            color: () => DARK,
          },
          ...months.map((m, i) => ({
            header: m.label,
            x: gridX + cellW * (i + 1) - 1,
            align: "right" as const,
            cell: (r: (typeof report.byPartnerMonth)[number]) =>
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
    "Detalle por referidor",
    truncated
      ? `Se listan las primeras ${detailRows.length} de ${report.detail.length} comisiones del período.`
      : `Qué operaciones trajo cada referidor y cuánto le corresponde, de la venta más reciente a la más antigua.`
  )

  // Agrupado por referidor y no como lista plana: el reporte se le puede entregar
  // a cada socio, así que lo suyo tiene que leerse junto y con su propio subtotal.
  const rowsByPartner = new Map<string, typeof detailRows>()
  for (const row of detailRows) {
    const list = rowsByPartner.get(row.partnerId) || []
    list.push(row)
    rowsByPartner.set(row.partnerId, list)
  }
  const orderedPartners = [
    ...report.byPartner.filter((p) => rowsByPartner.has(p.partnerId)),
    ...Array.from(rowsByPartner.keys())
      .filter((id) => !report.byPartner.some((p) => p.partnerId === id))
      .map((id) => ({
        partnerId: id,
        partnerName: rowsByPartner.get(id)?.[0]?.partnerName || "Sin referidor",
        color: FALLBACK_SWATCH,
      })),
  ]

  const dc = {
    date: MARGIN + 4,
    file: MARGIN + 24,
    destination: MARGIN + 52,
    customer: MARGIN + 106,
    status: MARGIN + 155,
    amount: RIGHT - 1,
  }
  const widths = { file: 26, destination: 52, customer: 46 }

  const drawDetailHeader = () => {
    b.setFill(LIGHT)
    doc.rect(MARGIN, b.y, CONTENT_W, 7, "F")
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "bold")
    b.setText(GRAY)
    doc.text("FECHA", dc.date, b.y + 4.7)
    doc.text("FILE", dc.file, b.y + 4.7)
    doc.text("DESTINO", dc.destination, b.y + 4.7)
    doc.text("CLIENTE", dc.customer, b.y + 4.7)
    doc.text("ESTADO", dc.status, b.y + 4.7, { align: "right" })
    doc.text("COMISIÓN", dc.amount, b.y + 4.7, { align: "right" })
    b.y += 7
  }
  drawDetailHeader()

  for (const partner of orderedPartners) {
    const rows = rowsByPartner.get(partner.partnerId) || []
    if (rows.length === 0) continue

    const subtotal = rows.reduce((acc, r) => acc + r.amount, 0)

    if (b.y + 8 + 6.2 > FOOTER_TOP) {
      b.addPage()
      drawDetailHeader()
    }
    b.setFill(LIGHT)
    doc.rect(MARGIN, b.y, CONTENT_W, 8, "F")
    b.setFill(hexToRgb(partner.color))
    doc.roundedRect(MARGIN + 2, b.y + 2.7, 2.6, 2.6, 0.5, 0.5, "F")
    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    b.setText(DARK)
    doc.text(b.truncate(partner.partnerName, 70), MARGIN + 7, b.y + 5.4)
    b.setText(GRAY)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.text(`${rows.length} comisión${rows.length === 1 ? "" : "es"}`, dc.customer, b.y + 5.4)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    b.setText(DARK)
    doc.text(money(subtotal), dc.amount, b.y + 5.4, { align: "right" })
    b.y += 8

    rows.forEach((row, i) => {
      // El %/base van en una sublínea gris en vez de sumar columnas: mantiene la
      // fila legible y hace que el destino y el cliente sigan entrando.
      const subline = [
        row.percentage != null ? `${row.percentage}%` : "",
        row.baseAmount != null ? `sobre ${money(row.baseAmount)}` : "",
      ]
        .filter(Boolean)
        .join(" ")
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
      doc.text(b.truncate(row.fileCode, widths.file), dc.file, b.y + 4.2)
      doc.text(b.truncate(row.destination, widths.destination), dc.destination, b.y + 4.2)

      b.setText(GRAY)
      doc.text(b.truncate(row.customerName || "-", widths.customer), dc.customer, b.y + 4.2)

      b.setText(row.status === "PAID" ? REPORT_COLORS.SUCCESS : GRAY)
      doc.text(row.status === "PAID" ? "Pagada" : "Por pagar", dc.status, b.y + 4.2, {
        align: "right",
      })

      doc.setFont("helvetica", "bold")
      b.setText(DARK)
      doc.text(money(row.amount), dc.amount, b.y + 4.2, { align: "right" })

      if (subline) {
        doc.setFont("helvetica", "italic")
        doc.setFontSize(6.5)
        b.setText(GRAY)
        doc.text(b.truncate(subline, 130), dc.file, b.y + 7.6)
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

  // Criterios y exclusiones al pie: el reporte tiene que poder circular solo.
  const notes: string[] = [
    "El mes de cada comisión es el de la fecha de venta de la operación, no el del cálculo.",
    "La comisión del referidor no sale de lo que cobra el vendedor: es plata del socio que trajo al cliente.",
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
