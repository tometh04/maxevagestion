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
    const supabase = await createServerClient()
    const { id } = await params
    const boxId = id

    const { data: cashBox, error } = await (supabase.from("cash_boxes") as any)
      .select(`
        *,
        agencies:agency_id(id, name)
      `)
      .eq("id", boxId)
      .single()

    if (error || !cashBox) {
      return NextResponse.json({ error: "Caja no encontrada" }, { status: 404 })
    }

    // Get recent movements for this box
    const { data: movements } = await supabase
      .from("cash_movements")
      .select("*")
      .eq("cash_box_id", boxId)
      .order("movement_date", { ascending: false })
      .limit(50)

    return NextResponse.json({
      cashBox,
      recentMovements: movements || [],
    })
  } catch (error: any) {
    console.error("Error in GET /api/cash-boxes/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al obtener caja" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "cash", "write")) {
      return NextResponse.json({ error: "No tiene permiso para actualizar cajas" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { id } = await params
    const boxId = id
    const body = await request.json()

    // Get current cash box
    const { data: currentBox } = await (supabase.from("cash_boxes") as any)
      .select("*")
      .eq("id", boxId)
      .single()

    if (!currentBox) {
      return NextResponse.json({ error: "Caja no encontrada" }, { status: 404 })
    }

    const curr = currentBox as any

    // If setting as default, unset other defaults
    if (body.is_default && !curr.is_default) {
      await (supabase.from("cash_boxes") as any)
        .update({ is_default: false })
        .eq("agency_id", curr.agency_id)
        .eq("is_default", true)
        .neq("id", boxId)
    }

    // Prepare update data
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    const allowedFields = [
      "name",
      "description",
      "box_type",
      "currency",
      "initial_balance",
      "is_active",
      "is_default",
      "notes",
    ]

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    })

    // Recalculate balance if initial_balance changed
    if (body.initial_balance !== undefined) {
      // Trigger will recalculate current_balance
      updateData.current_balance = body.initial_balance
    }

    const { data: cashBox, error } = await (supabase.from("cash_boxes") as any)
      .update(updateData)
      .eq("id", boxId)
      .select()
      .single()

    if (error) {
      console.error("Error updating cash box:", error)
      return NextResponse.json({ error: "Error al actualizar caja" }, { status: 500 })
    }

    return NextResponse.json({ cashBox })
  } catch (error: any) {
    console.error("Error in PATCH /api/cash-boxes/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al actualizar caja" }, { status: 500 })
  }
}

