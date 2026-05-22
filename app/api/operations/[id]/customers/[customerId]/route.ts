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

    // Cross-tenant fix (2026-05-18): validar que la operación sea del org del user.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const { data: opOwner } = await (supabase.from("operations") as any)
      .select("id")
      .eq("id", operationId)
      .eq("org_id", (user as any).org_id)
      .maybeSingle()
    if (!opOwner) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

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

    // Cross-tenant fix (2026-05-18): validar que la operación sea del org del user.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const { data: opOwner } = await (supabase.from("operations") as any)
      .select("id")
      .eq("id", operationId)
      .eq("org_id", (user as any).org_id)
      .maybeSingle()
    if (!opOwner) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    const updates: Record<string, unknown> = {}

    // role: MAIN o COMPANION
    if (typeof body.role === "string" && (body.role === "MAIN" || body.role === "COMPANION")) {
      updates.role = body.role
    }

    // expected_amount: monto que debe pagar este pasajero. null = even-split fallback
    // (mig 20260511000002). Bug Santi #b7fd7016: cada pasajero puede deber un monto distinto.
    if ("expected_amount" in body) {
      const raw = body.expected_amount
      if (raw === null || raw === "" || raw === undefined) {
        updates.expected_amount = null
      } else {
        const n = Number(raw)
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json(
            { error: "expected_amount debe ser un número >= 0 o null" },
            { status: 400 }
          )
        }
        updates.expected_amount = n
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 })
    }

    // Si el nuevo rol es MAIN, verificar que no exista otro MAIN
    if (updates.role === "MAIN") {
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
      .update(updates)
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

