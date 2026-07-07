import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { buildOperationStatementData } from "@/lib/operations/statement-data"
import { generateOperationStatementPdf } from "@/lib/pdf/operation-statement-pdf"
import { sendOperationStatementEmail } from "@/lib/email/email-service"
import { format } from "date-fns"
import { es } from "date-fns/locale"

/**
 * POST /api/operations/[id]/statement/send
 *
 * Envía por email al pasajero el "Detalle de la Operación" (Liquidación de
 * Servicios) con el PDF adjunto. Body: { to?: string } — si no viene, usa el
 * email del cliente MAIN (o del lead).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: operationId } = await params

    // Guard multi-tenant (regla de oro CLAUDE.md).
    if (!(user as any).org_id) {
      return NextResponse.json(
        { error: "Usuario sin organización asociada" },
        { status: 400 }
      )
    }
    if (!canPerformAction(user, "operations", "read")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const to: string | undefined =
      typeof body?.to === "string" && body.to.trim() ? body.to.trim() : undefined

    const supabase = await createServerClient()
    const data = await buildOperationStatementData({
      supabase,
      operationId,
      orgId: (user as any).org_id,
    })

    // 404 enmascarado si la operación no existe o es de otro tenant.
    if (!data) {
      return NextResponse.json(
        { error: "Operación no encontrada" },
        { status: 404 }
      )
    }

    const recipient = to || data.recipientEmail
    if (!recipient) {
      return NextResponse.json(
        { error: "No hay email de destino. Cargá el email del cliente o indicá uno." },
        { status: 400 }
      )
    }

    const pdfBuffer = Buffer.from(generateOperationStatementPdf(data))

    const totalAmountStr = `${data.currency} ${data.totalAmount.toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
    const dueDateStr = data.dueDate
      ? format(new Date(data.dueDate + "T12:00:00"), "dd/MM/yyyy", { locale: es })
      : "A convenir"

    const result = await sendOperationStatementEmail(
      recipient,
      {
        customerName: data.customerName,
        destination: data.destination,
        fileCode: data.fileCode,
        totalAmount: totalAmountStr,
        dueDate: dueDateStr,
        agencyName: data.agencyName,
      },
      pdfBuffer,
      supabase
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, emailId: result.id, sentTo: recipient })
  } catch (error: any) {
    console.error("[statement/send] error:", error)
    return NextResponse.json(
      { error: error?.message || "Error al enviar el email" },
      { status: 500 }
    )
  }
}
