import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { buildInvoicePdf } from "@/lib/invoices/invoice-pdf-data"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * GET /api/invoices/[id]/pdf
 *
 * Devuelve el PDF de una factura con QR AFIP oficial embebido (RG 4291).
 * La generación vive en buildInvoicePdf (reusado por el envío por email).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()

    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const result = await buildInvoicePdf({
      supabase,
      invoiceId: id,
      orgId: (user as any).org_id,
    })

    if (!result) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    return new NextResponse(Buffer.from(result.pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="factura-${result.fileCode}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error("Error generating invoice PDF:", error)
    return NextResponse.json({ error: error.message || "Error al generar PDF" }, { status: 500 })
  }
}
