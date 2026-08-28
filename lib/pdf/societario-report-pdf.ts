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
import type {
  SocietarioBreakdownRow,
  SocietarioReport,
  SocietarioWaterfallStep,
} from "@/lib/reports/societario-report"
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

const { DARK, GRAY, DANGER, LIGHT, PRIMARY, WHITE, BORDER } = REPORT_COLORS
const { MARGIN, CONTENT_W, RIGHT, FOOTER_TOP } = REPORT_GEOMETRY

/** Fila de la cascada ya aplanada, con su nivel de anidado. */
interface FlatWaterfallRow {
  label: string
  hint?: string
  amount: number
  depth: 0 | 1 | 2
  kind: string
}

function flattenBreakdown(rows: SocietarioBreakdownRow[], depth: 1 | 2): FlatWaterfallRow[] {
  const out: FlatWaterfallRow[] = []
  for (const row of rows) {
    out.push({ label: row.label, hint: row.hint, amount: row.amount, depth, kind: "detail" })
    if (row.children?.length && depth === 1) {
      out.push(...flattenBreakdown(row.children, 2))
    }
  }
  return out
}

function flattenWaterfall(steps: SocietarioWaterfallStep[]): FlatWaterfallRow[] {
  const out: FlatWaterfallRow[] = []
  for (const step of steps) {
    out.push({ label: step.label, amount: step.amount, depth: 0, kind: step.kind })
    if (step.breakdown?.length) out.push(...flattenBreakdown(step.breakdown, 1))
  }
  return out
}

/**
 * Cascada del resultado con su desglose anidado.
 *
 * Va a mano y no con `b.table()` porque el kit no soporta sangría por fila, y
 * acá la jerarquía ES la información: el desglose tiene que leerse como parte
 * del concepto que explica, no como una tabla suelta.
 */
function drawWaterfall(
  b: ReportPdfBuilder,
  rows: FlatWaterfallRow[],
  money: (n: number) => string
) {
  const doc = b.doc
  const HEIGHTS = { 0: 7.5, 1: 5.6, 2: 5 } as const

  for (const row of rows) {
    const h = HEIGHTS[row.depth]
    if (b.y + h > FOOTER_TOP) b.addPage()

    const esResultado = row.kind === "result"
    const esSubtotal = row.kind === "subtotal"

    if (esResultado) {
      b.setFill(PRIMARY)
      doc.rect(MARGIN, b.y, CONTENT_W, h, "F")
    } else if (esSubtotal) {
      b.setFill(LIGHT)
      doc.rect(MARGIN, b.y, CONTENT_W, h, "F")
    } else if (row.depth > 0) {
      // Banda muy tenue: agrupa visualmente el detalle bajo su concepto sin
      // competir con las líneas de la cascada.
      b.setFill([250, 251, 253])
      doc.rect(MARGIN, b.y, CONTENT_W, h, "F")
    }

    const textY = b.y + h / 2 + 1.3
    const x = MARGIN + 2 + row.depth * 6
    const fontSize = row.depth === 0 ? 8.5 : row.depth === 1 ? 7.5 : 7

    doc.setFontSize(fontSize)
    doc.setFont("helvetica", row.depth === 0 && (esSubtotal || esResultado) ? "bold" : "normal")
    b.setText(esResultado ? WHITE : row.depth === 0 ? DARK : GRAY)

    const label = row.hint ? `${row.label}  ·  ${row.hint}` : row.label
    doc.text(b.truncate(label, CONTENT_W - 50 - row.depth * 6), x, textY)

    doc.setFont("helvetica", row.depth === 0 ? "bold" : "normal")
    b.setText(esResultado ? WHITE : row.amount < 0 ? DANGER : row.depth === 0 ? DARK : GRAY)
    doc.text(money(row.amount), RIGHT - 2, textY, { align: "right" })

    b.y += h
  }

  b.setDraw(BORDER)
  doc.setLineWidth(0.2)
  doc.line(MARGIN, b.y, RIGHT, b.y)
  b.y += 5
}

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
  const { resultado, ventas, gastos, financiero, comisiones, socios, ventaNeta } = report

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
    // Sin esto, "venta neta" es un número sin criterio: los dos modos difieren
    // en un orden de magnitud y el lector no tendría cómo saber cuál está viendo.
    `Venta neta: IVA sobre ${ventaNeta.criterio === "VENTA" ? "la venta" : "el margen"}`,
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
      // Abreviado a propósito: con cinco KPIs el valor se corta, así que la
      // venta neta viaja en el hint y desarrollada en la nota de abajo.
      hint: `${ventas.count} ops · neto de IVA ${money(ventaNeta.neta)}`,
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

  // El resultado financiero entra en la condición: un período con sólo
  // movimientos de financiera tiene resultado, y cortar acá dejaría el PDF sin
  // la cascada que lo explica.
  if (ventas.count === 0 && gastos.count === 0 && financiero.count === 0) {
    b.emptyState(
      "Sin movimientos en el período",
      `No se encontraron ventas ni gastos entre ${fmtDate(report.dateFrom)} y ${fmtDate(
        report.dateTo
      )} con los filtros aplicados.`
    )
    return b.finish()
  }

  // ======================================================== RESULTADO =====
  b.ensure(30)
  b.sectionTitle(
    "Cómo se llega a la ganancia a repartir",
    `${ventas.count} operaciones · ${gastos.count} gastos · cada concepto abierto en sus componentes`
  )

  drawWaterfall(b, flattenWaterfall(resultado.waterfall), money)

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
  b.note(
    ventaNeta.criterio === "VENTA"
      ? `Venta neta de IVA: ${money(ventaNeta.neta)} = ${money(ventaNeta.bruta)} ÷ ` +
          `${(1 + ventaNeta.ivaRate).toLocaleString("es-AR")}, tratando la venta como IVA incluido. ` +
          `Ese IVA (${money(ventaNeta.iva)}) es el débito bruto: no netea el crédito fiscal del costo ` +
          `del operador. La cascada de arriba NO usa este criterio, sigue con el IVA sobre el margen.`
      : `Venta neta de IVA: ${money(ventaNeta.neta)} = ${money(ventaNeta.bruta)} − ` +
          `${money(ventaNeta.iva)}, el débito fiscal sobre el margen. Es el criterio de una agencia ` +
          `de intermediación: el IVA no se calcula sobre el total del paquete.`
  )
  if (gastos.excludedTouristic > 0) {
    b.note(
      `Se excluyeron ${gastos.excludedTouristic} movimiento(s) turístico(s) —pagos a operador y ` +
        `devoluciones— porque ya están descontados del margen. Por eso este total de gastos es menor ` +
        `que el del reporte de Gastos.`
    )
  }
  if (financiero.count > 0) {
    b.note(
      `El resultado financiero es la bonificación por depósito (${money(financiero.ingresos)}) menos ` +
        `la comisión de la financiera (${money(financiero.costos)}). No forma parte de los gastos ` +
        `operativos: es plata que entra y sale por la forma de pagar a los operadores, no por hacer ` +
        `funcionar la agencia.`
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
