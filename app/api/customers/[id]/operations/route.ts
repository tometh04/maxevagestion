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
        return NextResponse.json({ operations: [] })
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

      // Solo devolver operaciones del seller
      const filteredOpIds = customerInSellerOps.map((oc: any) => oc.operation_id)

      const { data: operations, error } = await supabase
        .from("operations")
        .select(`
          id,
          file_code,
          destination,
          departure_date,
          return_date,
          status,
          type
        `)
        .in("id", filteredOpIds)
        .order("departure_date", { ascending: false })

      if (error) {
        console.error("Error fetching customer operations:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ operations: operations || [] })
    }

    // Obtener todas las operaciones donde el cliente es pasajero
    const { data: operationCustomers } = await supabase
      .from("operation_customers")
      .select("operation_id")
      .eq("customer_id", customerId)

    if (!operationCustomers || operationCustomers.length === 0) {
      return NextResponse.json({ operations: [] })
    }

    const operationIds = operationCustomers.map((oc: any) => oc.operation_id)

    // Obtener las operaciones
    const { data: operations, error } = await supabase
      .from("operations")
      .select(`
        id,
        file_code,
        destination,
        departure_date,
        return_date,
        status,
        type
      `)
      .in("id", operationIds)
      .order("departure_date", { ascending: false })

    if (error) {
      console.error("Error fetching customer operations:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ operations: operations || [] })
  } catch (error: any) {
    console.error("Error in GET /api/customers/[id]/operations:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

