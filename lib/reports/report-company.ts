/**
 * Branding del tenant para el encabezado y el pie de los PDF de reportes.
 * Mismas claves que usa la liquidación de servicios
 * (`lib/operations/statement-data.ts`), para que todos los documentos que la
 * agencia manda afuera se vean iguales.
 */

import { toEmbeddableLogo } from "@/lib/pdf/logo"

export interface ReportCompany {
  name: string
  address: string
  phone: string
  email: string
  website: string
  taxId: string
  /** Data URI listo para embeber. Vacío si no hay logo usable. */
  logo: string
}

// La resolución del logo (bajar la URL, validar formato y tamaño) vive en
// `lib/pdf/logo.ts`, compartida con la liquidación de servicios, el itinerario
// y las facturas. Se re-exporta acá por comodidad de los reportes.
export { toEmbeddableLogo }

export async function loadReportCompany(params: {
  supabase: any
  orgId: string
}): Promise<ReportCompany> {
  const { supabase, orgId } = params

  const { data: settingsRows } = await (supabase.from("organization_settings") as any)
    .select("key, value")
    .eq("org_id", orgId)

  const getSetting = (key: string, fallback = "") =>
    (settingsRows || []).find((s: any) => s.key === key)?.value || fallback

  let fallbackName = "Mi Empresa"
  if (!getSetting("company_name")) {
    const { data: org } = await (supabase.from("organizations") as any)
      .select("name")
      .eq("id", orgId)
      .maybeSingle()
    fallbackName = (org as any)?.name || fallbackName
  }

  // Aliases: la UI "Mi Empresa" guarda brand_logo; hay orgs migradas con
  // brand_logo_url / company_logo_url (mismo criterio que la exportación de
  // facturas, ver app/api/invoices/export/route.ts).
  const rawLogo =
    getSetting("brand_logo") || getSetting("brand_logo_url") || getSetting("company_logo_url")

  return {
    name: getSetting("company_name", fallbackName),
    address: getSetting("address"),
    phone: getSetting("phone"),
    email: getSetting("email"),
    website: getSetting("website"),
    taxId: getSetting("tax_id"),
    logo: await toEmbeddableLogo(rawLogo),
  }
}
