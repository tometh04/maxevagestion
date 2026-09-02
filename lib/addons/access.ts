/**
 * Chequeo de complemento, sin dependencias de Next.
 *
 * Vive separado de `lib/addons/guard.ts` a propósito: ese módulo importa
 * `next/server` y `next/navigation`, y arrastrar el runtime de Next hasta un
 * módulo de dominio rompe los tests de libs puras (`Request is not defined`).
 * Las libs de dominio (Emilia, Growth Studio) importan de acá; las rutas y las
 * páginas, del guard.
 *
 * ADVERTENCIA: esto es la capa de FACTURACIÓN, no de autorización. Se ANDea con
 * los permisos, nunca los reemplaza.
 */
import { ADDONS, type AddonKey } from "@/lib/addons/catalog"
import { resolveOrgAddons } from "@/lib/addons/server"

export type AddonAccessResult =
  | { allowed: true }
  | { allowed: false; status: 404; code: "addon_required"; message: string }

export async function checkAddon(
  supabase: any,
  orgId: string | null | undefined,
  key: AddonKey
): Promise<AddonAccessResult> {
  const map = await resolveOrgAddons(supabase, orgId)
  const entitlement = map[key]

  if (entitlement?.enabled === false) {
    return {
      allowed: false,
      status: 404,
      code: "addon_required",
      message: `${ADDONS[key].name} es un complemento que esta cuenta no tiene contratado.`,
    }
  }

  // Modo SHADOW: deja pasar pero deja rastro de a quién cortaría al encenderlo.
  // Es el ensayo previo a poner el enforcement en ON.
  if (entitlement?.enabledOnlyByEnforcement && entitlement.enforcement === "SHADOW") {
    console.warn("[addons][shadow] cortaría el acceso:", { orgId, addon: key })
  }

  return { allowed: true }
}
