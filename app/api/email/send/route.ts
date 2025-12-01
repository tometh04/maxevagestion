import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { 
  sendQuotationEmail, 
  sendPaymentConfirmationEmail, 
  sendPaymentReminderEmail,
  sendEmail
} from "@/lib/email/email-service"
import { format } from "date-fns"
import { es } from "date-fns/locale"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    const { type, entityId, to } = body

    if (!type) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 })
    }

    // El statement no requiere entityId
    if (type !== "statement" && !entityId) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 })
    }

    let result

    switch (type) {
      case "quotation": {
        // Obtener datos de la cotización
        const { data: quotation } = await (supabase.from("quotations") as any)
          .select(`
            *,
            agencies:agency_id (name),
            leads:lead_id (contact_name, contact_email)
          `)
          .eq("id", entityId)
          .single()

        if (!quotation) {
          return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
        }

        const email = to || quotation.leads?.contact_email
        if (!email) {
          return NextResponse.json({ error: "No hay email de destino" }, { status: 400 })
        }

        // Generar PDF
        const pdfResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ""}/api/quotations/${entityId}/pdf`)
        const pdfBuffer = pdfResponse.ok ? Buffer.from(await pdfResponse.arrayBuffer()) : undefined

        result = await sendQuotationEmail(
          email,
          quotation.quotation_number,
          quotation.leads?.contact_name || "Cliente",
          quotation.destination,
          `${quotation.currency} ${quotation.total_amount.toLocaleString("es-AR")}`,
          format(new Date(quotation.valid_until), "dd/MM/yyyy", { locale: es }),
          quotation.agencies?.name || "Agencia",
          pdfBuffer
        )
        break
      }

      case "payment_confirmation": {
        // Obtener datos del pago
        const { data: payment } = await (supabase.from("payments") as any)
          .select(`
            *,
            operations:operation_id (
              destination,
              agencies:agency_id (name)
            )
          `)
          .eq("id", entityId)
          .single()

        if (!payment) {
          return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })
        }

        // Obtener cliente principal de la operación
        const { data: mainCustomer } = await (supabase.from("operation_customers") as any)
          .select(`customers:customer_id (first_name, last_name, email)`)
          .eq("operation_id", payment.operation_id)
          .eq("role", "MAIN")
          .single()

        const email = to || mainCustomer?.customers?.email
        if (!email) {
          return NextResponse.json({ error: "No hay email de destino" }, { status: 400 })
        }

        const customerName = mainCustomer?.customers 
          ? `${mainCustomer.customers.first_name} ${mainCustomer.customers.last_name}`
          : "Cliente"

        result = await sendPaymentConfirmationEmail(
          email,
          customerName,
          `${payment.currency} ${payment.amount.toLocaleString("es-AR")}`,
          payment.method,
          payment.operations?.destination || "Viaje",
          payment.operations?.agencies?.name || "Agencia"
        )
        break
      }

      case "payment_reminder": {
        // Obtener datos del pago
        const { data: payment } = await (supabase.from("payments") as any)
          .select(`
            *,
            operations:operation_id (
              destination,
              agencies:agency_id (name)
            )
          `)
          .eq("id", entityId)
          .single()

        if (!payment) {
          return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })
        }

        // Obtener cliente principal
        const { data: mainCustomer } = await (supabase.from("operation_customers") as any)
          .select(`customers:customer_id (first_name, last_name, email)`)
          .eq("operation_id", payment.operation_id)
          .eq("role", "MAIN")
          .single()

        const email = to || mainCustomer?.customers?.email
        if (!email) {
          return NextResponse.json({ error: "No hay email de destino" }, { status: 400 })
        }

        const customerName = mainCustomer?.customers 
          ? `${mainCustomer.customers.first_name} ${mainCustomer.customers.last_name}`
          : "Cliente"

        result = await sendPaymentReminderEmail(
          email,
          customerName,
          `${payment.currency} ${payment.amount.toLocaleString("es-AR")}`,
          format(new Date(payment.date_due), "dd/MM/yyyy", { locale: es }),
          payment.operations?.destination || "Viaje",
          payment.operations?.agencies?.name || "Agencia"
        )
        break
      }

      case "statement": {
        // Enviar estado de cuenta con HTML pre-generado
        const { to: emailTo, customerName, html } = body

        if (!emailTo || !html) {
          return NextResponse.json({ error: "Faltan parámetros para estado de cuenta" }, { status: 400 })
        }

        result = await sendEmail({
          to: emailTo,
          subject: `Estado de Cuenta - ${customerName || "Cliente"}`,
          html,
        })
        break
      }

      default:
        return NextResponse.json({ error: "Tipo de email no soportado" }, { status: 400 })
    }

    if (result.success) {
      return NextResponse.json({ success: true, emailId: result.id })
    } else {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
  } catch (error: any) {
    console.error("Error sending email:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

