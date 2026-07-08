import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { buildReceiptPdfData } from "@/lib/receipts/receipt-pdf-data"
import { generateReceiptPdfBuffer, type ReceiptLogoImage } from "@/lib/pdf/receipt-pdf"
import { sendReceiptEmail } from "@/lib/email/email-service"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * Descarga el logo del tenant (URL de Storage) y lo devuelve como dataUrl base64
 * para embeberlo en el PDF server-side (sin canvas). null si falla o es SVG.
 */
async function loadReceiptLogoBase64(url: string): Promise<ReceiptLogoImage | null> {
  try {
    if (url.startsWith("data:")) return { dataUrl: url }
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get("content-type") || "image/png"
    // jsPDF no puede embeber SVG sin rasterizar → se omite (recibo sin logo).
    if (contentType.includes("svg")) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return { dataUrl: `data:${contentType};base64,${buf.toString("base64")}` }
  } catch {
    return null
  }
}

/**
 * POST /api/payments/[id]/receipt/send
 *
 * Envía por email el recibo de pago (o comprobante de devolución) con el PDF
 * adjunto. Body: { to?: string }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paymentId } = await params
    const { user } = await getCurrentUser()

    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "operations", "read")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const to: string | undefined =
      typeof body?.to === "string" && body.to.trim() ? body.to.trim() : undefined

    const supabase = await createServerClient()
    const result = await buildReceiptPdfData({
      supabase,
      paymentId,
      orgId: (user as any).org_id,
      user: { id: user.id, role: user.role as string },
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const data = result.data
    const recipient = to || data.recipientEmail
    if (!recipient) {
      return NextResponse.json(
        { error: "No hay email de destino. Cargá el email del cliente o indicá uno." },
        { status: 400 }
      )
    }

    const logoImage = data.brandLogo ? await loadReceiptLogoBase64(data.brandLogo) : null
    const pdfBuffer = Buffer.from(await generateReceiptPdfBuffer(data, logoImage))

    const amountStr = `${data.currency} ${(Number(data.amount) || 0).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

    const sendResult = await sendReceiptEmail(
      recipient,
      {
        customerName: data.customerName || "Cliente",
        receiptNumber: data.receiptNumber,
        amount: amountStr,
        mode: data.mode || "PAYMENT",
        destination: data.destination,
        agencyName: data.agencyName,
      },
      pdfBuffer,
      data.receiptFileName || `recibo-${data.receiptNumber}.pdf`,
      supabase
    )

    if (!sendResult.success) {
      return NextResponse.json({ error: sendResult.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, emailId: sendResult.id, sentTo: recipient })
  } catch (error: any) {
    console.error("[payments/[id]/receipt/send] error:", error)
    return NextResponse.json(
      { error: error?.message || "Error al enviar el email" },
      { status: 500 }
    )
  }
}
