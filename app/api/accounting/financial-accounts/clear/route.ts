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

    const supabase = await createServerClient()

    // Verificar que no haya movimientos de ledger asociados
    const { data: movements, error: movementsError } = await (supabase.from("ledger_movements") as any)
      .select("account_id")
      .not("account_id", "is", null)
      .limit(1)

    if (movementsError) {
      console.error("Error checking ledger movements:", movementsError)
    }

    if (movements && movements.length > 0) {
      return NextResponse.json({ 
        error: "No se pueden eliminar las cuentas porque hay movimientos contables asociados. Contacte al administrador del sistema." 
      }, { status: 400 })
    }

    // Eliminar todas las cuentas
    const { error: deleteError } = await (supabase.from("financial_accounts") as any)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000") // Borrar todo

    if (deleteError) {
      console.error("Error deleting financial accounts:", deleteError)
      return NextResponse.json({ error: "Error al eliminar cuentas" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Todas las cuentas financieras han sido eliminadas." })
  } catch (error: any) {
    console.error("Error in DELETE /api/accounting/financial-accounts/clear:", error)
    return NextResponse.json({ error: "Error al eliminar cuentas: " + error.message }, { status: 500 })
  }
}

