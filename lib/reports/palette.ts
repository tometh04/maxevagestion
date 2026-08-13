/**
 * Paleta categórica de los reportes.
 *
 * Vive suelta (no en `lib/pdf/report-kit.ts`) para que los agregadores puros
 * puedan asignar colores sin arrastrar jsPDF: la pantalla y el PDF tienen que
 * pintar cada serie del mismo color, pero la agregación no debe depender del
 * renderer.
 *
 * En HEX porque jsPDF necesita componentes RGB. Tonos distinguibles entre sí y
 * legibles en light y dark.
 */
export const REPORT_SERIES_PALETTE = [
  "#F6BB09", // amber
  "#F47825", // orange
  "#29BC5F", // green
  "#17B0CF", // cyan
  "#E23670", // pink/red
  "#8652E0", // violet
  "#308CE8", // blue
  "#2BAB81", // teal
  "#E85E30", // coral
  "#7EA12E", // lime
]

/** Color de una serie por posición, con la paleta ciclando. */
export function seriesColor(index: number): string {
  return REPORT_SERIES_PALETTE[index % REPORT_SERIES_PALETTE.length]
}
