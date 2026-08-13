/**
 * Normalización del tipo de servicio (product_type) a una categoría estable,
 * compartida entre el diálogo de carga de operación (campos dinámicos por tipo)
 * y el armado del PDF "Detalle de la Operación" (detalle por servicio).
 *
 * Se usa el MISMO criterio en ambos lados para que el detalle que se carga por
 * tipo (hotel/aéreo) se muestre en la línea correcta del statement.
 */

export type ServiceKind = "HOTEL" | "FLIGHT" | "OTHER"

/** Devuelve HOTEL | FLIGHT | OTHER a partir del product_type (tolera acentos/custom). */
export function serviceKind(rawType: string | null | undefined): ServiceKind {
  const t = String(rawType || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sacar acentos (AÉREO -> AEREO)
    .trim()
    .toUpperCase()
  if (["HOTEL", "ALOJAMIENTO", "HOSPEDAJE"].includes(t)) return "HOTEL"
  if (["FLIGHT", "AEREO", "VUELO", "AIR"].includes(t)) return "FLIGHT"
  return "OTHER"
}

export interface PassengerDetailField {
  key: string
  label: string
  type?: "text" | "date"
}

/**
 * Campos de "detalle para el pasajero" que se muestran en la carga de la
 * operación según el tipo de servicio. Todos opcionales. Compartido entre los
 * diálogos de alta/edición y el statement (mismas keys que lee structuredDetail).
 */
export const PASSENGER_DETAIL_FIELDS: Record<ServiceKind, PassengerDetailField[]> = {
  HOTEL: [
    { key: "hotel_name", label: "Hotel" },
    { key: "meal_plan", label: "Régimen de comidas" },
    { key: "room_type", label: "Tipo de habitación" },
    { key: "checkin", label: "Check-in", type: "date" },
    { key: "checkout", label: "Check-out", type: "date" },
  ],
  FLIGHT: [
    { key: "airline", label: "Aerolínea" },
    { key: "flight_info", label: "Vuelo / ruta" },
    { key: "flight_date", label: "Fecha", type: "date" },
  ],
  OTHER: [{ key: "detail", label: "Detalle" }],
}

/** Formatea una fecha YYYY-MM-DD a dd/MM/yyyy (sin dependencias). */
function fmtShort(d: string | null | undefined): string {
  if (!d) return ""
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d)
}

/** Une las partes no vacías con " · ". */
function joinDetail(parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (p ?? "").toString().trim())
    .filter(Boolean)
    .join(" · ")
}

/**
 * Compone en una línea el "detalle para el pasajero" cargado por la agencia
 * (`operation_operators.passenger_detail`), según el tipo de servicio.
 * Devuelve "" si no hay nada cargado.
 *
 * VIB-111: vive acá para que la ficha de la operación y el PDF "Detalle de la
 * Operación" muestren exactamente el mismo texto. Antes solo lo armaba el PDF,
 * así que lo que la agencia escribía al cargar la venta no se veía en pantalla.
 */
export function formatPassengerDetail(pd: unknown, kind: ServiceKind): string {
  if (!pd || typeof pd !== "object") return ""
  const d = pd as Record<string, string | undefined>
  if (kind === "HOTEL") {
    const range =
      d.checkin && d.checkout ? `Del ${fmtShort(d.checkin)} al ${fmtShort(d.checkout)}` : ""
    return joinDetail([d.hotel_name, d.room_type, d.meal_plan, range])
  }
  if (kind === "FLIGHT") {
    return joinDetail([d.airline, d.flight_info, fmtShort(d.flight_date)])
  }
  return (d.detail || "").toString().trim()
}

/** Limpia strings vacíos; devuelve null si no queda nada (para no guardar {} ). */
export function sanitizePassengerDetail(
  pd: Record<string, string> | undefined | null
): Record<string, string> | null {
  if (!pd || typeof pd !== "object") return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(pd)) {
    const val = (v ?? "").toString().trim()
    if (val) out[k] = val
  }
  return Object.keys(out).length > 0 ? out : null
}
