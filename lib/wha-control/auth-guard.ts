import { assertAddonEnabledApi } from "@/lib/addons/guard"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/** Ven todos los teléfonos de la organización. */
const ADMIN_ROLES = ["SUPER_ADMIN", "ORG_OWNER", "ADMIN"]

/**
 * Roles que entran solo a lo suyo: vinculan su teléfono, ven sus propias
 * conversaciones y marcan sus cotizaciones para que salga el recordatorio.
 */
const OWN_DEVICE_ROLES = ["SELLER", "POST_VENTA"]

export function isWhaAdminRole(roles: string[]): boolean {
  return roles.some((r) => ADMIN_ROLES.includes(r))
}

/**
 * Validate that the current user is authorized for WhatsApp central.
 * Returns the user + their org_id if authorized, or a 403 response.
 *
 * SaaS: también retornamos orgId para que los routes puedan acotar queries
 * al tenant del caller (los routes usan admin client para hablar con el
 * connector, así que RLS no aplica — el filtro va explícito).
 *
 * `isWhaAdmin` distingue las dos formas de entrar. Un vendedor entra, pero solo
 * al teléfono que vinculó: cada route que reciba un deviceId o un chatId tiene
 * que validarlo con los helpers de `lib/wha-control/access.ts`. Devolver el
 * flag y no la lista de devices es a propósito, para que el filtro se aplique
 * en la query y no en memoria.
 */
export async function whaControlAuthGuard() {
  const { user } = await getCurrentUser()

  const roles: string[] = (user as any).roles ?? [user.role]
  const isWhaAdmin = isWhaAdminRole(roles)
  const puedeEntrar = isWhaAdmin || roles.some((r) => OWN_DEVICE_ROLES.includes(r))

  if (!puedeEntrar) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 403 }),
      user: null,
      orgId: null,
      isWhaAdmin: false,
    }
  }

  const orgId = (user as any).org_id as string | null
  if (!orgId) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: "Usuario sin tenant asignado" }, { status: 403 }),
      user: null,
      orgId: null,
      isWhaAdmin: false,
    }
  }

  // Complemento contratado. Va DESPUÉS del rol y del tenant, y devuelve 404:
  // el permiso decide si este usuario puede, el complemento si la agencia lo
  // tiene. Acá cubre de una las ~15 rutas de /api/wha-control.
  const supabase = await createServerClient()
  const addonDenied = await assertAddonEnabledApi(supabase, orgId, "wha_control")
  if (addonDenied) {
    return {
      authorized: false as const,
      response: addonDenied,
      user: null,
      orgId: null,
      isWhaAdmin: false,
    }
  }

  return { authorized: true as const, response: null, user, orgId, isWhaAdmin }
}
