/**
 * Helper para parsear el parámetro `dateField` que los endpoints de
 * analytics aceptan para decidir qué columna usar en el filtro Desde/Hasta.
 *
 * Pedido por VICO Travel 2026-05-22 (Andrés): el dashboard mostraba un
 * filtro etiquetado "Operación" pero internamente filtraba por `created_at`
 * (fecha de carga al sistema). Si una venta se cargaba retroactivamente,
 * aparecía en el rango "hoy" en vez de en su fecha real. Por eso ahora
 * el usuario puede elegir explícitamente.
 *
 * Whitelist obligatoria: nunca confiar en el string crudo del querystring
 * para construir la query Postgres. Esto evita SQL injection y limita la
 * superficie de columnas que pueden filtrarse a las que tienen sentido
 * para el reporte.
 */

export type AllowedOperationDateField =
  | "created_at" // fecha de carga al sistema (timestamp)
  | "operation_date" // fecha de la venta (DATE, fallback created_at si null)
  | "departure_date" // fecha de salida del viaje (DATE)

const ALLOWED: AllowedOperationDateField[] = [
  "created_at",
  "operation_date",
  "departure_date",
]

/**
 * Parsea el querystring `dateField` y devuelve un valor seguro.
 * - Si viene en la whitelist → ese valor.
 * - Si viene cualquier otra cosa o está vacío → "created_at" (default
 *   legacy, preserva comportamiento histórico).
 *
 * El caller usa el retorno directamente como nombre de columna en
 * `.gte(...)/.lte(...)`. Como solo puede ser uno de los 3 valores fijos,
 * no hay riesgo de inyección.
 */
export function parseOperationDateField(
  raw: string | null | undefined
): AllowedOperationDateField {
  if (raw && (ALLOWED as string[]).includes(raw)) {
    return raw as AllowedOperationDateField
  }
  return "created_at"
}
