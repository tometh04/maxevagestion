/**
 * Quién comisiona un servicio de una operación.
 *
 * Vive acá porque la misma decisión se toma en dos lugares —el alta y la
 * edición de un servicio— y es plata: si los dos caminos validan distinto,
 * el que valide de menos se convierte en la puerta para desviarle la comisión
 * a alguien de otra agencia, o de otro tenant.
 *
 * La regla: quien vende el servicio cobra su comisión, y no es necesariamente
 * el vendedor de la operación (una asistencia o una reprogramación las suele
 * cargar post-venta sobre una venta ajena). Por defecto comisiona quien lo
 * carga; se puede elegir a otro dentro de límites.
 */

import { isIndependentAdvisor } from "@/lib/permissions"
import { isSellerWithinUserAgencies } from "@/lib/permissions-api"
import { SELLER_OPTION_ROLES } from "@/lib/sellers/seller-option"

export type ResolveServiceSellerResult =
  | { ok: true; sellerId: string }
  | { ok: false; status: number; error: string }

export interface ResolveServiceSellerParams {
  user: { id: string; role?: string | null; org_id?: string | null }
  /** Agencias visibles del usuario, ya resueltas por el caller. */
  agencyIds: string[]
  /** Lo que pidió el cliente. Vacío o ausente = dejar el fallback. */
  requestedSellerId: unknown
  /**
   * A quién comisiona si el cliente no pide nada: `user.id` en el alta,
   * el vendedor actual del servicio en la edición.
   */
  fallbackSellerId: string
}

export async function resolveServiceSeller(
  supabase: any,
  { user, agencyIds, requestedSellerId, fallbackSellerId }: ResolveServiceSellerParams,
): Promise<ResolveServiceSellerResult> {
  const requested =
    typeof requestedSellerId === "string" ? requestedSellerId.trim() : ""

  if (!requested || requested === fallbackSellerId) {
    return { ok: true, sellerId: fallbackSellerId }
  }

  // El asesor independiente sólo ve y cobra lo suyo: no puede desviarle la
  // comisión a otra persona.
  if (isIndependentAdvisor(user as any)) {
    return {
      ok: false,
      status: 403,
      error: "No puede asignar el servicio a otro vendedor",
    }
  }

  // Filtro por org: sin esto se podría imputar la comisión a un usuario de otro
  // tenant.
  const { data: targetSeller } = await (supabase.from("users") as any)
    .select("id, role, is_active")
    .eq("id", requested)
    .eq("org_id", user.org_id)
    .maybeSingle()

  if (
    !targetSeller ||
    targetSeller.is_active === false ||
    !SELLER_OPTION_ROLES.includes(targetSeller.role)
  ) {
    return { ok: false, status: 400, error: "Vendedor inválido" }
  }

  // Un SELLER sólo puede asignarle el servicio a alguien de sus mismas
  // agencias. Mismo criterio que el alta de operaciones.
  if (user.role === "SELLER") {
    const withinAgency = await isSellerWithinUserAgencies(supabase, requested, agencyIds)
    if (!withinAgency) {
      return {
        ok: false,
        status: 403,
        error: "El vendedor no pertenece a sus agencias",
      }
    }
  }

  return { ok: true, sellerId: requested }
}
