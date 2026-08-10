/**
 * Búsqueda de operaciones por nombre de pasajero (VIB-102).
 *
 * El listado de operaciones resuelve primero qué clientes matchean el texto
 * buscado y después filtra las operaciones por esos clientes. Este helper arma
 * los grupos `or=` de PostgREST que se aplican a la query de `customers`.
 *
 * Regla: cada palabra de la búsqueda genera SU PROPIO grupo. Los `or=` repetidos
 * de PostgREST se combinan con AND, así que cada palabra tiene que matchear
 * nombre o apellido del MISMO cliente:
 *
 *   "Maria Belen Olivera" → (Maria en nombre|apellido)
 *                       AND (Belen en nombre|apellido)
 *                       AND (Olivera en nombre|apellido)
 *
 * Antes se armaba un único grupo con todas las palabras, o sea OR: la búsqueda
 * matcheaba a cualquier cliente llamado "Maria" y el tope de filas recortaba el
 * resultado antes de llegar al titular buscado. Mismo criterio que
 * `/api/customers` y `/api/cash/movements`.
 */

/** Longitud mínima de una palabra para filtrar por ella. */
const MIN_WORD_LENGTH = 2

/**
 * Saca los caracteres que rompen la gramática de `or=` de PostgREST
 * (separador `,`, agrupadores `()` y comillas). Sin esto, buscar "Perez, Juan"
 * genera una query inválida y la búsqueda por pasajero se cae en silencio.
 */
export function sanitizeSearchTerm(term: string): string {
  return term.replace(/["(),\\]/g, " ").trim()
}

/**
 * Devuelve un grupo `or=` por palabra. El caller aplica `.or(grupo)` por cada
 * elemento; PostgREST los combina con AND.
 *
 * Devuelve `[]` si no queda nada buscable (el caller debe omitir el filtro por
 * pasajero en ese caso).
 */
export function buildPassengerSearchOrGroups(
  search: string,
  fields: string[] = ["first_name", "last_name"]
): string[] {
  const cleaned = sanitizeSearchTerm(search)
  if (!cleaned) return []

  const words = cleaned.split(/\s+/).filter((w) => w.length >= MIN_WORD_LENGTH)
  // Si ninguna palabra llega al mínimo (ej. "J P"), buscamos la frase completa.
  const terms = words.length > 0 ? words : [cleaned]

  return terms.map((term) => fields.map((f) => `${f}.ilike.%${term}%`).join(","))
}
