/**
 * Normalización de tipos de producto (VIB-66).
 *
 * El repo guarda el tipo de producto en dos vocabularios distintos:
 *
 *  - `operations.product_type`: ESPAÑOL, derivado del tipo de la operación en
 *    `app/api/operations/route.ts` (AEREO / HOTEL / PAQUETE / CRUCERO / OTRO).
 *    Todo lo que no sea vuelo, hotel, paquete o crucero cae en OTRO.
 *  - `operation_operators.product_type`: INGLÉS (FLIGHT / HOTEL / PACKAGE / ...).
 *    La migración `20260611000001` le sacó el CHECK, así que además admite
 *    tipos propios por organización (`operation_settings.custom_product_types`).
 *
 * Sin normalizar, "Vuelo" aparecería dos veces en el mismo reporte. Acá se
 * unifica a una clave canónica en inglés y se traduce a etiqueta en español una
 * sola vez, para pantalla y PDF.
 */

import { seriesColor } from "@/lib/reports/palette"

export const STANDARD_PRODUCT_TYPES = [
  "FLIGHT",
  "HOTEL",
  "PACKAGE",
  "CRUISE",
  "TRANSFER",
  "MIXED",
  "ASSISTANCE",
  "ACTIVITY",
  "CAR",
] as const

/** Servicios adicionales (`operation_services`), cuando la flag los suma. */
export const SERVICES_BUCKET_KEY = "SERVICES"
/** Operación sin tipo utilizable. */
export const UNSPECIFIED_BUCKET_KEY = "UNSPECIFIED"

const LABELS: Record<string, string> = {
  FLIGHT: "Vuelo",
  HOTEL: "Hotel",
  PACKAGE: "Paquete",
  CRUISE: "Crucero",
  TRANSFER: "Transfer",
  MIXED: "Mixto",
  ASSISTANCE: "Asistencia al viajero",
  ACTIVITY: "Actividad",
  CAR: "Alquiler de auto",
  [SERVICES_BUCKET_KEY]: "Servicios adicionales",
  [UNSPECIFIED_BUCKET_KEY]: "Sin clasificar",
}

/** Vocabulario español de `operations.product_type` → clave canónica. */
const ES_ALIASES: Record<string, string> = {
  AEREO: "FLIGHT",
  AÉREO: "FLIGHT",
  VUELO: "FLIGHT",
  HOTEL: "HOTEL",
  ALOJAMIENTO: "HOTEL",
  PAQUETE: "PACKAGE",
  CRUCERO: "CRUISE",
  TRASLADO: "TRANSFER",
  TRANSFER: "TRANSFER",
  MIXTO: "MIXED",
  ASISTENCIA: "ASSISTANCE",
  SEGURO: "ASSISTANCE",
  ACTIVIDAD: "ACTIVITY",
  EXCURSION: "ACTIVITY",
  AUTO: "CAR",
  VEHICULO: "CAR",
  OTRO: UNSPECIFIED_BUCKET_KEY,
  OTROS: UNSPECIFIED_BUCKET_KEY,
}

/** Quita acentos para que "AÉREO" y "AEREO" caigan en el mismo bucket. */
function stripAccents(value: string): string {
  return value.normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
}

/**
 * Clave canónica de un tipo de producto. Los tipos custom de la organización se
 * conservan tal cual (en mayúsculas y sin espacios de más): no se fuerzan a
 * "Sin clasificar", porque para la agencia son categorías reales.
 */
export function normalizeProductType(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim()
  if (!value) return UNSPECIFIED_BUCKET_KEY

  const upper = stripAccents(value).toUpperCase()
  if (ES_ALIASES[upper]) return ES_ALIASES[upper]
  if ((STANDARD_PRODUCT_TYPES as readonly string[]).includes(upper)) return upper
  if (upper === SERVICES_BUCKET_KEY || upper === UNSPECIFIED_BUCKET_KEY) return upper

  // Tipo custom por org: se respeta con su propia identidad.
  return upper
}

/** Etiqueta en español. Los tipos custom se muestran capitalizados. */
export function productTypeLabel(canonical: string): string {
  if (LABELS[canonical]) return LABELS[canonical]
  const lower = canonical.toLowerCase().replace(/_/g, " ")
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/**
 * Color estable de un tipo de producto. Los estándar tienen su lugar fijo en la
 * paleta para que "Vuelo" sea del mismo color en todos los reportes; los custom
 * toman el color por posición.
 */
export function productTypeColor(canonical: string, index: number): string {
  const fixed = (STANDARD_PRODUCT_TYPES as readonly string[]).indexOf(canonical)
  if (fixed >= 0) return seriesColor(fixed)
  if (canonical === SERVICES_BUCKET_KEY) return seriesColor(STANDARD_PRODUCT_TYPES.length)
  if (canonical === UNSPECIFIED_BUCKET_KEY) return "#9AA3B2"
  return seriesColor(STANDARD_PRODUCT_TYPES.length + 1 + index)
}
