/**
 * Gates de complementos para páginas y rutas de API.
 *
 * La lógica de chequeo vive en `lib/addons/access.ts`, sin dependencias de
 * Next: acá sólo están los envoltorios que traducen el resultado a
 * `notFound()` o a una `NextResponse`. Las libs de dominio importan de
 * `access.ts` para no arrastrar el runtime de Next.
 *
 * ORDEN OBLIGATORIO: primero permisos (403 / redirect), después complemento
 * (404). El complemento se ANDea con el permiso, nunca lo reemplaza ni lo
 * amplía: dice "la agencia contrató esto", no "este usuario puede usarlo". Un
 * SELLER sin permiso de `library` tiene que ver exactamente el mismo redirect
 * que hoy, esté el complemento prendido o no.
 *
 * 404 y no 403 a propósito: es la convención que ya usaban las rutas de
 * comisiones mensuales y el `notFound()` de /conversaciones. Un 403 dice
 * "existe pero no podés"; un 404 dice "no existe para vos", que es lo correcto
 * para algo que no se contrató y además no filtra el catálogo interno.
 */
import { notFound } from "next/navigation"
import { NextResponse } from "next/server"

import { checkAddon } from "@/lib/addons/access"
import type { AddonKey } from "@/lib/addons/catalog"

export { checkAddon } from "@/lib/addons/access"
export type { AddonAccessResult } from "@/lib/addons/access"

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
