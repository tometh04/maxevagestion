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

    // Footer company name opcional desde organization_settings
    const { data: orgSettings } = await (supabase.from("organization_settings") as any)
      .select("key, value")
    const footerCompanyName =
      orgSettings?.find((s: any) => s.key === "company_name")?.value || agency?.name

    const pdfBytes = await renderInvoicePdf({
      invoice,
      emisor: { cuit: emisorCuit, razonSocial: agency?.name ?? "" },
      agency: { name: agency?.name ?? "Agencia" },
      footerCompanyName,
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
