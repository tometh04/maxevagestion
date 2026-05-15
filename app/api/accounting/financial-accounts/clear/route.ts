import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function DELETE(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // Solo SUPER_ADMIN puede borrar todas las cajas
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "No autorizado. Solo SUPER_ADMIN puede limpiar todas las cuentas." }, { status: 403 })
    }

    // ⚠️ Bug fix 2026-05-15 (P0 CATASTRÓFICO cross-tenant):
    // El DELETE viejo hacía .neq("id", "00...0") → borraba TODAS las cuentas
    // del sistema, de TODOS los tenants. Cualquier SUPER_ADMIN (= owner de
    // su org en el modelo SaaS) podía borrar las cuentas de otros tenants.
    //
    // Fix: scopear estrictamente por org_id del user. Sin org_id, rechazar.
    const userOrgId = (user as any).org_id as string | null
    if (!userOrgId) {
      return NextResponse.json({ error: "User sin org_id — operación no permitida" }, { status: 403 })
    }

    const supabase = await createServerClient()

    // Verificar que no haya movimientos de ledger asociados a cuentas de ESTA org
    const { data: orgAccounts } = await (supabase.from("financial_accounts") as any)
      .select("id")
      .eq("org_id", userOrgId)
    const orgAccountIds = (orgAccounts || []).map((a: any) => a.id)

    if (orgAccountIds.length === 0) {
      return NextResponse.json({ success: true, message: "No hay cuentas para eliminar en esta organización." })
    }

    const { data: movements, error: movementsError } = await (supabase.from("ledger_movements") as any)
      .select("account_id")
      .in("account_id", orgAccountIds)
      .limit(1)

    if (movementsError) {
      console.error("Error checking ledger movements:", movementsError)
    }

    if (movements && movements.length > 0) {
      return NextResponse.json({
        error: "No se pueden eliminar las cuentas porque hay movimientos contables asociados. Contacte al administrador del sistema."
      }, { status: 400 })
    }

    // Eliminar SOLO las cuentas de la org del user
    const { error: deleteError } = await (supabase.from("financial_accounts") as any)
      .delete()
      .eq("org_id", userOrgId)

    if (deleteError) {
      console.error("Error deleting financial accounts:", deleteError)
      return NextResponse.json({ error: "Error al eliminar cuentas" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Cuentas financieras de la organización eliminadas." })
  } catch (error: any) {
    console.error("Error in DELETE /api/accounting/financial-accounts/clear:", error)
    return NextResponse.json({ error: "Error al eliminar cuentas: " + error.message }, { status: 500 })
  }
}

