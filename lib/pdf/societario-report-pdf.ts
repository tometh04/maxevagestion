/**
 * Generador del PDF "Reporte Societario" (VIB-101).
 *
 * Función pura sobre `lib/pdf/report-kit.ts`. Es el documento que se lleva a una
 * reunión de socios, así que además de los números lleva sus supuestos: la
 * alícuota de IVA usada, el tipo de cambio, y —sobre todo— que las comisiones
 * están calculadas sobre la ganancia BRUTA. Sin esa aclaración, el lector
 * asume que salieron del margen neto de IVA y el reparto no le va a cerrar.
 */

import type { ReportCompany } from "@/lib/reports/report-company"
import type { SocietarioReport } from "@/lib/reports/societario-report"
import type { SocietarioReportFilters } from "@/lib/reports/societario-report-data"
import {
  REPORT_COLORS,
  REPORT_GEOMETRY,
  ReportPdfBuilder,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtPct,
} from "@/lib/pdf/report-kit"

const { DARK, GRAY, DANGER } = REPORT_COLORS
const { MARGIN, CONTENT_W, RIGHT } = REPORT_GEOMETRY

export interface SocietarioReportPdfParams {
  report: SocietarioReport
  filters: SocietarioReportFilters
  company: ReportCompany
  generatedAt?: Date
}

