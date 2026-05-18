import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * Update local status of a lead.
 *
 * Cleanup 2026-05-08: removida sincronización con Trello (integración deprecada,
 * reemplazada por Manychat). El status del lead se mantiene solo en la BD local.
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // Cross-tenant fix (2026-05-18): no confiar en RLS; scopear explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient() as any
    const body = await request.json()
    const { leadId, status } = body

    if (!leadId) {
      return NextResponse.json({ error: "Falta leadId" }, { status: 400 })
    }

    if (status) {
      await supabase
        .from("leads")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", leadId)
        .eq("org_id", (user as any).org_id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error en update-status:", error)
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 })
  }
}
