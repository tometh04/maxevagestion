import { NextResponse } from "next/server"
import { canPerformAction } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"

// DELETE - Eliminar un retiro
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Gate por accounting.delete. Coincide con el "solo SUPER_ADMIN" anterior
    // (ADMIN y CONTABLE tienen delete: false) pero además habilita al ORG_OWNER
    // y respeta los overrides por agencia.
    const { user, supabase, matrix } = await getRequestPermissions()
    if (!canPerformAction(user, "accounting", "delete", matrix ?? undefined)) {
      return NextResponse.json({ error: "No autorizado para eliminar movimientos de socios" }, { status: 403 })
    }

    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const orgId = (user as any).org_id as string

    // Obtener el retiro con sus referencias. `partner_withdrawals` no tiene
    // org_id: el tenant se valida contra el socio, si no un id enumerable
    // permitiría borrar el movimiento de otra organización.
    const { data: withdrawal, error: fetchError } = await (supabase
      .from("partner_withdrawals") as any)
      .select("*, partner:partner_id(partner_name, org_id)")
      .eq("id", id)
      .single()

    if (fetchError || !withdrawal || withdrawal.partner?.org_id !== orgId) {
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
    const { error: deleteError } = await (supabase
      .from("partner_withdrawals") as any)
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
