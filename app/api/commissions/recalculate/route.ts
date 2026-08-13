import { NextResponse } from "next/server"
import { processCommissionsForOperations } from "@/lib/commissions/calculate"
import { canPerformAction } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"

export async function POST() {
  try {
    const { user, supabase, matrix } = await getRequestPermissions()

    // Gate por commissions.write (matrix por agencia). El set previo
    // [ADMIN,SUPER_ADMIN] coincide con el default de commissions.write;
    // además ahora ORG_OWNER queda habilitado.
    if (!canPerformAction(user, "commissions", "write", matrix ?? undefined)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    // Bug fix 2026-05-15 (P0 cross-tenant): processCommissionsForOperations()
    // sin argumentos procesaba TODAS las operations del sistema, de TODOS los
    // tenants. Si Lozada Gualeguaychú clickeaba "recalcular", recalculaba
    // comisiones de Lozada Rosario también — potencial corrupción.
    //
    // El helper ahora exige orgId y filtra por su cuenta, así que el scope está
    // aplicado de los dos lados.
    const userOrgId = (user as any).org_id as string | null
    if (!userOrgId) {
      return NextResponse.json({ error: "User sin org_id — operación no permitida" }, { status: 403 })
    }

    const { data: orgOps } = await (supabase.from("operations") as any)
      .select("id")
      .eq("org_id", userOrgId)
    const orgOpIds = (orgOps || []).map((op: any) => op.id)

    if (orgOpIds.length === 0) {
      return NextResponse.json({ success: true, message: "No hay operaciones para recalcular en esta organización." })
    }

    await processCommissionsForOperations(orgOpIds, userOrgId)

    return NextResponse.json({ success: true, message: `Comisiones recalculadas para ${orgOpIds.length} operaciones de la organización.` })
  } catch (error) {
    console.error("Error recalculating commissions:", error)
    return NextResponse.json({ error: "Error al recalcular comisiones" }, { status: 500 })
  }
}
