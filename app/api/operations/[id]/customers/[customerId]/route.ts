import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; customerId: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    
    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { id: operationId, customerId: operationCustomerId } = await params
    const supabase = await createServerClient()

    // Eliminar la relación
    const { error } = await (supabase.from("operation_customers") as any)
      .delete()
      .eq("id", operationCustomerId)
      .eq("operation_id", operationId)

    if (error) {
      console.error("Error deleting operation customer:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/operations/[id]/customers/[customerId]:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; customerId: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    
    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { id: operationId, customerId: operationCustomerId } = await params
    const supabase = await createServerClient()
    const body = await request.json()

    const { role } = body

    // Si el nuevo rol es MAIN, verificar que no exista otro MAIN
    if (role === "MAIN") {
      const { data: existingMain } = await (supabase.from("operation_customers") as any)
        .select("id")
        .eq("operation_id", operationId)
        .eq("role", "MAIN")
        .neq("id", operationCustomerId)
        .single()

      if (existingMain) {
        return NextResponse.json({ error: "Ya existe un pasajero principal" }, { status: 400 })
      }
    }

    // Actualizar
    const { data, error } = await (supabase.from("operation_customers") as any)
      .update({ role })
      .eq("id", operationCustomerId)
      .eq("operation_id", operationId)
      .select()
      .single()

    if (error) {
      console.error("Error updating operation customer:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ operationCustomer: data })
  } catch (error: any) {
    console.error("Error in PATCH /api/operations/[id]/customers/[customerId]:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

