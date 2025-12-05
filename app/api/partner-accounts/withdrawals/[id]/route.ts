import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

// DELETE - Eliminar un retiro
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    
    // Solo SUPER_ADMIN puede eliminar retiros
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Solo el administrador puede eliminar retiros" }, { status: 403 })
    }

    const supabase = await createServerClient()

    // Obtener el retiro con sus referencias
    const { data: withdrawal, error: fetchError } = await supabase
      .from("partner_withdrawals")
      .select("*, partner:partner_id(partner_name)")
      .eq("id", id)
      .single()

    if (fetchError || !withdrawal) {
      return NextResponse.json({ error: "Retiro no encontrado" }, { status: 404 })
    }

    // Eliminar movimiento de caja asociado
    if (withdrawal.cash_movement_id) {
      await supabase
        .from("cash_movements")
        .delete()
        .eq("id", withdrawal.cash_movement_id)
    }

    // Eliminar movimiento de ledger asociado
    if (withdrawal.ledger_movement_id) {
      await supabase
        .from("ledger_movements")
        .delete()
        .eq("id", withdrawal.ledger_movement_id)
    }

    // Eliminar el retiro
    const { error: deleteError } = await supabase
      .from("partner_withdrawals")
      .delete()
      .eq("id", id)

    if (deleteError) {
      console.error("Error deleting withdrawal:", deleteError)
      return NextResponse.json({ error: "Error al eliminar retiro" }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      message: `Retiro de ${withdrawal.currency} ${withdrawal.amount} eliminado`
    })
  } catch (error) {
    console.error("Error in DELETE /api/partner-accounts/withdrawals/[id]:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

