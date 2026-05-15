import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { processCommissionsForOperations } from "@/lib/commissions/calculate"

export async function POST() {
  try {
    const { user } = await getCurrentUser()

    // Only admins can trigger recalculation
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    // Bug fix 2026-05-15 (P0 cross-tenant): processCommissionsForOperations()
    // sin argumentos procesa TODAS las operations del sistema, de TODOS los
    // tenants. Si Lozada Gualeguaychú clickeaba "recalcular", recalculaba
    // comisiones de Lozada Rosario también — potencial corrupción.
    //
    // Fix: primero traer SOLO las operations de la org del user, después
    // pasar sus IDs al helper para que filtre.
    const userOrgId = (user as any).org_id as string | null
    if (!userOrgId) {
      return NextResponse.json({ error: "User sin org_id — operación no permitida" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { data: orgOps } = await (supabase.from("operations") as any)
      .select("id")
      .eq("org_id", userOrgId)
    const orgOpIds = (orgOps || []).map((op: any) => op.id)

    if (orgOpIds.length === 0) {
      return NextResponse.json({ success: true, message: "No hay operaciones para recalcular en esta organización." })
    }

    await processCommissionsForOperations(orgOpIds)

    return NextResponse.json({ success: true, message: `Comisiones recalculadas para ${orgOpIds.length} operaciones de la organización.` })
  } catch (error) {
    console.error("Error recalculating commissions:", error)
    return NextResponse.json({ error: "Error al recalcular comisiones" }, { status: 500 })
  }
}
