import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

// GET - Obtener operaciones pendientes de facturar
export async function GET() {
  try {
    const { user } = await getCurrentUser()
    
    if (!["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()

    // Obtener operaciones confirmadas que no tienen factura
    // Por ahora usamos status = CONFIRMED, TRAVELLING, TRAVELLED
    const { data: operations, error } = await supabase
      .from("operations")
      .select(`
        id,
        file_code,
        destination,
        sale_amount_total,
        sale_currency,
        departure_date,
        status,
        customer_id,
        customers:customer_id(first_name, last_name)
      `)
      .in("status", ["CONFIRMED", "TRAVELLING", "TRAVELLED", "CLOSED"])
      .is("invoice_cae", null) // Sin CAE = sin factura
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("Error fetching pending invoices:", error)
      return NextResponse.json({ error: "Error al obtener operaciones" }, { status: 500 })
    }

    // Formatear respuesta
    const formattedOperations = (operations || []).map((op: any) => ({
      id: op.id,
      file_code: op.file_code,
      customer_name: op.customers 
        ? `${op.customers.first_name} ${op.customers.last_name}`
        : "Sin cliente",
      destination: op.destination || "-",
      sale_amount_total: parseFloat(op.sale_amount_total) || 0,
      sale_currency: op.sale_currency || "ARS",
      departure_date: op.departure_date,
      status: op.status,
    }))

    return NextResponse.json({ operations: formattedOperations })
  } catch (error: any) {
    console.error("Error in GET /api/accounting/invoicing/pending:", error)
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 })
  }
}
