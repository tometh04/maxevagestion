/**
 * Validación de los campos del modal, compartida entre crear y editar.
 *
 * Vive acá y no en cada route para que las dos puertas apliquen exactamente el
 * mismo criterio. Un campo que valida al crear y no al editar es la forma
 * habitual de que una validación no sirva para nada.
 */

/** Roles de tenant (`UserRole` de lib/permissions.ts). */
export const ROLES_VALIDOS = [
  "SUPER_ADMIN",
  "ORG_OWNER",
  "ADMIN",
  "CONTABLE",
  "SELLER",
  "VIEWER",
  "POST_VENTA",
] as const

export interface CamposDelModal {
  /** Número de release, ej "2026.09". Null en una novedad suelta. */
  release_version: string | null
  modal: boolean
  modal_starts_at: string | null
  modal_ends_at: string | null
  modal_roles: string[] | null
  modal_cta_label: string | null
  modal_cta_href: string | null
}

export type ResultadoParseo =
  | { ok: true; campos: CamposDelModal }
  | { ok: false; error: string }

const texto = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : ""
  return s ? s : null
}

const fecha = (v: unknown): string | null => {
  const s = texto(v)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * El destino tiene que ser una ruta interna.
 *
 * Es un campo administrable que termina en un enlace que el usuario clickea:
 * aceptar URLs completas lo convertiría en una redirección abierta cargable
 * desde el panel. Se rechaza también "//host", que el navegador resuelve como
 * protocolo relativo y sale del sitio igual.
 */
export function esRutaInterna(href: string): boolean {
  return /^\/[^/]/.test(href)
}

export function parsearCamposDelModal(body: any): ResultadoParseo {
  const modal = body?.modal === true

  const roles = Array.isArray(body?.modal_roles)
    ? body.modal_roles.map((r: unknown) => String(r).trim().toUpperCase()).filter(Boolean)
    : null

  if (roles && roles.length > 0) {
    const invalidos = roles.filter((r: string) => !ROLES_VALIDOS.includes(r as any))
    if (invalidos.length > 0) {
      return { ok: false, error: `Roles inválidos: ${invalidos.join(", ")}` }
    }
  }

  const label = texto(body?.modal_cta_label)
  const href = texto(body?.modal_cta_href)

  if (href && !esRutaInterna(href)) {
    return { ok: false, error: 'El destino del botón tiene que ser una ruta interna, por ejemplo "/finances/settings".' }
  }
  if ((href && !label) || (label && !href)) {
    return { ok: false, error: "El botón necesita texto y destino: uno sin el otro no sirve." }
  }

  const desde = fecha(body?.modal_starts_at)
  const hasta = fecha(body?.modal_ends_at)
  if (desde && hasta && desde > hasta) {
    return { ok: false, error: "La fecha de fin no puede ser anterior a la de inicio." }
  }

  return {
    ok: true,
    campos: {
      release_version: texto(body?.release_version),
      modal,
      modal_starts_at: desde,
      modal_ends_at: hasta,
      modal_roles: roles && roles.length > 0 ? roles : null,
      modal_cta_label: label,
      modal_cta_href: href,
    },
  }
}
