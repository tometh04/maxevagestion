/**
 * Branding del tenant para el encabezado y el pie de los PDF de reportes.
 * Mismas claves que usa la liquidación de servicios
 * (`lib/operations/statement-data.ts`), para que todos los documentos que la
 * agencia manda afuera se vean iguales.
 */

export interface ReportCompany {
  name: string
  address: string
  phone: string
  email: string
  website: string
  taxId: string
  logo: string
}

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

  return {
    name: getSetting("company_name", fallbackName),
    address: getSetting("address"),
    phone: getSetting("phone"),
    email: getSetting("email"),
    website: getSetting("website"),
    taxId: getSetting("tax_id"),
    logo: getSetting("brand_logo"),
  }
}
