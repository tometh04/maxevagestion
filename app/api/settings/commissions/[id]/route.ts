import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await getCurrentUser()

    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()
    const { id: ruleId } = await params

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (body.type !== undefined) updateData.type = body.type
    if (body.basis !== undefined) updateData.basis = body.basis
    if (body.value !== undefined) updateData.value = Number(body.value)
    if (body.destination_region !== undefined) updateData.destination_region = body.destination_region || null
    if (body.agency_id !== undefined) updateData.agency_id = body.agency_id || null
    if (body.valid_from !== undefined) updateData.valid_from = body.valid_from
    if (body.valid_to !== undefined) updateData.valid_to = body.valid_to || null

    const { data: rule, error } = await (supabase.from("commission_rules") as any)
      .update(updateData)
      .eq("id", ruleId)
      .select()
      .single()

    if (error) {
      console.error("Error updating commission rule:", error)
      return NextResponse.json({ error: "Error al actualizar regla de comisión" }, { status: 500 })
    }

    return NextResponse.json({ rule })
  } catch (error) {
    console.error("Error in PATCH /api/settings/commissions/[id]:", error)
    return NextResponse.json({ error: "Error al actualizar regla de comisión" }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await getCurrentUser()

    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { id: ruleId } = await params

    const { error } = await supabase.from("commission_rules").delete().eq("id", ruleId)

    if (error) {
      console.error("Error deleting commission rule:", error)
      return NextResponse.json({ error: "Error al eliminar regla de comisión" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/settings/commissions/[id]:", error)
    return NextResponse.json({ error: "Error al eliminar regla de comisión" }, { status: 500 })
  }
}

