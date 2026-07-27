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
  /** Data URI listo para embeber. Vacío si no hay logo usable. */
  logo: string
}

/** jsPDF solo embebe PNG y JPEG. */
const EMBEDDABLE_MIME = /^image\/(png|jpe?g)$/i
const LOGO_FETCH_TIMEOUT_MS = 4000
const LOGO_MAX_BYTES = 2_000_000

/**
 * Convierte el `brand_logo` del tenant en algo que jsPDF pueda dibujar.
 *
 * `organization_settings.brand_logo` guarda la URL pública de Supabase Storage
 * (ver `app/api/settings/organization/logo/route.ts`), no un data URI. jsPDF no
 * descarga nada: si se le pasa una URL, tira. Por eso hay que bajarla acá y
 * pasarla en base64.
 *
 * Falla en silencio y devuelve "" a propósito: sin logo el PDF muestra el
 * nombre y los datos de la agencia, que es una portada perfectamente válida.
 * Que no se pueda bajar una imagen no puede impedir descargar el reporte.
 */
export async function toEmbeddableLogo(raw: string): Promise<string> {
  const value = (raw || "").trim()
  if (!value) return ""
  if (value.startsWith("data:image/")) {
    return EMBEDDABLE_MIME.test(value.slice(5, value.indexOf(";"))) ? value : ""
  }
  if (!/^https?:\/\//i.test(value)) return ""

  try {
    const response = await fetch(value, {
      signal: AbortSignal.timeout(LOGO_FETCH_TIMEOUT_MS),
    })
    if (!response.ok) return ""

    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim()
    if (!EMBEDDABLE_MIME.test(contentType)) return ""

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength === 0 || buffer.byteLength > LOGO_MAX_BYTES) return ""

    const mime = /jpe?g$/i.test(contentType) ? "image/jpeg" : "image/png"
    return `data:${mime};base64,${buffer.toString("base64")}`
  } catch {
    return ""
  }
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
