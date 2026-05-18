import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    // Cross-tenant fix (2026-05-18): no confiar en RLS; scopear explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { id } = await params

    const { data: alert, error } = await (supabase.from("alerts") as any)
      .select(`
        *,
        operations:operation_id (id, destination, departure_date),
        users:user_id (id, name)
      `)
      .eq("id", id)
      .eq("org_id", (user as any).org_id)
      .single()

    if (error || !alert) {
      return NextResponse.json({ error: "Alerta no encontrada" }, { status: 404 })
    }

    return NextResponse.json({ alert })
  } catch (error: any) {
    console.error("Error in GET /api/alerts/[id]:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    // Cross-tenant fix (2026-05-18): no confiar en RLS; scopear explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { id } = await params
    const body = await request.json()

    const updateData: any = {
      updated_at: new Date().toISOString(),
    }

    if (body.is_resolved !== undefined) {
      updateData.is_resolved = body.is_resolved
      if (body.is_resolved) {
        updateData.resolved_at = new Date().toISOString()
        updateData.resolved_by = user.id
      }
    }

    const { data: alert, error } = await (supabase.from("alerts") as any)
      .update(updateData)
      .eq("id", id)
      .eq("org_id", (user as any).org_id)
      .select()
      .single()

    if (error) {
      console.error("Error updating alert:", error)
      return NextResponse.json({ error: "Error al actualizar alerta" }, { status: 500 })
    }

    return NextResponse.json({ success: true, alert })
  } catch (error: any) {
    console.error("Error in PATCH /api/alerts/[id]:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    // Cross-tenant fix (2026-05-18): no confiar en RLS; scopear explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { id } = await params

    const { error } = await (supabase.from("alerts") as any)
      .delete()
      .eq("id", id)
      .eq("org_id", (user as any).org_id)

    if (error) {
      console.error("Error deleting alert:", error)
      return NextResponse.json({ error: "Error al eliminar alerta" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/alerts/[id]:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

