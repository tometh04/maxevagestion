import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule, isOwnDataOnly } from "@/lib/permissions"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    // Verificar permiso de acceso al módulo customers
    if (!canAccessModule(user.role as any, "customers")) {
      return NextResponse.json({ error: "No tiene permiso para ver clientes" }, { status: 403 })
    }

    const { id: customerId } = await params
    const supabase = await createServerClient()

    // Si es SELLER con ownDataOnly, verificar que el cliente pertenece a sus operaciones
    if (isOwnDataOnly(user.role as any, "customers")) {
      const { data: sellerOps } = await supabase
        .from("operations")
        .select("id")
        .or(`seller_primary_id.eq.${user.id},seller_secondary_id.eq.${user.id}`)

      const sellerOpIds = (sellerOps || []).map((op: any) => op.id)

      if (sellerOpIds.length === 0) {
        return NextResponse.json({ payments: [] })
      }

      // Verificar que el cliente está en alguna operación del seller
      const { data: customerInSellerOps } = await supabase
        .from("operation_customers")
        .select("operation_id")
        .eq("customer_id", customerId)
        .in("operation_id", sellerOpIds)

      if (!customerInSellerOps || customerInSellerOps.length === 0) {
        return NextResponse.json({ error: "No tiene permiso para ver este cliente" }, { status: 403 })
      }

      // Solo devolver pagos de operaciones del seller
      const filteredOpIds = customerInSellerOps.map((oc: any) => oc.operation_id)

      const { data: payments, error } = await (supabase.from("payments") as any)
        .select(`
          id,
          amount,
          currency,
          direction,
          status,
          date_due,
          date_paid,
          method,
          payer_type,
          operations:operation_id (
            id,
            destination,
            file_code
          )
        `)
        .in("operation_id", filteredOpIds)
        .eq("direction", "INCOME")
        .order("date_due", { ascending: false })

      if (error) {
        console.error("Error fetching customer payments:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ payments: payments || [] })
    }

    // Obtener todas las operaciones donde el cliente es pasajero
    const { data: operationCustomers } = await supabase
      .from("operation_customers")
      .select("operation_id")
      .eq("customer_id", customerId)

    if (!operationCustomers || operationCustomers.length === 0) {
      return NextResponse.json({ payments: [] })
    }

    const operationIds = operationCustomers.map((oc: any) => oc.operation_id)

    // Obtener pagos de esas operaciones (solo INCOME - lo que el cliente debe pagar)
    const { data: payments, error } = await (supabase.from("payments") as any)
      .select(`
        id,
        amount,
        currency,
        direction,
        status,
        date_due,
        date_paid,
        method,
        payer_type,
        operations:operation_id (
          id,
          destination,
          file_code
        )
      `)
      .in("operation_id", operationIds)
      .eq("direction", "INCOME")
      .order("date_due", { ascending: false })

    if (error) {
      console.error("Error fetching customer payments:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ payments: payments || [] })
  } catch (error: any) {
    console.error("Error in GET /api/customers/[id]/payments:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