export function generateSocietarioReportPdf({
  report,
  filters,
  company,
  generatedAt = new Date(),
}: SocietarioReportPdfParams): ArrayBuffer {
  const currency = report.currency
  const money = (amount: number) => fmtMoney(amount, currency)
  const { resultado, ventas, gastos, comisiones, socios } = report

  const b = new ReportPdfBuilder({
    company,
    generatedAt,
    title: "REPORTE SOCIETARIO",
    subtitle: `${fmtDate(report.dateFrom)}  –  ${fmtDate(report.dateTo)}`,
    meta: `Moneda: ${currency} · IVA ${fmtPct(filters.ivaRatePct)}`,
    continuationLine: `Reporte societario · ${fmtDate(report.dateFrom)} – ${fmtDate(
      report.dateTo
    )} · ${currency}`,
  })
  const doc = b.doc

  b.coverBand()

  b.filtersLine([
    `Oficina: ${filters.agencyName || "Todas"}`,
    `IVA aplicado: ${fmtPct(filters.ivaRatePct)}`,
    filters.exchangeRate
      ? `TC fijo: ${filters.exchangeRate.toLocaleString("es-AR")}`
      : "TC de la fecha de cada movimiento",
    `Generado: ${fmtDateTime(generatedAt)}`,
  ])

  // ── Avisos que invalidan el número, antes que cualquier cifra ────────────
  const criticos = report.warnings.filter((w) => w.level === "danger")
  if (criticos.length > 0) {
    b.ensure(10 + criticos.length * 6)
    b.setFill([253, 240, 242])
    b.setDraw(DANGER)
    doc.setLineWidth(0.3)
    const alto = 7 + criticos.length * 5.2
    doc.roundedRect(MARGIN, b.y, CONTENT_W, alto, 2, 2, "FD")
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "bold")
    b.setText(DANGER)
    criticos.forEach((w, i) => {
      doc.text(b.truncate(`• ${w.message}`, CONTENT_W - 10), MARGIN + 5, b.y + 5 + i * 5.2)
    })
    doc.setFont("helvetica", "normal")
    b.y += alto + 5
  }

  b.kpiRow([
    {
      label: "Ganancia neta a repartir",
      value: money(resultado.gananciaNeta),
      hint: `${fmtPct(resultado.netMarginPct)} sobre facturación`,
      accent: true,
    },
    {
      label: "Ventas",
      value: money(ventas.total),
      hint: `${ventas.count} operaciones`,
    },
    {
      label: "Ganancia bruta",
      value: money(resultado.gananciaBruta),
      hint: `${fmtPct(ventas.marginPct)} sobre la venta`,
    },
    {
      label: "Comisiones",
      value: money(comisiones.total),
      hint: `${fmtPct(comisiones.effectiveRate)} de la ganancia bruta`,
    },
  ])

  if (ventas.count === 0 && gastos.count === 0) {
    b.emptyState(
      "Sin movimientos en el período",
      `No se encontraron ventas ni gastos entre ${fmtDate(report.dateFrom)} y ${fmtDate(
        report.dateTo
      )} con los filtros aplicados.`
    )
    return b.finish()
  }

  // ======================================================== RESULTADO =====
  b.ensure(20 + resultado.waterfall.length * 8)
  b.sectionTitle(
    "Cómo se llega a la ganancia a repartir",
    `${ventas.count} operaciones · ${gastos.count} gastos`
  )

  b.table({
    columns: [
      {
        header: "Concepto",
        x: MARGIN + 2,
        width: 110,
        cell: (row: (typeof resultado.waterfall)[number]) => row.label,
        bold: true,
      },
      {
        header: `Importe (${currency})`,
        x: RIGHT - 2,
        align: "right",
        cell: (row: (typeof resultado.waterfall)[number]) => money(row.amount),
        bold: true,
        color: (row: (typeof resultado.waterfall)[number]) =>
          row.amount < 0 ? DANGER : row.kind === "deduction" ? GRAY : DARK,
      },
    ],
    rows: resultado.waterfall,
    rowHeight: 7.5,
  })

  // La aclaración clave: si falta, quien lee asume que las comisiones salieron
  // del margen neto de IVA y el reparto no le cierra.
  b.note(
    `Las comisiones (vendedores y referidores) están calculadas sobre la ${comisiones.baseLabel}, ` +
      `no sobre el margen neto de IVA. Representan el ${fmtPct(comisiones.effectiveRate)} de la ganancia bruta.`
  )
  b.note(
    `El IVA de ${fmtPct(filters.ivaRatePct)} se estima sobre ${money(resultado.ivaBase)} ` +
      `(suma de los márgenes positivos). Es un parámetro de este reporte: el sistema no guarda ` +
      `una alícuota por operación.`
  )
  if (gastos.excludedTouristic > 0) {
    b.note(
      `Se excluyeron ${gastos.excludedTouristic} movimiento(s) turístico(s) —pagos a operador y ` +
        `devoluciones— porque ya están descontados del margen. Por eso este total de gastos es menor ` +
        `que el del reporte de Gastos.`
    )
  }

  // ========================================================== SOCIOS ======
  b.ensure(24 + socios.rows.length * 8)
  b.sectionTitle(
    "Participación de los socios",
    socios.percentageValid
      ? `Reparto de ${money(resultado.gananciaNeta)}`
      : `Las participaciones suman ${fmtPct(socios.percentageSum)}, no 100%`
  )

  if (socios.rows.length === 0) {
    b.emptyState(
      "Sin socios cargados",
      "No hay socios activos con participación configurada en Cuentas de Socios."
    )
  } else {
    b.table({
      columns: [
        {
          header: "Socio",
          x: MARGIN + 2,
          width: 70,
          cell: (row: (typeof socios.rows)[number]) => row.name,
          swatch: (row: (typeof socios.rows)[number]) => row.color,
        },
        {
          header: "Participación",
          x: MARGIN + 108,
          align: "right",
          cell: (row: (typeof socios.rows)[number]) => fmtPct(row.percentage, 2),
        },
        {
          header: `Le corresponde (${currency})`,
          x: RIGHT - 2,
          align: "right",
          cell: (row: (typeof socios.rows)[number]) => money(row.amount),
          bold: true,
          color: (row: (typeof socios.rows)[number]) => (row.amount < 0 ? DANGER : DARK),
        },
      ],
      rows: socios.rows,
      bar: {
        x: MARGIN + 114,
        width: 26,
        share: (row: (typeof socios.rows)[number]) => row.percentage,
        color: (row: (typeof socios.rows)[number]) => row.color,
      },
      total: {
        accent: true,
        cells: [
          { x: MARGIN + 2, text: "Total repartido" },
          { x: MARGIN + 108, align: "right", text: fmtPct(socios.percentageSum, 2) },
          {
            x: RIGHT - 2,
            align: "right",
            text: money(resultado.gananciaNeta - socios.unassignedAmount),
          },
        ],
      },
    })

    if (Math.abs(socios.unassignedAmount) > 0.01) {
      b.note(
        `Quedan ${money(socios.unassignedAmount)} sin asignar porque las participaciones cargadas ` +
          `suman ${fmtPct(socios.percentageSum)}. Se muestran tal como están configuradas, sin normalizar.`
      )
    }
  }

  // ============================================ DISTRIBUCIÓN REGISTRADA ===
  if (report.allocations && report.allocations.rows.length > 0) {
    const alloc = report.allocations
    b.ensure(24 + alloc.rows.length * 8)
    b.sectionTitle(
      "Distribución ya registrada",
      `${alloc.monthsWithAllocation} de ${alloc.monthsInPeriod} mes(es) del período`
    )

    b.table({
      columns: [
        {
          header: "Socio",
          x: MARGIN + 2,
          width: 70,
          cell: (row: (typeof alloc.rows)[number]) => row.name,
        },
        {
          header: `Distribuido (${currency})`,
          x: MARGIN + 130,
          align: "right",
          cell: (row: (typeof alloc.rows)[number]) => money(row.allocated),
        },
        {
          header: "Diferencia",
          x: RIGHT - 2,
          align: "right",
          cell: (row: (typeof alloc.rows)[number]) =>
            row.difference == null ? "—" : money(row.difference),
          color: (row: (typeof alloc.rows)[number]) =>
            row.difference != null && row.difference < 0 ? DANGER : GRAY,
        },
      ],
      rows: alloc.rows,
    })

    if (!alloc.coversPeriod) {
      b.note(
        "La distribución registrada es mensual y el período elegido no cubre meses completos: " +
          "los montos no son comparables con la participación calculada, por eso no se muestra diferencia."
      )
    }
  }

  return b.finish()
}
