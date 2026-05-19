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

    // Cross-tenant fix (2026-05-18): no confiar en RLS; scopear explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const { id: customerId } = await params
    const supabase = await createServerClient()

    // Verificar que el cliente pertenece al org del user
    const { data: customerCheck } = await (supabase.from("customers") as any)
      .select("id")
      .eq("id", customerId)
      .eq("org_id", (user as any).org_id)
      .single()
    if (!customerCheck) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    }

    // Si es SELLER con ownDataOnly, verificar que el cliente pertenece a sus operaciones
    if (isOwnDataOnly(user.role as any, "customers")) {
      const { data: sellerOps } = await (supabase.from("operations") as any)
        .select("id")
        .eq("org_id", (user as any).org_id)
        .or(`seller_primary_id.eq.${user.id},seller_secondary_id.eq.${user.id}`)

      const sellerOpIds = (sellerOps || []).map((op: any) => op.id)

      if (sellerOpIds.length === 0) {
        return NextResponse.json({ operations: [] })
      }

      // Verificar que el cliente está en alguna operación del seller
      const { data: customerInSellerOps } = await (supabase.from("operation_customers") as any)
        .select("operation_id")
        .eq("customer_id", customerId)
        .eq("org_id", (user as any).org_id)
        .in("operation_id", sellerOpIds)

      if (!customerInSellerOps || customerInSellerOps.length === 0) {
        return NextResponse.json({ error: "No tiene permiso para ver este cliente" }, { status: 403 })
      }

      // Solo devolver operaciones del seller
      const filteredOpIds = customerInSellerOps.map((oc: any) => oc.operation_id)

      const { data: operations, error } = await (supabase.from("operations") as any)
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
        .eq("org_id", (user as any).org_id)
        .order("departure_date", { ascending: false })

      if (error) {
        console.error("Error fetching customer operations:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ operations: operations || [] })
    }

    // Obtener todas las operaciones donde el cliente es pasajero (scopeado por org)
    const { data: operationCustomers } = await (supabase.from("operation_customers") as any)
      .select("operation_id")
      .eq("customer_id", customerId)
      .eq("org_id", (user as any).org_id)

    if (!operationCustomers || operationCustomers.length === 0) {
      return NextResponse.json({ operations: [] })
    }

    const operationIds = operationCustomers.map((oc: any) => oc.operation_id)

    // Obtener las operaciones (scopeado por org)
    const { data: operations, error } = await (supabase.from("operations") as any)
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
      .eq("org_id", (user as any).org_id)
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

