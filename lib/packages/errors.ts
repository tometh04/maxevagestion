/**
 * Traducción de los errores de las RPC de paquetes a respuestas HTTP.
 *
 * Las funciones de `20260908000001_travel_packages.sql` levantan excepciones con
 * ERRCODE explícito y un DETAIL en JSON. Ese contrato es el que permite que la
 * ruta distinga "no hay cupo" (una carrera perdida, 409) de "el payload está
 * mal" (400) sin parsear mensajes de texto.
 *
 * Un código desconocido se mapea a 500 con mensaje genérico y el error crudo
 * solo al log: si la función no existe todavía (42883, migración sin aplicar) o
 * revienta por dentro, el detalle no tiene por qué llegar al browser.
 *
 * Mismo criterio que `app/api/expenses/variable/[id]/split/route.ts`.
 */

/** Cupo agotado: no entran las plazas pedidas. */
export const ERR_QUOTA_EXHAUSTED = "P4301"
/** Se intentó bajar el cupo por debajo de lo ya vendido. */
export const ERR_QUOTA_BELOW_CONSUMED = "P4302"

export interface QuotaDetail {
  code?: string
  total_quota?: number
  consumed?: number
  requested?: number
  remaining?: number
}

interface PostgrestLikeError {
  code?: string | null
  message?: string | null
  details?: string | null
}

/**
 * El DETAIL de un `RAISE EXCEPTION` viaja en `error.details` como texto JSON.
 * Si no parsea, se devuelve null: el mensaje igual alcanza para el usuario.
 */
export function parseQuotaDetail(details?: string | null): QuotaDetail | null {
  if (!details) return null
  try {
    const parsed = JSON.parse(details)
    return parsed && typeof parsed === "object" ? (parsed as QuotaDetail) : null
  } catch {
    return null
  }
}

export interface MappedRpcError {
  status: number
  body: { error: string; detail?: QuotaDetail }
}

export function mapPackageRpcError(
  error: PostgrestLikeError,
  context: string
): MappedRpcError {
  const detail = parseQuotaDetail(error.details) ?? undefined

  switch (error.code) {
    // Los mensajes de P0001/P0002 están escritos en la función para que los lea
    // quien está cargando la venta, así que se pasan tal cual.
    case "P0002":
      return { status: 404, body: { error: error.message || "No encontrado" } }

    case "P0001":
      return { status: 400, body: { error: error.message || "Datos inválidos" } }

    case ERR_QUOTA_EXHAUSTED: {
      const restantes = detail?.remaining ?? 0
      const pedidas = detail?.requested
      return {
        status: 409,
        body: {
          error:
            pedidas !== undefined
              ? `No hay cupo suficiente en el paquete: quedan ${restantes} plaza(s) y se pidieron ${pedidas}.`
              : "Se agotó el cupo del paquete.",
          detail,
        },
      }
    }

    case ERR_QUOTA_BELOW_CONSUMED:
      return {
        status: 409,
        body: {
          error: `Ya se vendieron ${detail?.consumed ?? "varias"} plaza(s) de este paquete: no podés bajar el cupo a ${detail?.total_quota ?? "ese número"}.`,
          detail,
        },
      }

    default:
      console.error(`[packages] error inesperado de RPC en ${context}:`, error)
      return { status: 500, body: { error: "Error interno" } }
  }
}
