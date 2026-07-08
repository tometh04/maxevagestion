/**
 * Helper server-side para generar el PDF de una factura AFIP y resolver el
 * email del cliente destinatario. Extraído de app/api/invoices/[id]/pdf/route.ts
 * para reutilizarse tanto en la descarga (GET pdf) como en el envío por email
 * (POST send).
 *
 * renderInvoicePdf (lib/pdf/invoice-pdf.ts) es una función PURA (pdf-lib + QR
 * AFIP); este helper hace el fetch de datos + branding + logo y la envuelve.
 *
 * Multi-tenant (CLAUDE.md): el SELECT de invoices se scopea por org_id explícito
 * (el route original confiaba solo en RLS).
 */

import { getAfipServiceForOrg } from "@/lib/afip/afip-service"
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf"

export interface InvoicePdfResult {
  pdfBytes: Uint8Array
  invoice: any
  /** "{ptoVta}-{cbteNro}" (o id.slice(0,8) si aún no tiene numeración). */
  fileCode: string
  /** Email sugerido del cliente (customer directo, MAIN de la op, o lead). */
  recipientEmail: string | null
}

/**
 * Resuelve el email del cliente destinatario de una factura:
 *   1) invoices.customer_id -> customers.email
 *   2) invoices.operation_id -> operation_customers(MAIN) -> customers.email
 *   3) operations.leads.contact_email
 */
async function resolveInvoiceRecipientEmail(
  supabase: any,
  invoice: any,
  orgId: string
): Promise<string | null> {
  // 1) Cliente directo de la factura
  if (invoice.customer_id) {
    const { data: customer } = await supabase
      .from("customers")
      .select("email")
      .eq("id", invoice.customer_id)
      .eq("org_id", orgId)
      .maybeSingle()
    if (customer?.email) return customer.email
  }

  // 2/3) Vía operación: cliente MAIN o lead
  if (invoice.operation_id) {
    const { data: op } = await supabase
      .from("operations")
      .select(`
        operation_customers(role, customers:customer_id(email)),
        leads:lead_id(contact_email)
      `)
      .eq("id", invoice.operation_id)
      .eq("org_id", orgId)
      .maybeSingle()

    const ocs = (op?.operation_customers || []) as any[]
    const mainEmail =
      ocs.find((c) => c.role === "MAIN")?.customers?.email ||
      ocs[0]?.customers?.email
    if (mainEmail) return mainEmail
    if (op?.leads?.contact_email) return op.leads.contact_email
  }

  return null
}

/**
 * Genera el PDF de la factura y resuelve el destinatario. Devuelve null si la
 * factura no existe o no pertenece al org del user (404 enmascarado).
 */
export async function buildInvoicePdf(params: {
  supabase: any
  invoiceId: string
  orgId: string
}): Promise<InvoicePdfResult | null> {
  const { supabase, invoiceId, orgId } = params

  const { data: invoice, error: fetchError } = await (supabase.from("invoices") as any)
    .select("*, invoice_items (*)")
    .eq("id", invoiceId)
    .eq("org_id", orgId) // Cross-tenant: filtro explícito, no confiar en RLS.
    .single()

  if (fetchError || !invoice) return null

  // Agency (nombre en emisor del PDF)
  const { data: agency } = await (supabase.from("agencies") as any)
    .select("id, name")
    .eq("id", invoice.agency_id)
    .single()

  // Emisor CUIT via AfipService (scopeado por org_id)
  const afipSvc = await getAfipServiceForOrg(supabase, invoice.org_id)
  const emisorCuit = (afipSvc as any)?.config?.cuit || ""

  // Branding per-tenant (mismas keys/aliases que el route original)
  const { data: orgSettings } = await (supabase.from("organization_settings") as any)
    .select("key, value")
    .eq("org_id", orgId)
  const settingsMap = new Map<string, string>(
    (orgSettings || []).map((s: any) => [s.key as string, s.value as string])
  )
  const footerCompanyName = settingsMap.get("company_name") || agency?.name
  const brandColorHex =
    settingsMap.get("brand_color") ||
    settingsMap.get("brand_color_primary") ||
    settingsMap.get("primary_color")
  const brandLogoUrl =
    settingsMap.get("brand_logo") ||
    settingsMap.get("brand_logo_url") ||
    settingsMap.get("company_logo_url")
  const termsText =
    settingsMap.get("pdf_terms_text") ||
    settingsMap.get("terms_pdf") ||
    settingsMap.get("terms")

  let logoBytes: Uint8Array | undefined
  if (brandLogoUrl) {
    try {
      const logoRes = await fetch(brandLogoUrl)
      if (logoRes.ok) {
        const buf = await logoRes.arrayBuffer()
        logoBytes = new Uint8Array(buf)
      }
    } catch (err) {
      console.warn("[buildInvoicePdf] Logo del tenant no se pudo cargar:", err)
    }
  }

  const pdfBytes = await renderInvoicePdf({
    invoice,
    emisor: { cuit: emisorCuit, razonSocial: agency?.name ?? "" },
    agency: { name: agency?.name ?? "Agencia" },
    footerCompanyName,
    branding: {
      logoPngBytes: logoBytes,
      primaryColorHex: brandColorHex,
      termsText,
    },
  })

  const fileCode = invoice.cbte_nro
    ? `${String(invoice.pto_vta).padStart(4, "0")}-${String(invoice.cbte_nro).padStart(8, "0")}`
    : invoiceId.slice(0, 8)

  const recipientEmail = await resolveInvoiceRecipientEmail(supabase, invoice, orgId)

  return { pdfBytes, invoice, fileCode, recipientEmail }
}
