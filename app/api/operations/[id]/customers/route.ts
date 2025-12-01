import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: operationId } = await params
    const supabase = await createServerClient()

    const { data, error } = await supabase
      .from("operation_customers")
      .select(`
        id,
        operation_id,
        customer_id,
        role,
        customers (
          id,
          first_name,
          last_name,
          email,
          phone
        )
      `)
      .eq("operation_id", operationId)

    if (error) {
      console.error("Error fetching operation customers:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ customers: data || [] })
  } catch (error: any) {
    console.error("Error in GET /api/operations/[id]/customers:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    
    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { id: operationId } = await params
    const supabase = await createServerClient()
    const body = await request.json()

    const { customer_id, role } = body

    if (!customer_id) {
      return NextResponse.json({ error: "customer_id es requerido" }, { status: 400 })
    }

    // Verificar que no exista ya
    const { data: existing } = await (supabase.from("operation_customers") as any)
      .select("id")
      .eq("operation_id", operationId)
      .eq("customer_id", customer_id)
      .single()

    if (existing) {
      return NextResponse.json({ error: "El cliente ya está en esta operación" }, { status: 400 })
    }

    // Si el rol es MAIN, verificar que no exista otro MAIN
    if (role === "MAIN") {
      const { data: existingMain } = await (supabase.from("operation_customers") as any)
        .select("id")
        .eq("operation_id", operationId)
        .eq("role", "MAIN")
        .single()

      if (existingMain) {
        return NextResponse.json({ error: "Ya existe un pasajero principal" }, { status: 400 })
      }
    }

    // Insertar
    const { data, error } = await (supabase.from("operation_customers") as any)
      .insert({
        operation_id: operationId,
        customer_id,
        role: role || "COMPANION",
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating operation customer:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ operationCustomer: data }, { status: 201 })
  } catch (error: any) {
    console.error("Error in POST /api/operations/[id]/customers:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

