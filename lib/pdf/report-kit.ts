/**
 * Kit compartido de los PDF de reportes (gastos, comisiones, ventas, caja).
 *
 * Nació extrayendo `lib/pdf/expenses-report-pdf.ts` (VIB-64) para que los cuatro
 * reportes sean el mismo documento con distinto contenido: misma banda de marca,
 * mismos KPIs, mismos títulos de sección, mismo pie con "Página X de Y", mismos
 * gráficos dibujados con primitivas de jsPDF (no hay canvas en el server).
 *
 * Reparto de responsabilidades:
 *  - `ReportPdfBuilder` tiene el estado del documento (cursor vertical, página,
 *    branding) y todo lo que avanza ese cursor.
 *  - Los gráficos son funciones libres: reciben coordenadas explícitas y no
 *    tocan el cursor.
 *
 * NOTA sobre el reporte de gastos: sus dos tablas quedaron escritas a mano en su
 * propio generador y NO se migraron a `table()`. Reescribirlas cambiaría el orden
 * de operadores que jsPDF emite y, con eso, un documento que ya está en
 * producción. El test de caracterización de
 * `lib/pdf/__tests__/expenses-report-pdf.test.ts` justamente impide ese cambio.
 * Los reportes nuevos sí usan `table()`.
 */

import jsPDF from "jspdf"

export type RGB = readonly [number, number, number]

// ---------------------------------------------------------------- paleta ----
export const REPORT_COLORS = {
  /** Vibook indigo (--primary). */
  PRIMARY: [66, 88, 229] as RGB,
  DARK: [30, 35, 48] as RGB,
  GRAY: [122, 130, 145] as RGB,
  LIGHT: [242, 244, 249] as RGB,
  BORDER: [223, 227, 236] as RGB,
  WHITE: [255, 255, 255] as RGB,
  /** Fondo de las filas impares en las tablas. */
  ZEBRA: [250, 251, 253] as RGB,
  /** Riel de las barras de participación. */
  TRACK: [233, 236, 243] as RGB,
  /** Rojo de saldos negativos / vencidos. */
  DANGER: [200, 55, 75] as RGB,
  /** Verde de saldos a favor. */
  SUCCESS: [30, 145, 100] as RGB,
} as const

const { PRIMARY, DARK, GRAY, LIGHT, BORDER, WHITE, ZEBRA, TRACK } = REPORT_COLORS

// ------------------------------------------------------------- geometría ----
export const REPORT_GEOMETRY = {
  PAGE_W: 210,
  PAGE_H: 297,
  MARGIN: 15,
  CONTENT_W: 180,
  RIGHT: 195,
  /** Por debajo de esto solo va el pie de página. */
  FOOTER_TOP: 281,
} as const

const { PAGE_W, PAGE_H, MARGIN, CONTENT_W, RIGHT, FOOTER_TOP } = REPORT_GEOMETRY

// La paleta vive en `lib/reports/palette.ts` para que los agregadores puros
// puedan usarla sin importar jsPDF. Se re-exporta acá por comodidad del renderer.
export { REPORT_SERIES_PALETTE, seriesColor } from "@/lib/reports/palette"

const CURRENCY_SYMBOL: Record<string, string> = { ARS: "$", USD: "US$" }

// -------------------------------------------------------------- formato ----

export function hexToRgb(hex: string, fallback: RGB = PRIMARY): RGB {
  const clean = (hex || "").replace("#", "")
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean.padEnd(6, "0").slice(0, 6)
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return fallback
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}

