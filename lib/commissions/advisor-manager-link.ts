/**
 * Validación del vínculo vendedor → administrador (VIB-102).
 *
 * Vive en `lib/` y no dentro de la ruta porque decide dos cosas que no pueden
 * quedar a criterio de un formulario:
 *
 *   1. **Tenant.** El administrador termina con una fila en
 *      `commission_records` de cada venta del vendedor. Un id de otra
 *      organización ahí es plata y datos cruzando de tenant, no un dato mal
 *      cargado. Por eso se verifica contra la base y no se confía en que el
 *      selector solo haya ofrecido usuarios de la org.
 *
 *   2. **Coherencia del par.** El porcentaje sin administrador no le paga a
 *      nadie, y un administrador sin porcentaje no cobra. Se guardan juntos o
 *      se limpian juntos, para que la configuración no quede a medias y sin que
 *      nadie lo note hasta la liquidación.
 */

/** Valor "sin administrador" tal como puede llegar de un `<Select>`. */
const EMPTY_VALUES = new Set(["", "NONE", "null", "undefined"])

export interface AdvisorManagerLinkInput {
  advisor_manager_id?: unknown
  advisor_manager_percentage?: unknown
}

export interface NormalizeAdvisorManagerLinkParams {
  supabase: any
  /** Org del usuario que está editando. */
  orgId: string | null | undefined
  /** Usuario que se está editando: no puede ser su propio administrador. */
  targetUserId: string
  /** Administrador que ya tenía, para resolver updates parciales. */
  currentManagerId?: string | null
  input: AdvisorManagerLinkInput
}

export type NormalizeAdvisorManagerLinkResult =
  | { ok: true; values: Record<string, any> }
  | { ok: false; error: string }

function normalizeId(raw: unknown): string | null {
  if (raw == null) return null
  const value = String(raw).trim()
  return value === "" || EMPTY_VALUES.has(value) ? null : value
}

function normalizePercentage(raw: unknown): number | null | "invalid" {
  if (raw == null) return null
  if (typeof raw === "string" && raw.trim() === "") return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0 || value > 100) return "invalid"
  return value
}

export async function normalizeAdvisorManagerLink(
  params: NormalizeAdvisorManagerLinkParams
): Promise<NormalizeAdvisorManagerLinkResult> {
  const { supabase, orgId, targetUserId, input } = params

  const touchesManager = input.advisor_manager_id !== undefined
  const touchesPercentage = input.advisor_manager_percentage !== undefined
  if (!touchesManager && !touchesPercentage) return { ok: true, values: {} }

  const managerId = touchesManager
    ? normalizeId(input.advisor_manager_id)
    : normalizeId(params.currentManagerId)

  // Sin administrador el porcentaje no tiene destinatario: se limpia siempre,
  // aunque el request no lo haya mandado. Dejarlo suelto haría que reasignar un
  // administrador más adelante lo reactive con un número viejo.
  if (!managerId) {
    return {
      ok: true,
      values: { advisor_manager_id: null, advisor_manager_percentage: null },
    }
  }

  if (managerId === targetUserId) {
    return { ok: false, error: "Un vendedor no puede ser su propio administrador" }
  }

  const percentage = touchesPercentage
    ? normalizePercentage(input.advisor_manager_percentage)
    : undefined

  if (percentage === "invalid") {
    return {
      ok: false,
      error: "El porcentaje del administrador debe ser un número entre 0 y 100",
    }
  }

  let query = (supabase.from("users") as any)
    .select("id, org_id, is_independent_advisor, is_active")
    .eq("id", managerId)

  // Un SUPER_ADMIN legacy sin org (pre-SaaS) no tiene con qué scopear; en ese
  // caso alcanza con que el usuario exista.
  if (orgId) query = query.eq("org_id", orgId)

  const { data: manager, error } = await query.maybeSingle()

  if (error) {
    console.error("[Commissions] Error validando el administrador del vendedor:", error)
    return { ok: false, error: "No se pudo validar el administrador" }
  }

  if (!manager) {
    return { ok: false, error: "El administrador seleccionado no existe en la organización" }
  }

  // Un asesor independiente solo ve lo suyo. Si administrara a otro, cobraría
  // —y por lo tanto vería— comisiones de ventas que no son suyas, que es
  // exactamente lo que el modo asesor independiente existe para impedir.
  if ((manager as any).is_independent_advisor === true) {
    return {
      ok: false,
      error: "Un asesor independiente no puede administrar a otro vendedor",
    }
  }

  const values: Record<string, any> = { advisor_manager_id: managerId }
  if (percentage !== undefined) values.advisor_manager_percentage = percentage
  return { ok: true, values }
}
