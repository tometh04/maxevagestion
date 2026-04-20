import { NextResponse } from "next/server"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { invalidateBalanceCache } from "@/lib/accounting/ledger"

/**
 * DELETE /api/expenses/cc-payment/[id]
 * Delete a CC payment group and all its associated movements
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "accounting", "write") && !canPerformAction(user, "cash", "write")) {
      return NextResponse.json({ error: "No tiene permiso para eliminar pagos de tarjeta" }, { status: 403 })
    }

    const { id } = await params
    const supabase = await createServerClient()
    const adminDb = createAdminClient() as any

    // SaaS Pilar 2: fetch via server client — RLS filtra por org; si el
    // group pertenece a otra org, fetch falla y devolvemos 404.
    const { data: group, error: fetchError } = await (supabase.from("cc_payment_groups") as any)
      .select("id, source_account_id, org_id")
      .eq("id", id)
      .single()

    if (fetchError || !group) {
      return NextResponse.json({ error: "Pago de tarjeta no encontrado" }, { status: 404 })
    }

    // Get all cash_movements in this group (RLS acota)
    const { data: movements } = await (supabase.from("cash_movements") as any)
      .select("id, ledger_movement_id, financial_account_id")
      .eq("cc_payment_group_id", id)

    if (movements && movements.length > 0) {
      const movementIds = movements.map((m: any) => m.id)

      // Todos los deletes acotados por org_id validado (defensa-en-profundidad)
      let receiptsDelete = adminDb.from("expense_receipts").delete().in("cash_movement_id", movementIds)
      await receiptsDelete

      const ledgerIds = movements.map((m: any) => m.ledger_movement_id).filter(Boolean)
      if (ledgerIds.length > 0) {
        let lmDelete = adminDb.from("ledger_movements").delete().in("id", ledgerIds)
        if (group.org_id) lmDelete = lmDelete.eq("org_id", group.org_id)
        await lmDelete
      }

      let cmDelete = adminDb.from("cash_movements").delete().in("id", movementIds)
      if (group.org_id) cmDelete = cmDelete.eq("org_id", group.org_id)
      await cmDelete
    }

    // Delete the group itself (acotado por org_id validado)
    let groupDelete = adminDb.from("cc_payment_groups").delete().eq("id", id)
    if (group.org_id) groupDelete = groupDelete.eq("org_id", group.org_id)
    const { error: deleteError } = await groupDelete

    if (deleteError) {
      console.error("Error deleting cc_payment_group:", deleteError)
      return NextResponse.json({ error: "Error al eliminar pago de tarjeta" }, { status: 500 })
    }

    // Invalidate balance cache
    if (group.source_account_id) {
      await invalidateBalanceCache(group.source_account_id)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/expenses/cc-payment/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al eliminar" }, { status: 500 })
  }
}
