import { assertAddonEnabledApi } from "@/lib/addons/guard"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

const ALLOWED_ROLES = ["SUPER_ADMIN", "ORG_OWNER", "ADMIN"]

/**
 * Validate that the current user is authorized for WHA Control.
 * Returns the user + their org_id if authorized, or a 403 response.
 *
 * SaaS: también retornamos orgId para que los routes puedan acotar queries
 * al tenant del caller (los routes usan admin client para hablar con el
 * connector, así que RLS no aplica — el filtro va explícito).
 */
export async function whaControlAuthGuard() {
  const { user } = await getCurrentUser()

  if (!ALLOWED_ROLES.includes(user.role)) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 403 }),
      user: null,
      orgId: null,
    }
  }

  const orgId = (user as any).org_id as string | null
  if (!orgId) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: "Usuario sin tenant asignado" }, { status: 403 }),
      user: null,
      orgId: null,
    }
  }

  // Complemento contratado. Va DESPUÉS del rol y del tenant, y devuelve 404:
  // el permiso decide si este usuario puede, el complemento si la agencia lo
  // tiene. Acá cubre de una las ~15 rutas de /api/wha-control.
  const supabase = await createServerClient()
  const addonDenied = await assertAddonEnabledApi(supabase, orgId, "wha_control")
  if (addonDenied) {
    return { authorized: false as const, response: addonDenied, user: null, orgId: null }
  }

  return { authorized: true as const, response: null, user, orgId }
}
