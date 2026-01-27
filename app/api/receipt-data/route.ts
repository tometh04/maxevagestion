import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { format } from "date-fns"
import { es } from "date-fns/locale"

// API para obtener datos del recibo - genera PDF en el cliente
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const paymentId = searchParams.get("paymentId")
    
    if (!paymentId) {
      return NextResponse.json({ error: "ID de pago requerido" }, { status: 400 })
    }

    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener pago con datos relacionados (incluyendo info completa del viaje)
    const { data: payment, error } = await (supabase.from("payments") as any)
      .select(`
        *,
        operations:operation_id (
          id,
          file_code,
          destination,
          origin,
          departure_date,
          return_date,
          sale_amount_total,
          sale_currency,
          currency,
          adults,
          children,
          infants,
          type,
          agencies:agency_id (id, name, city),
          operators:operator_id (id, name)
        )
      `)
      .eq("id", paymentId)
      .single()

    if (error) {
      console.error("Supabase error:", error)
      return NextResponse.json({ error: "Error en base de datos: " + error.message, paymentId }, { status: 500 })
    }
    
    if (!payment) {
      return NextResponse.json({ error: "Pago no encontrado", paymentId }, { status: 404 })
    }

    // Si el pago está asociado a una operación con clientes, obtener el cliente principal
    let customerName = "Cliente"
    let customerAddress = ""
    let customerCity = ""
    
    // Calcular saldo restante
    let saldoRestante = 0
    let totalOperacion = 0
    let totalPagado = 0
    let allPayments: any[] = []
    
    if (payment.operations?.id) {
      // Obtener cliente principal
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

      // Obtener todos los pagos de la operación para calcular saldo y mostrar historial
      const { data: paymentsData } = await (supabase.from("payments") as any)
        .select("id, amount, currency, date_paid, status, payer_type, reference")
        .eq("operation_id", payment.operations.id)
        .eq("payer_type", "CUSTOMER")
        .eq("status", "PAID")
        .order("date_paid", { ascending: true })

      allPayments = paymentsData || []
      totalOperacion = Number(payment.operations.sale_amount_total) || 0
      totalPagado = allPayments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
      saldoRestante = totalOperacion - totalPagado
    }

    const agency = payment.operations?.agencies
    const agencyCity = agency?.city || "Rosario"
    const agencyName = agency?.name || "Lozada Viajes"

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
      totalOperacion,
      totalPagado,
      saldoRestante,
      destination: payment.operations?.destination || "",
      fileCode: payment.operations?.file_code || "",
      origin: payment.operations?.origin || "",
      departureDate: payment.operations?.departure_date || null,
      returnDate: payment.operations?.return_date || null,
      adults: payment.operations?.adults || 0,
      children: payment.operations?.children || 0,
      infants: payment.operations?.infants || 0,
      operationType: payment.operations?.type || "",
      operatorName: payment.operations?.operators?.name || "",
      paymentHistory: (allPayments || []).map((p: any) => ({
        id: p.id,
        amount: Number(p.amount) || 0,
        currency: p.currency,
        datePaid: p.date_paid,
        reference: p.reference || "",
      })),
    })
  } catch (error: any) {
    console.error("Error fetching receipt data:", error)
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 })
  }
}
