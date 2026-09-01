/**
 * Libro Diario — el PDF.
 *
 * Los datos los arma `lib/accounting/libro-diario.ts`. Acá solo se dibuja.
 *
 * UN LIBRO POR MONEDA
 * -------------------
 * Los asientos se separan por moneda y cada una lleva su sección con sus
 * totales. Mezclarlas en una sola tabla daría un total que suma pesos con
 * dólares, y ese número no significa nada. Es el mismo criterio que en el resto
 * del módulo contable.
 *
 * POR QUÉ CADA LÍNEA ES UNA FILA
 * ------------------------------
 * Un Libro Diario se lee como una lista continua: fecha, número, cuenta,
 * detalle, Debe y Haber. Aplanando cada asiento en sus líneas, la tabla del
 * `ReportPdfBuilder` se encarga de la paginación y de repetir el encabezado en
 * cada hoja, que es lo que hace legible un libro impreso de cincuenta páginas.
 *
 * El número y la fecha se imprimen solo en la primera línea de cada asiento,
 * para que se vea dónde empieza uno y termina el otro sin agregar separadores.
 */
import {
  fmtDate,
  ReportPdfBuilder,
  REPORT_COLORS,
  REPORT_GEOMETRY,
  type ReportPdfCompany,
} from "./report-kit"
import type { AsientoDelDiario, LibroDiario } from "@/lib/accounting/libro-diario"

const { MARGIN, RIGHT } = REPORT_GEOMETRY

interface FilaDelDiario {
  numero: string
  fecha: string
  cuenta: string
  detalle: string
  debe: string
  haber: string
  /** Para marcar visualmente el arranque de cada asiento. */
  primera: boolean
  descuadrado: boolean
}

const plata = (n: number) =>
  n === 0
    ? ""
    : n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Aplana los asientos de una moneda en las filas que dibuja la tabla. */
function filasDe(asientos: AsientoDelDiario[]): FilaDelDiario[] {
  const filas: FilaDelDiario[] = []
  for (const a of asientos) {
    a.lineas.forEach((l, i) => {
      filas.push({
        numero: i === 0 ? String(a.numero) : "",
        fecha: i === 0 ? fmtDate(a.fecha) : "",
        cuenta: `${l.account_code}  ${l.account_name}`,
        detalle: l.concepto,
        debe: plata(l.debe),
        haber: plata(l.haber),
        primera: i === 0,
        descuadrado: a.descuadrado,
      })
    })
  }
  return filas
}

export interface LibroDiarioPdfParams {
  libro: LibroDiario
  company: ReportPdfCompany
  /** Nombre de la agencia, si el libro es de una sola. */
  agencia?: string | null
  generatedAt?: Date
}

export function generateLibroDiarioPdf({
  libro,
  company,
  agencia,
  generatedAt = new Date(),
}: LibroDiarioPdfParams): ArrayBuffer {
  const periodo = `${fmtDate(libro.desde)}  –  ${fmtDate(libro.hasta)}`

  const b = new ReportPdfBuilder({
    company,
    generatedAt,
    title: "LIBRO DIARIO",
    subtitle: periodo,
    meta: agencia ? `Agencia: ${agencia}` : "Todas las agencias",
    continuationLine: `Libro Diario · ${periodo}`,
  })

  b.coverBand()

  const monedas = Object.keys(libro.totalesPorMoneda).sort()

  if (monedas.length === 0) {
    b.emptyState(
      "Sin asientos en el período",
      "No hay movimientos contables registrados entre esas fechas."
    )
    return b.finish()
  }

  // El aviso va arriba y no al pie: si el libro tiene asientos que no cuadran,
  // el contador tiene que saberlo antes de leerlo, no después.
  if (libro.descuadrados > 0) {
    b.note(
      `Atención: ${libro.descuadrados} ${
        libro.descuadrados === 1 ? "asiento tiene" : "asientos tienen"
      } una sola línea, así que su Debe y su Haber no coinciden. Se listan tal como están registrados: corregirlos automáticamente alteraría el libro.`
    )
  }

  if (libro.vacios > 0) {
    b.note(
      `${libro.vacios} ${
        libro.vacios === 1 ? "encabezado quedó" : "encabezados quedaron"
      } fuera del libro por no tener ninguna línea. Numerarlos dejaría un renglón en blanco, que es lo que la exigencia de llevar el Diario sin blancos prohíbe.`
    )
  }

  for (const moneda of monedas) {
    const asientos = libro.asientos.filter((a) => a.currency === moneda)
    if (asientos.length === 0) continue

    const total = libro.totalesPorMoneda[moneda]
    b.sectionTitle(
      `Asientos en ${moneda}`,
      `${asientos.length} ${asientos.length === 1 ? "asiento" : "asientos"}`
    )

    b.table<FilaDelDiario>({
      rows: filasDe(asientos),
      rowHeight: 5.5,
      fontSize: 7.5,
      zebra: false,
      columns: [
        { header: "Nº", x: MARGIN, width: 10, cell: (r) => r.numero, bold: true },
        { header: "Fecha", x: MARGIN + 12, width: 20, cell: (r) => r.fecha },
        { header: "Cuenta", x: MARGIN + 34, width: 55, cell: (r) => r.cuenta },
        { header: "Detalle", x: MARGIN + 91, width: 44, cell: (r) => r.detalle },
        {
          header: "Debe",
          x: RIGHT - 26,
          align: "right",
          cell: (r) => r.debe,
          // El asiento que no cuadra se pinta distinto en vez de anotarse
          // aparte: se ve en la misma línea donde está el problema.
          color: (r) => (r.descuadrado ? REPORT_COLORS.DANGER : REPORT_COLORS.DARK),
        },
        {
          header: "Haber",
          x: RIGHT,
          align: "right",
          cell: (r) => r.haber,
          color: (r) => (r.descuadrado ? REPORT_COLORS.DANGER : REPORT_COLORS.DARK),
        },
      ],
      total: {
        accent: true,
        cells: [
          { x: MARGIN, text: `Totales del período en ${moneda}` },
          { x: RIGHT - 26, align: "right", text: plata(total.debe) },
          { x: RIGHT, align: "right", text: plata(total.haber) },
        ],
      },
    })
  }

  return b.finish()
}
