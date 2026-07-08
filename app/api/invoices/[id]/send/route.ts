import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { buildInvoicePdf } from "@/lib/invoices/invoice-pdf-data"
import { sendInvoiceEmail } from "@/lib/email/email-service"
import { COMPROBANTE_LABELS } from "@/lib/afip/types"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/** Mapea el código de moneda AFIP a un símbolo legible. */
function displayCurrency(moneda: string | null | undefined): string {
  const m = String(moneda || "PES").toUpperCase()
  if (m === "PES") return "ARS"
  if (m === "DOL") return "USD"
  return m
}

/**
 * POST /api/invoices/[id]/send
 *
 * Envía por email la factura AFIP con el PDF adjunto. Solo facturas
 * autorizadas (con CAE — las únicas con QR válido). Body: { to?: string }.
 */
export async function POST(
  request: Request,
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

    const body = await request.json().catch(() => ({}))
    const to: string | undefined =
      typeof body?.to === "string" && body.to.trim() ? body.to.trim() : undefined

    const supabase = await createServerClient()
    const result = await buildInvoicePdf({
      supabase,
      invoiceId: id,
      orgId: (user as any).org_id,
    })

    if (!result) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    const { invoice, pdfBytes, fileCode, recipientEmail } = result

    // Solo comprobantes autorizados (con CAE) se pueden enviar.
    if (!invoice.cae) {
      return NextResponse.json(
        { error: "La factura aún no está autorizada por AFIP" },
        { status: 400 }
      )
    }

    const recipient = to || recipientEmail
    if (!recipient) {
      return NextResponse.json(
        { error: "No hay email de destino. Cargá el email del cliente o indicá uno." },
        { status: 400 }
      )
    }

    const comprobante =
      COMPROBANTE_LABELS[invoice.cbte_tipo as keyof typeof COMPROBANTE_LABELS] ||
      `Comprobante ${invoice.cbte_tipo}`
    const invoiceLabel = `${comprobante} ${fileCode}`
    const total = `${displayCurrency(invoice.moneda)} ${Number(invoice.imp_total || 0).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

    const buildResult = await sendInvoiceEmail(
      recipient,
      {
        customerName: invoice.receptor_nombre || "Cliente",
        invoiceLabel,
        total,
        agencyName: "",
      },
      Buffer.from(pdfBytes),
      `factura-${fileCode}.pdf`,
      supabase
    )

    if (!buildResult.success) {
      return NextResponse.json({ error: buildResult.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, emailId: buildResult.id, sentTo: recipient })
  } catch (error: any) {
    console.error("[invoices/[id]/send] error:", error)
    return NextResponse.json(
      { error: error?.message || "Error al enviar el email" },
      { status: 500 }
    )
  }
}
