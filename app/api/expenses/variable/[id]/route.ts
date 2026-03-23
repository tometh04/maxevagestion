import { NextResponse } from "next/server"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { invalidateBalanceCache } from "@/lib/accounting/ledger"

/**
 * PATCH /api/expenses/variable/[id]
 * Edit a variable expense (description, category, notes, date)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id } = await params
    const supabase = await createServerClient()
    const adminDb = createAdminClient() as any
    const body = await request.json()

    // Verify expense exists
    const { data: existing, error: fetchError } = await (supabase.from("cash_movements") as any)
      .select("id, type, financial_account_id, ledger_movement_id")
      .eq("id", id)
      .eq("type", "EXPENSE")
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 })
    }

    // Build update object (only allow safe fields to be edited)
    const updateData: Record<string, any> = {}
    if (body.category !== undefined) updateData.category = body.category
    if (body.category_id !== undefined) updateData.category_id = body.category_id
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.movement_date !== undefined) updateData.movement_date = body.movement_date

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 })
    }

    // Update cash_movement
    const { error: updateError } = await adminDb
      .from("cash_movements")
      .update(updateData)
      .eq("id", id)

    if (updateError) {
      console.error("Error updating expense:", updateError)
      return NextResponse.json({ error: "Error al actualizar gasto" }, { status: 500 })
    }

    // Also update ledger_movement concept if category changed
    if (body.category && existing.ledger_movement_id) {
      const concept = `Gasto: ${body.category}`
      await adminDb
        .from("ledger_movements")
        .update({ concept, notes: body.notes || null })
        .eq("id", existing.ledger_movement_id)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in PATCH /api/expenses/variable/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al actualizar" }, { status: 500 })
  }
}

/**
 * DELETE /api/expenses/variable/[id]
 * Delete a variable expense + its ledger movement + receipts
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id } = await params
    const supabase = await createServerClient()
    const adminDb = createAdminClient() as any

    // Verify expense exists
    const { data: existing, error: fetchError } = await (supabase.from("cash_movements") as any)
      .select("id, type, financial_account_id, ledger_movement_id")
      .eq("id", id)
      .eq("type", "EXPENSE")
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 })
    }

    // Delete receipts linked to this expense
    const { data: receipts } = await (supabase.from("expense_receipts") as any)
      .select("id, document_id")
      .eq("cash_movement_id", id)

    if (receipts && receipts.length > 0) {
      const docIds = receipts.map((r: any) => r.document_id).filter(Boolean)
      // Delete receipt bridge records
      await adminDb.from("expense_receipts").delete().eq("cash_movement_id", id)
      // Delete document records
      if (docIds.length > 0) {
        await adminDb.from("documents").delete().in("id", docIds)
      }
    }

    // Delete ledger movement if exists
    if (existing.ledger_movement_id) {
      await adminDb.from("ledger_movements").delete().eq("id", existing.ledger_movement_id)
    }

    // Delete the cash_movement
    const { error: deleteError } = await adminDb
      .from("cash_movements")
      .delete()
      .eq("id", id)

    if (deleteError) {
      console.error("Error deleting expense:", deleteError)
      return NextResponse.json({ error: "Error al eliminar gasto" }, { status: 500 })
    }

    // Invalidate balance cache for the financial account
    if (existing.financial_account_id) {
      await invalidateBalanceCache(existing.financial_account_id)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/expenses/variable/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al eliminar" }, { status: 500 })
  }
}