export function fmtMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? currency
  return `${symbol} ${Number(amount || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Monto compacto para ejes y etiquetas de barras ($ 1,2 M / $ 350 k). */
export function fmtCompact(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? currency
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return `${symbol} ${(amount / 1_000_000).toFixed(1).replace(".", ",")} M`
  if (abs >= 1_000) return `${symbol} ${Math.round(amount / 1_000)} k`
  return `${symbol} ${Math.round(amount)}`
}

/** "2026-07-14" → "14/07/2026". No pasa por Date: evita el corrimiento UTC. */
export function fmtDate(dateKey: string): string {
  if (!dateKey || dateKey.length < 10) return "-"
  const [y, m, d] = dateKey.split("-")
  return `${d}/${m}/${y}`
}

export function fmtDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

export function fmtPct(value: number, decimals = 1): string {
  return `${Number(value || 0).toFixed(decimals)}%`
}

// -------------------------------------------------------------- builder ----

export interface ReportPdfCompany {
  name: string
  address: string
  phone: string
  email: string
  website: string
  taxId: string
  logo: string
}

export interface ReportPdfBuilderOptions {
  company: ReportPdfCompany
  /** Inyectable para tests deterministas. */
  generatedAt: Date
  /** Título grande a la derecha de la portada, ej. "REPORTE DE GASTOS". */
  title: string
  /** Segunda línea de la portada, típicamente el período. */
  subtitle?: string
  /** Tercera línea de la portada, típicamente la moneda. */
  meta?: string
  /** Texto derecho de la banda compacta de las páginas 2+. */
  continuationLine: string
}

export interface ReportKpi {
  label: string
  value: string
  hint: string
  /** El destacado va en fondo primario con texto blanco. Uno por fila. */
  accent?: boolean
}

export interface ReportMiniTableRow {
  label: string
  value: string
  hint: string
}

export interface ReportDonutSlice {
  label: string
  value: number
  /** 0-100. */
  share: number
  /** HEX. */
  color: string
}

export interface ReportTableColumn<T> {
  header: string
  /** Coordenada absoluta en mm. Con `align: "right"` es el borde derecho. */
  x: number
  align?: "left" | "right"
  /** Ancho de truncado. Requerido en columnas izquierdas con texto variable. */
  width?: number
  cell: (row: T, index: number) => string
  bold?: boolean
  color?: (row: T) => RGB
  /** Cuadradito de color a la izquierda del texto (HEX). */
  swatch?: (row: T) => string | null
}

export interface ReportTableTotalCell {
  x: number
  align?: "left" | "right"
  text: string
}

export interface ReportTableSpec<T> {
  columns: ReportTableColumn<T>[]
  rows: T[]
  rowHeight?: number
  fontSize?: number
  zebra?: boolean
  /** Barra de participación entre dos columnas. */
  bar?: { x: number; width: number; share: (row: T) => number; color: (row: T) => string }
  /** Fila de cierre. `accent` la pinta con fondo primario y texto blanco. */
  total?: { cells: ReportTableTotalCell[]; accent?: boolean }
}

export class ReportPdfBuilder {
  readonly doc: jsPDF
  /** Cursor vertical en mm. Lo mueven los métodos que dibujan bloques. */
  y = 0

  private readonly company: ReportPdfCompany
  private readonly generatedAt: Date
  private readonly title: string
  private readonly subtitle?: string
  private readonly meta?: string
  private readonly continuationLine: string

  constructor(options: ReportPdfBuilderOptions) {
    this.doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
    this.company = options.company
    this.generatedAt = options.generatedAt
    this.title = options.title
    this.subtitle = options.subtitle
    this.meta = options.meta
    this.continuationLine = options.continuationLine
  }

  setFill(c: RGB) {
    this.doc.setFillColor(c[0], c[1], c[2])
  }

  setDraw(c: RGB) {
    this.doc.setDrawColor(c[0], c[1], c[2])
  }

  setText(c: RGB) {
    this.doc.setTextColor(c[0], c[1], c[2])
  }

  /** Corta con "…" al ancho dado, midiendo con la fuente activa. */
  truncate(text: string, maxWidth: number): string {
    const value = text ?? ""
    if (this.doc.getTextWidth(value) <= maxWidth) return value
    let out = value
    while (out.length > 1 && this.doc.getTextWidth(`${out}…`) > maxWidth) {
      out = out.slice(0, -1)
    }
    return `${out.trim()}…`
  }

  /** Cabecera compacta de las páginas 2+. */
  private drawContinuationHeader() {
    const doc = this.doc
    this.setFill(PRIMARY)
    doc.rect(0, 0, PAGE_W, 12, "F")
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    this.setText(WHITE)
    doc.text(this.company.name.toUpperCase(), MARGIN, 7.8)
    doc.setFont("helvetica", "normal")
    doc.text(this.continuationLine, RIGHT, 7.8, { align: "right" })
  }

  addPage() {
    this.doc.addPage()
    this.drawContinuationHeader()
    this.y = 22
  }

  /** Salta de página si no entran `needed` mm antes del pie. */
  ensure(needed: number) {
    if (this.y + needed > FOOTER_TOP) this.addPage()
  }

  sectionTitle(title: string, subtitle?: string) {
    const doc = this.doc
    this.ensure(subtitle ? 16 : 12)
    this.setFill(PRIMARY)
    doc.rect(MARGIN, this.y, 2.2, 6, "F")
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    this.setText(DARK)
    doc.text(title, MARGIN + 5, this.y + 4.6)
    if (subtitle) {
      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")
      this.setText(GRAY)
      doc.text(subtitle, MARGIN + 5, this.y + 9.4)
      this.y += 13
    } else {
      this.y += 9
    }
  }

  /**
   * Banda de marca de la portada. El logo va sobre una tarjeta blanca: así
   * cualquier logo (claro u oscuro, con o sin transparencia) se lee sobre el
   * color. Sin logo, el nombre y los datos de contacto van en blanco.
   */
  coverBand() {
    const doc = this.doc
    const company = this.company

    this.setFill(PRIMARY)
    doc.rect(0, 0, PAGE_W, 34, "F")

    if (company.logo) {
      try {
        const format =
          company.logo.includes("image/jpeg") || company.logo.includes("image/jpg")
            ? "JPEG"
            : "PNG"
        this.setFill(WHITE)
        doc.roundedRect(MARGIN, 8, 46, 18, 2, 2, "F")
        doc.addImage(company.logo, format, MARGIN + 3, 10, 40, 14)
      } catch {
        doc.setFontSize(16)
        doc.setFont("helvetica", "bold")
        this.setText(WHITE)
        doc.text(this.truncate(company.name.toUpperCase(), 95), MARGIN, 16)
      }
    } else {
      doc.setFontSize(16)
      doc.setFont("helvetica", "bold")
      this.setText(WHITE)
      doc.text(this.truncate(company.name.toUpperCase(), 95), MARGIN, 16)
      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")
      const companyLine = [
        company.taxId ? `CUIT ${company.taxId}` : "",
        company.phone,
        company.email,
      ]
        .filter(Boolean)
        .join("  ·  ")
      if (companyLine) doc.text(this.truncate(companyLine, 95), MARGIN, 21.5)
    }

    doc.setFontSize(15)
    doc.setFont("helvetica", "bold")
    this.setText(WHITE)
    doc.text(this.title, RIGHT, 15, { align: "right" })
    if (this.subtitle) {
      doc.setFontSize(9)
      doc.setFont("helvetica", "normal")
      doc.text(this.subtitle, RIGHT, 21, { align: "right" })
    }
    if (this.meta) {
      doc.setFontSize(8)
      doc.text(this.meta, RIGHT, 26, { align: "right" })
    }

    this.y = 34 + 7
  }

  /**
   * Línea de filtros aplicados. El reporte tiene que ser autoexplicativo cuando
   * se imprime y circula fuera del sistema.
   */
  filtersLine(parts: string[]) {
    const doc = this.doc
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    this.setText(GRAY)
    doc.text(parts.filter(Boolean).join("   ·   "), MARGIN, this.y)
    this.y += 7
  }

  /** Fila de tarjetas de KPI, repartidas a lo ancho del contenido. */
  kpiRow(kpis: ReportKpi[]) {
    const doc = this.doc
    const gap = 4
    const w = (CONTENT_W - gap * (kpis.length - 1)) / kpis.length
    const h = 24

    kpis.forEach((kpi, i) => {
      const x = MARGIN + i * (w + gap)
      this.setFill(kpi.accent ? PRIMARY : LIGHT)
      this.setDraw(BORDER)
      doc.setLineWidth(0.2)
      doc.roundedRect(x, this.y, w, h, 1.8, 1.8, kpi.accent ? "F" : "FD")

      doc.setFontSize(7)
      doc.setFont("helvetica", "bold")
      this.setText(kpi.accent ? WHITE : GRAY)
      doc.text(kpi.label.toUpperCase(), x + 3.5, this.y + 6)

      doc.setFontSize(kpi.accent ? 11.5 : 10.5)
      this.setText(kpi.accent ? WHITE : DARK)
      doc.text(this.truncate(kpi.value, w - 7), x + 3.5, this.y + 13.5)

      doc.setFontSize(6.8)
      doc.setFont("helvetica", "normal")
      this.setText(kpi.accent ? WHITE : GRAY)
      doc.text(this.truncate(kpi.hint, w - 7), x + 3.5, this.y + 19.5)
    })

    this.y += h + 4
  }

  /**
   * Aclaración en cursiva. Se usa para criterios, capados y notas de moneda.
   *
   * Si el texto no entra en el ancho disponible se parte en varias líneas: una
   * nota cortada por el borde de la hoja es peor que no ponerla.
   */
  note(
    text: string,
    opts: { x?: number; fontSize?: number; dy?: number; advance?: number } = {}
  ) {
    const doc = this.doc
    const { x = MARGIN, fontSize = 7.5, dy = 3, advance = 8 } = opts
    doc.setFontSize(fontSize)
    doc.setFont("helvetica", "italic")
    this.setText(GRAY)

    const maxWidth = RIGHT - x
    if (doc.getTextWidth(text) <= maxWidth) {
      doc.text(text, x, this.y + dy)
      this.y += advance
    } else {
      const lines = doc.splitTextToSize(text, maxWidth) as string[]
      const lineHeight = fontSize * 0.48
      lines.forEach((line, i) => {
        doc.text(line, x, this.y + dy + i * lineHeight)
      })
      this.y += advance + (lines.length - 1) * lineHeight
    }

    doc.setFont("helvetica", "normal")
  }

  /** Caja para el caso "no hay nada que mostrar en este período". */
  emptyState(title: string, body: string) {
    const doc = this.doc
    this.y += 6
    this.setFill(LIGHT)
    this.setDraw(BORDER)
    doc.roundedRect(MARGIN, this.y, CONTENT_W, 22, 2, 2, "FD")
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    this.setText(DARK)
    doc.text(title, MARGIN + 6, this.y + 9)
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    this.setText(GRAY)
    doc.text(body, MARGIN + 6, this.y + 15.5)
    this.y += 28
  }

  /**
   * Bloque compacto etiqueta / valor / dato secundario. Pensado para poner dos
   * al lado del otro. Devuelve el `y` final sin tocar el cursor, para que el
   * caller resuelva cuál de las dos columnas quedó más abajo.
   */
  miniTable(
    x: number,
    startY: number,
    title: string,
    rows: ReportMiniTableRow[],
    colW: number
  ): number {
    const doc = this.doc
    let ty = startY
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "bold")
    this.setText(GRAY)
    doc.text(title.toUpperCase(), x, ty)
    ty += 3
    this.setDraw(BORDER)
    doc.setLineWidth(0.2)
    doc.line(x, ty, x + colW, ty)
    ty += 4.5

    for (const row of rows) {
      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")
      this.setText(DARK)
      doc.text(this.truncate(row.label, colW - 42), x, ty)
      doc.setFont("helvetica", "bold")
      doc.text(row.value, x + colW - 16, ty, { align: "right" })
      doc.setFont("helvetica", "normal")
      this.setText(GRAY)
      doc.setFontSize(7.5)
      doc.text(row.hint, x + colW, ty, { align: "right" })
      ty += 6.5
    }
    return ty
  }

  /**
   * Tabla con encabezado repetido en cada página, filas cebra y fila de total
   * opcional. El encabezado se vuelve a dibujar tras cada salto para que una
   * tabla larga siga siendo legible impresa.
   */
  table<T>(spec: ReportTableSpec<T>) {
    const doc = this.doc
    const rowHeight = spec.rowHeight ?? 7
    const fontSize = spec.fontSize ?? 8
    const zebra = spec.zebra !== false

    const drawHeader = () => {
      this.setFill(LIGHT)
      doc.rect(MARGIN, this.y, CONTENT_W, 7, "F")
      doc.setFontSize(7.5)
      doc.setFont("helvetica", "bold")
      this.setText(GRAY)
      for (const col of spec.columns) {
        doc.text(
          col.header,
          col.x,
          this.y + 4.7,
          col.align === "right" ? { align: "right" } : undefined
        )
      }
      this.y += 7
    }

    this.ensure(7 + rowHeight)
    drawHeader()

    spec.rows.forEach((row, i) => {
      if (this.y + rowHeight > FOOTER_TOP) {
        this.addPage()
        drawHeader()
      }
      if (zebra && i % 2 === 1) {
        this.setFill(ZEBRA)
        doc.rect(MARGIN, this.y, CONTENT_W, rowHeight, "F")
      }

      const textY = this.y + rowHeight / 2 + 1.4

      for (const col of spec.columns) {
        let textX = col.x
        const swatchColor = col.swatch?.(row) ?? null
        if (swatchColor) {
          this.setFill(hexToRgb(swatchColor))
          doc.roundedRect(col.x, this.y + rowHeight / 2 - 1.3, 2.4, 2.4, 0.5, 0.5, "F")
          textX = col.x + 3.8
        }

        doc.setFontSize(fontSize)
        doc.setFont("helvetica", col.bold ? "bold" : "normal")
        this.setText(col.color?.(row) ?? (col.bold ? DARK : GRAY))

        const value = col.cell(row, i)
        const text =
          col.width != null
            ? this.truncate(value, col.width - (swatchColor ? 3.8 : 0))
            : value
        doc.text(
          text,
          textX,
          textY,
          col.align === "right" ? { align: "right" } : undefined
        )
      }

      if (spec.bar) {
        const share = spec.bar.share(row)
        this.setFill(TRACK)
        doc.roundedRect(spec.bar.x, this.y + rowHeight / 2 - 1, spec.bar.width, 2, 1, 1, "F")
        if (share > 0) {
          this.setFill(hexToRgb(spec.bar.color(row)))
          doc.roundedRect(
            spec.bar.x,
            this.y + rowHeight / 2 - 1,
            Math.max(0.8, (spec.bar.width * Math.min(share, 100)) / 100),
            2,
            1,
            1,
            "F"
          )
        }
      }

      this.y += rowHeight
    })

    if (spec.total) {
      const h = 8
      if (this.y + h > FOOTER_TOP) this.addPage()
      this.setFill(spec.total.accent ? PRIMARY : LIGHT)
      doc.rect(MARGIN, this.y, CONTENT_W, h, "F")
      doc.setFontSize(8.5)
      doc.setFont("helvetica", "bold")
      this.setText(spec.total.accent ? WHITE : DARK)
      for (const cell of spec.total.cells) {
        doc.text(
          cell.text,
          cell.x,
          this.y + 5.4,
          cell.align === "right" ? { align: "right" } : undefined
        )
      }
      this.y += h + 6
    }
  }

  /**
   * Torta de anillo con la leyenda a la derecha. Las series que no entran en la
   * leyenda se agrupan en una fila "Otras N", con su total y su participación:
   * nunca se descartan en silencio.
   */
  donutWithLegend(opts: {
    slices: ReportDonutSlice[]
    total: number
    currency: string
    maxLegendRows?: number
    restLabel: (count: number) => string
    centerLabel?: string
  }) {
    const doc = this.doc
    const { slices, total, currency } = opts
    const maxLegendRows = opts.maxLegendRows ?? 9

    const chartTop = this.y
    const cx = MARGIN + 32
    const cy = chartTop + 32
    const r = 28

    let angle = -Math.PI / 2
    for (const slice of slices.filter((s) => s.value > 0)) {
      const sweep = total > 0 ? (slice.value / total) * Math.PI * 2 : 0
      drawPieSlice(doc, cx, cy, r, angle, angle + sweep, hexToRgb(slice.color))
      angle += sweep
    }

    this.setFill(WHITE)
    doc.circle(cx, cy, r * 0.56, "F")
    doc.setFontSize(6.5)
    doc.setFont("helvetica", "normal")
    this.setText(GRAY)
    doc.text(opts.centerLabel ?? "TOTAL", cx, cy - 2.5, { align: "center" })
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    this.setText(DARK)
    doc.text(this.truncate(fmtCompact(total, currency), r * 1.05), cx, cy + 3, {
      align: "center",
    })

    const legendX = MARGIN + 70
    const legendW = RIGHT - legendX
    let legendY = chartTop + 4
    const shown = slices.slice(0, maxLegendRows)
    const rest = slices.slice(maxLegendRows)

    for (const slice of shown) {
      this.setFill(hexToRgb(slice.color))
      doc.roundedRect(legendX, legendY - 2.6, 3, 3, 0.6, 0.6, "F")
      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")
      this.setText(DARK)
      doc.text(this.truncate(slice.label, legendW - 52), legendX + 5, legendY)
      doc.setFont("helvetica", "bold")
      doc.text(fmtMoney(slice.value, currency), RIGHT - 14, legendY, { align: "right" })
      this.setText(GRAY)
      doc.setFont("helvetica", "normal")
      doc.text(fmtPct(slice.share), RIGHT, legendY, { align: "right" })
      legendY += 6
    }

    if (rest.length > 0) {
      const restTotal = rest.reduce((acc, s) => acc + s.value, 0)
      const restShare = rest.reduce((acc, s) => acc + s.share, 0)
      this.setFill(BORDER)
      doc.roundedRect(legendX, legendY - 2.6, 3, 3, 0.6, 0.6, "F")
      doc.setFontSize(8)
      doc.setFont("helvetica", "italic")
      this.setText(DARK)
      doc.text(opts.restLabel(rest.length), legendX + 5, legendY)
      doc.setFont("helvetica", "bold")
      doc.text(fmtMoney(restTotal, currency), RIGHT - 14, legendY, { align: "right" })
      this.setText(GRAY)
      doc.setFont("helvetica", "normal")
      doc.text(fmtPct(restShare), RIGHT, legendY, { align: "right" })
      legendY += 6
    }

    this.y = Math.max(cy + r + 8, legendY + 4)
  }

  /** Estampa el pie en todas las páginas y cierra el documento. */
  finish(): ArrayBuffer {
    const doc = this.doc
    const pages = doc.getNumberOfPages()
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p)
      this.setDraw(BORDER)
      doc.setLineWidth(0.2)
      doc.line(MARGIN, PAGE_H - 12, RIGHT, PAGE_H - 12)
      doc.setFontSize(7)
      doc.setFont("helvetica", "normal")
      this.setText(GRAY)
      const left = [this.company.name, this.company.taxId ? `CUIT ${this.company.taxId}` : ""]
        .filter(Boolean)
        .join("  ·  ")
      doc.text(left, MARGIN, PAGE_H - 8)
      doc.text(
        `Generado el ${fmtDateTime(this.generatedAt)}  ·  Página ${p} de ${pages}`,
        RIGHT,
        PAGE_H - 8,
        { align: "right" }
      )
    }
    return doc.output("arraybuffer")
  }
}

// -------------------------------------------------------------- gráficos ----

/**
 * Sector de torta como polígono. jsPDF no tiene primitiva de arco: se aproxima
 * el arco con segmentos de 5° (imperceptible al imprimir).
 */
export function drawPieSlice(
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
export function drawBarChart(
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

/**
 * Barras apiladas (ej. comisiones pagadas vs pendientes por mes) o agrupadas de
 * dos series. Devuelve el `y` final, incluyendo la leyenda de series.
 */
export function drawStackedBarChart(
  doc: jsPDF,
  opts: {
    x: number
    y: number
    width: number
    height: number
    buckets: Array<{ label: string; segments: number[] }>
    series: Array<{ label: string; color: RGB }>
    currency: string
    /** "stacked" apila; "grouped" pone las barras lado a lado. */
    mode?: "stacked" | "grouped"
  }
): number {
  const { x, y, width, height, buckets, series, currency } = opts
  const mode = opts.mode ?? "stacked"
  const axisW = 20
  const plotX = x + axisW
  const plotW = width - axisW
  const plotBottom = y + height

  const bucketTotal = (b: { segments: number[] }) =>
    mode === "stacked"
      ? b.segments.reduce((acc, v) => acc + Math.max(0, v), 0)
      : Math.max(...b.segments.map((v) => Math.max(0, v)), 0)
  const max = Math.max(...buckets.map(bucketTotal), 0)

  doc.setFontSize(6.5)
  doc.setFont("helvetica", "normal")
  for (const step of [0, 0.5, 1]) {
    const gy = plotBottom - height * step
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2])
    doc.setLineWidth(0.15)
    doc.line(plotX, gy, plotX + plotW, gy)
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2])
    doc.text(fmtCompact(max * step, currency), plotX - 2, gy + 1.5, { align: "right" })
  }

  const slot = plotW / Math.max(buckets.length, 1)
  const groupW = Math.min(slot * 0.68, 11)

  buckets.forEach((bucket, i) => {
    if (mode === "stacked") {
      let bottom = plotBottom
      bucket.segments.forEach((value, s) => {
        const h = max > 0 ? (Math.max(0, value) / max) * height : 0
        if (h <= 0.3) return
        const color = series[s]?.color ?? PRIMARY
        doc.setFillColor(color[0], color[1], color[2])
        doc.rect(plotX + slot * i + (slot - groupW) / 2, bottom - h, groupW, h, "F")
        bottom -= h
      })
    } else {
      const barW = groupW / Math.max(bucket.segments.length, 1)
      bucket.segments.forEach((value, s) => {
        const h = max > 0 ? (Math.max(0, value) / max) * height : 0
        if (h <= 0.3) return
        const color = series[s]?.color ?? PRIMARY
        doc.setFillColor(color[0], color[1], color[2])
        doc.rect(
          plotX + slot * i + (slot - groupW) / 2 + barW * s,
          plotBottom - h,
          barW,
          h,
          "F"
        )
      })
    }
  })

  const labelEvery = Math.max(1, Math.ceil(buckets.length / Math.max(1, Math.floor(plotW / 10))))
  doc.setFontSize(6)
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2])
  buckets.forEach((bucket, i) => {
    if (i % labelEvery !== 0 && i !== buckets.length - 1) return
    doc.text(bucket.label, plotX + slot * i + slot / 2, plotBottom + 4, { align: "center" })
  })

  // Leyenda de series, centrada bajo el eje.
  let legendX = plotX
  const legendY = plotBottom + 9
  doc.setFontSize(7)
  for (const serie of series) {
    doc.setFillColor(serie.color[0], serie.color[1], serie.color[2])
    doc.roundedRect(legendX, legendY - 2.2, 2.6, 2.6, 0.5, 0.5, "F")
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2])
    doc.text(serie.label, legendX + 4, legendY)
    legendX += doc.getTextWidth(serie.label) + 12
  }

  return legendY + 5
}
