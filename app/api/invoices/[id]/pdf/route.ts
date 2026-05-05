import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getAfipServiceForOrg } from "@/lib/afip/afip-service"
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * GET /api/invoices/[id]/pdf
 *
 * Devuelve el PDF de una factura con QR AFIP oficial embebido (RG 4291).
 * RLS scope: si el user no pertenece al org de la factura, 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 })
    }

    const { data: invoice, error: fetchError } = await (supabase.from("invoices") as any)
      .select("*, invoice_items (*)")
      .eq("id", id)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    // Agency (para nombre en emisor del PDF)
    const { data: agency } = await (supabase.from("agencies") as any)
      .select("id, name")
      .eq("id", invoice.agency_id)
      .single()

    // Emisor CUIT via AfipService (scopeado por org_id)
    const afipSvc = await getAfipServiceForOrg(supabase, invoice.org_id)
    const emisorCuit = (afipSvc as any)?.config?.cuit || ""

    // Branding per-tenant (Pendientes 4.5) — same que en invoices/export
    const { data: orgSettings } = await (supabase.from("organization_settings") as any)
      .select("key, value")
    const settingsMap = new Map<string, string>(
      (orgSettings || []).map((s: any) => [s.key as string, s.value as string])
    )
    const footerCompanyName = settingsMap.get("company_name") || agency?.name
    // Aliases con UI Mi Empresa (brand_color, brand_logo) + legacy keys
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
        console.warn("[invoices/[id]/pdf] Logo del tenant no se pudo cargar:", err)
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

    const compStr = invoice.cbte_nro
      ? `${String(invoice.pto_vta).padStart(4, "0")}-${String(invoice.cbte_nro).padStart(8, "0")}`
      : id.slice(0, 8)

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="factura-${compStr}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error("Error generating invoice PDF:", error)
    return NextResponse.json({ error: error.message || "Error al generar PDF" }, { status: 500 })
  }
}
