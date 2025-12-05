import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { format } from "date-fns"
import { es } from "date-fns/locale"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paymentId } = await context.params
    
    if (!paymentId) {
      return NextResponse.json({ error: "ID de pago requerido" }, { status: 400 })
    }

    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener pago con datos relacionados
    const { data: payment, error } = await (supabase.from("payments") as any)
      .select(`
        *,
        operations:operation_id (
          id,
          file_code,
          destination,
          agencies:agency_id (id, name, city, phone, email, address)
        )
      `)
      .eq("id", paymentId)
      .single()

    if (error || !payment) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })
    }

    // Si el pago está asociado a una operación con clientes, obtener el cliente principal
    let customerName = "Cliente"
    let customerAddress = ""
    let customerCity = ""
    
    if (payment.operations?.id) {
      const { data: mainCustomer } = await (supabase
        .from("operation_customers") as any)
        .select(`
          customers:customer_id (first_name, last_name, address, city)
        `)
        .eq("operation_id", payment.operations.id)
        .eq("role", "MAIN")
        .single()

      if (mainCustomer?.customers) {
        const c = mainCustomer.customers as any
        customerName = `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Cliente"
        customerAddress = c.address || ""
        customerCity = c.city || ""
      }
    }

    const agency = payment.operations?.agencies
    const agencyCity = agency?.city || "Rosario"
    const agencyName = agency?.name || "Maxeva Gestion"

    // Generar número de recibo
    const receiptNumber = `1000-${paymentId.replace(/-/g, "").slice(-8).toUpperCase()}`

    // Formatear fecha
    const fechaPago = payment.date_paid || payment.date_due || new Date().toISOString()
    const fechaFormateada = format(new Date(fechaPago), "d 'de' MMMM 'de' yyyy", { locale: es })

    // Moneda y monto
    const currencyName = payment.currency === "USD" ? "Dolar" : "Pesos"
    const amount = Number(payment.amount) || 0

    // Concepto
    let concepto = payment.reference || ""
    if (!concepto && payment.operations?.destination) {
      concepto = `Pago viaje ${payment.operations.destination}`
    }
    if (!concepto) {
      concepto = "Pago de servicios turisticos"
    }

    return NextResponse.json({
      receiptNumber,
      fechaFormateada,
      agencyCity,
      agencyName,
      customerName,
      customerAddress,
      customerCity,
      currencyName,
      currency: payment.currency,
      amount,
      concepto,
    })
  } catch (error: any) {
    console.error("Error fetching receipt data:", error)
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 })
  }
}

