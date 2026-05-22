import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // Cross-tenant fix (2026-05-18): no confiar en RLS; scopear explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const body = await request.json()
    const { alertId } = body

    if (!alertId) {
      return NextResponse.json({ error: "Falta alertId" }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {
      status: "DONE",
      updated_at: new Date().toISOString(),
    }

    // Direct update with type assertion to bypass TypeScript strict checking
    const alertsTable = supabase.from("alerts") as any
    const { error } = await alertsTable
      .update(updateData)
      .eq("id", alertId)
      .eq("org_id", (user as any).org_id)
    
    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating alert:", error)
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 })
  }
}
