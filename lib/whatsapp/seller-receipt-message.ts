import { SupabaseClient } from "@supabase/supabase-js"
import { buildReceiptFileName } from "@/lib/receipts/receipt-file"

function buildReceiptNumber(paymentId: string): string {
  return `1000-${paymentId.replace(/-/g, "").slice(-8).toUpperCase()}`
}

function buildCustomerDisplayName(customer?: {
  first_name?: string | null
  last_name?: string | null
} | null): string {
  const fullName = `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim()
  return fullName || "Cliente"
}

export async function upsertSellerReceiptMessage(
  supabase: SupabaseClient,
  paymentId: string
): Promise<boolean> {
  const { data: payment, error: paymentError } = await (supabase.from("payments") as any)
    .select(`
      id,
      amount,
      currency,
      date_paid,
      date_due,
      payer_type,
      direction,
      operations:operation_id (
        id,
        agency_id,
        destination,
        file_code,
        seller_id,
        users:seller_id (
          id,
          name
        ),
        operation_customers (
          role,
          customers:customer_id (
            id,
            first_name,
            last_name
          )
        )
      )
    `)
    .eq("id", paymentId)
    .eq("payer_type", "CUSTOMER")
    .eq("direction", "INCOME")
    .single()

  if (paymentError || !payment) {
    console.error("Error obteniendo datos para mensaje interno de recibo:", paymentError)
    return false
  }

  const operation = (payment as any).operations
  const seller = operation?.users

  if (!operation?.id || !seller?.id) {
    return false
  }

  const selectedCustomer =
    operation.operation_customers?.find((customer: any) => customer.role === "MAIN")?.customers ||
    operation.operation_customers?.find((customer: any) => customer.customers)?.customers ||
    null

  const customerName = buildCustomerDisplayName(selectedCustomer)
  const customerLastName = selectedCustomer?.last_name || null
  const receiptNumber = buildReceiptNumber(paymentId)
  const receiptFileName = buildReceiptFileName(customerLastName, receiptNumber)
  const formattedAmount = `${payment.currency} ${Number(payment.amount || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
  const paidDate = new Date(payment.date_paid || payment.date_due || new Date().toISOString()).toLocaleDateString("es-AR")
  const operationLabel = [operation.file_code, operation.destination].filter(Boolean).join(" · ") || "Operación"
  const message = [
    `Recibo listo · ${customerLastName || customerName} · ${receiptFileName}`,
    "",
    `Cliente: ${customerName}`,
    `Monto: ${formattedAmount}`,
    `Recibo: ${receiptNumber}`,
    `Operación: ${operationLabel}`,
    `Fecha: ${paidDate}`,
    "",
    "Descargá el PDF para controlarlo y reenviarlo al cliente.",
  ].join("\n")

  const existingMessageQuery = (supabase.from("whatsapp_messages") as any)
    .select("id")
    .eq("channel", "INTERNAL")
    .eq("message_kind", "SELLER_RECEIPT")
    .eq("payment_id", paymentId)
    .eq("recipient_user_id", seller.id)
    .maybeSingle()

  const { data: existingMessage, error: existingError } = await existingMessageQuery

  if (existingError) {
    console.error("Error verificando mensaje interno existente:", existingError)
    return false
  }

  const payload = {
    customer_id: selectedCustomer?.id || null,
    customer_name: customerName,
    phone: null,
    message,
    whatsapp_link: null,
    operation_id: operation.id,
    payment_id: paymentId,
    agency_id: operation.agency_id,
    scheduled_for: new Date().toISOString(),
    channel: "INTERNAL",
    message_kind: "SELLER_RECEIPT",
    recipient_user_id: seller.id,
    recipient_name: seller.name || "Vendedor",
  }

  if (existingMessage?.id) {
    const { error: updateError } = await (supabase.from("whatsapp_messages") as any)
      .update(payload)
      .eq("id", existingMessage.id)

    if (updateError) {
      console.error("Error actualizando mensaje interno de recibo:", updateError)
      return false
    }

    return true
  }

  const { error: insertError } = await (supabase.from("whatsapp_messages") as any).insert({
    ...payload,
    status: "PENDING",
  })

  if (insertError) {
    console.error("Error creando mensaje interno de recibo:", insertError)
    return false
  }

  return true
}
