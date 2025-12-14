import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { createWhatsAppMessage } from "@/lib/whatsapp/whatsapp-service"

/**
 * POST /api/whatsapp/send-receipt
 * Crea un mensaje WhatsApp para enviar un recibo al cliente
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()
    const { paymentId } = body

    if (!paymentId) {
      return NextResponse.json({ error: "paymentId es requerido" }, { status: 400 })
    }

    // Obtener datos del pago y cliente
    const { data: payment, error: paymentError } = await (supabase.from("payments") as any)
      .select(`
        *,
        operations:operation_id (
          id,
          destination,
          agency_id,
          operation_customers!inner(
            role,
            customers:customer_id (
              id,
              first_name,
              last_name,
              phone
            )
          )
        )
      `)
      .eq("id", paymentId)
      .eq("direction", "INCOME")
      .eq("payer_type", "CUSTOMER")
      .single()

    if (paymentError || !payment) {
      return NextResponse.json({ error: "Pago no encontrado o no es un cobro de cliente" }, { status: 404 })
    }

    const operation = payment.operations as any
    if (!operation) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    // Obtener cliente principal
    const mainCustomer = operation.operation_customers?.find(
      (oc: any) => oc.role === "MAIN" && oc.customers?.phone
    )?.customers || operation.operation_customers?.find(
      (oc: any) => oc.customers?.phone
    )?.customers

    if (!mainCustomer?.phone) {
      return NextResponse.json({ error: "El cliente no tiene teléfono registrado" }, { status: 400 })
    }

    // Obtener datos del recibo
    const receiptResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/receipt-data?paymentId=${paymentId}`)
    if (!receiptResponse.ok) {
      return NextResponse.json({ error: "Error al obtener datos del recibo" }, { status: 500 })
    }
    const receiptData = await receiptResponse.json()

    // Crear mensaje WhatsApp con template RECEIPT_SENT o usar uno genérico
    const customerName = `${mainCustomer.first_name || ""} ${mainCustomer.last_name || ""}`.trim()
    const amount = `${payment.currency} ${Number(payment.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
    const receiptNumber = receiptData.receiptNumber || `1000-${paymentId.slice(-8).toUpperCase()}`
    const fechaPago = receiptData.fechaFormateada || new Date(payment.date_paid || payment.date_due).toLocaleDateString("es-AR")

    // Variables para el template
    const variables = {
      nombre: customerName.split(" ")[0] || "Cliente",
      monto: amount,
      recibo: receiptNumber,
      fecha: fechaPago,
      destino: operation.destination || "viaje",
      concepto: receiptData.concepto || "Pago de servicios turísticos",
    }

    // Intentar crear mensaje con trigger RECEIPT_SENT, si no existe usar MANUAL
    let success = await createWhatsAppMessage({
      supabase,
      triggerType: "RECEIPT_SENT",
      customerId: mainCustomer.id,
      customerName,
      customerPhone: mainCustomer.phone,
      agencyId: operation.agency_id,
      variables,
      operationId: operation.id,
      paymentId: paymentId,
    })

    // Si no hay template RECEIPT_SENT, crear mensaje manual
    if (!success) {
      // Crear mensaje manual con link al recibo
      const message = `✅ Recibo de Pago\n\nHola ${variables.nombre},\n\nTe enviamos el recibo de tu pago:\n\n💰 Monto: ${amount}\n📄 Recibo: ${receiptNumber}\n📅 Fecha: ${fechaPago}\n🎯 Concepto: ${variables.concepto}\n\nPuedes descargar el recibo completo desde el sistema.`
      
      const cleanPhone = mainCustomer.phone.replace(/\D/g, "")
      const whatsappLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`

      // Insertar mensaje manual
      const { error: insertError } = await (supabase.from("whatsapp_messages") as any).insert({
        customer_id: mainCustomer.id,
        phone: mainCustomer.phone,
        customer_name: customerName,
        message,
        whatsapp_link: whatsappLink,
        operation_id: operation.id,
        payment_id: paymentId,
        agency_id: operation.agency_id,
        scheduled_for: new Date().toISOString(),
        status: "PENDING",
      })

      if (insertError) {
        console.error("Error creating WhatsApp message:", insertError)
        return NextResponse.json({ error: "Error al crear mensaje WhatsApp" }, { status: 500 })
      }

      success = true
    }

    // Obtener el link de WhatsApp del mensaje creado
    const { data: createdMessage } = await (supabase.from("whatsapp_messages") as any)
      .select("whatsapp_link")
      .eq("payment_id", paymentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({ 
      success: true,
      message: "Mensaje WhatsApp creado exitosamente",
      whatsappLink: createdMessage?.whatsapp_link || `https://wa.me/${mainCustomer.phone.replace(/\D/g, "")}`
    })
  } catch (error: any) {
    console.error("Error in POST /api/whatsapp/send-receipt:", error)
    return NextResponse.json({ error: error.message || "Error al enviar recibo por WhatsApp" }, { status: 500 })
  }
}

