/**
 * Gates de complementos. Un solo helper para las tres puertas (página, API y
 * unión discriminada), en vez de la constante duplicada en cada ruta que hoy
 * tiene comisiones mensuales.
 *
 * ORDEN OBLIGATORIO: primero permisos (403 / redirect), después complemento
 * (404). El complemento se ANDea con el permiso, nunca lo reemplaza ni lo
 * amplía: dice "la agencia contrató esto", no "este usuario puede usarlo". Un
 * SELLER sin permiso de `library` tiene que ver exactamente el mismo redirect
 * que hoy, esté el complemento prendido o no.
 *
 * 404 y no 403 a propósito: es la convención que ya usan `assertModuleEnabled`
 * de comisiones mensuales y el `notFound()` de /conversaciones. Un 403 dice
 * "existe pero no podés"; un 404 dice "no existe para vos", que es lo correcto
 * para algo que no se contrató y además no filtra el catálogo interno.
 */
import { notFound } from "next/navigation"
import { NextResponse } from "next/server"

import type { AddonKey } from "@/lib/addons/catalog"
import { ADDONS } from "@/lib/addons/catalog"
import { resolveOrgAddons } from "@/lib/addons/server"

export type AddonAccessResult =
  | { allowed: true }
  | { allowed: false; status: 404; code: "addon_required"; message: string }

function deniedMessage(key: AddonKey): string {
  return `${ADDONS[key].name} es un complemento que esta cuenta no tiene contratado.`
}

/**
 * Para libs que ya devuelven una unión discriminada (Emilia, Growth Studio).
 * Mantiene la forma de `resolveEmiliaOrganizationAccess`.
 */
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
      message: deniedMessage(key),
    }
  }

  // Modo SHADOW: deja pasar pero deja rastro de a quién cortaría al encenderlo.
  // Es el ensayo previo a poner el enforcement en ON.
  if (entitlement?.enabledOnlyByEnforcement && entitlement.enforcement === "SHADOW") {
    console.warn("[addons][shadow] cortaría el acceso:", { orgId, addon: key })
  }

  return { allowed: true }
}

/**
 * Server Component / page. Llamar DESPUÉS del chequeo de permisos.
 * Corta el render con `notFound()` si el complemento no está habilitado.
 */
export async function assertAddonEnabledPage(
  supabase: any,
  orgId: string | null | undefined,
  key: AddonKey
): Promise<void> {
  const result = await checkAddon(supabase, orgId, key)
  if (!result.allowed) notFound()
}

/**
 * API route. Llamar DESPUÉS del chequeo de permisos.
 * Devuelve la respuesta 404 a retornar, o null para seguir.
 */
export async function assertAddonEnabledApi(
  supabase: any,
  orgId: string | null | undefined,
  key: AddonKey
): Promise<NextResponse | null> {
  const result = await checkAddon(supabase, orgId, key)
  if (result.allowed) return null
  return NextResponse.json(
    { error: result.message, code: result.code },
    { status: result.status }
  )
}
