/**
 * Heurística para inferir el `status` de un lead desde el nombre de su
 * lista (columna del Kanban legacy). Pedido por LOZADA VIAJES GUALEGUAYCHÚ
 * (2026-05-21): cuando un usuario arrastra un lead de una columna a otra,
 * que el status del lead se actualice automáticamente sin tener que entrar
 * a editar el detalle.
 *
 * Solo funciona si el nombre de la lista contiene una palabra clave que
 * sugiere claramente el status. Si no matchea ninguna, devuelve null
 * (status no se cambia — fallback no-op, comportamiento legacy).
 *
 * Diseño:
 * - Case-insensitive
 * - Sin acentos (normalize NFD + replace diacritics)
 * - Matching por SUBSTRING para tolerar variantes ("Consulta ingresada",
 *   "consultas nuevas", "Nuevo lead" → todos NEW)
 * - Orden de prioridad: WON/LOST primero (más específicos), después
 *   QUOTED, IN_PROGRESS, NEW (más genérico al final)
 *
 * Activado por feature flag `features.list_name_to_status_sync` en
 * organization_settings. Tenants sin el flag conservan el comportamiento
 * legacy (status independiente de list_name).
 */

export type LeadStatus = "NEW" | "IN_PROGRESS" | "QUOTED" | "WON" | "LOST"

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

/**
 * Reglas en orden de prioridad. La primera regla que matchee gana.
 *
 * Mantengo este mapping conservador a propósito — preferible "no
 * cambiar status" antes que "cambiarlo mal". Si un cliente reporta
 * que falta alguna palabra clave, la agregamos acá.
 */
const RULES: Array<{ status: LeadStatus; keywords: string[] }> = [
  // Cerrados (los más específicos primero)
  { status: "WON", keywords: ["ganado", "ganados", "won", "vendido", "vendida", "cerrado positivo", "cerrada positiva"] },
  { status: "LOST", keywords: ["perdido", "perdida", "perdidos", "lost", "descartado", "descartada", "rechazado", "rechazada"] },

  // En cotización
  { status: "QUOTED", keywords: ["cotizado", "cotizada", "cotizados", "cotizadas", "presupuestado", "presupuestada", "enviado presupuesto", "esperando respuesta"] },

  // En proceso (después de "cotizado" para que "cotizar" no robe matches de "cotizado")
  { status: "IN_PROGRESS", keywords: ["cotizar", "cotizando", "en proceso", "trabajando", "armando", "negociando", "seguimiento", "follow"] },

  // Nuevo / sin tocar
  { status: "NEW", keywords: ["consulta", "consultas", "nuevo", "nueva", "nuevos", "nuevas", "ingresada", "ingresado", "ingresadas", "ingresados", "sin asignar", "por revisar"] },
]

/**
 * Dado un nombre de lista, devuelve el status sugerido o null si no
 * matchea ninguna heurística.
 *
 * Ejemplos:
 *   inferStatus("Consulta Ingresada") → "NEW"
 *   inferStatus("Cotizar con prioridad") → "IN_PROGRESS"
 *   inferStatus("Cotizado") → "QUOTED"
 *   inferStatus("Cotizado con seguimiento") → "QUOTED" (WON/LOST/QUOTED ganan a IN_PROGRESS por orden)
 *   inferStatus("Ganado") → "WON"
 *   inferStatus("Mi lista custom XYZ") → null
 */
export function inferStatusFromListName(listName: string | null | undefined): LeadStatus | null {
  if (!listName) return null
  const n = normalize(listName)
  if (!n) return null

  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (n.includes(kw)) return rule.status
    }
  }
  return null
}
