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
