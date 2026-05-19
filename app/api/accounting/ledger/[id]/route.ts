import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { invalidateBalanceCache } from "@/lib/accounting/ledger"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!canPerformAction(user, "accounting", "write") && !canPerformAction(user, "cash", "write")) {
      return NextResponse.json({ error: "No tiene permiso para modificar movimientos contables" }, { status: 403 })
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: "ID de movimiento requerido" }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    if (typeof body.affects_balance !== "boolean") {
      return NextResponse.json({ error: "affects_balance debe ser boolean" }, { status: 400 })
    }

    // Cross-tenant fix (2026-05-18): RLS no protegía; scopear explícito por org.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const { data: movement, error: fetchError } = await (supabase.from("ledger_movements") as any)
      .select("id, account_id, affects_balance")
      .eq("id", id)
      .eq("org_id", (user as any).org_id)
      .single()

    if (fetchError || !movement) {
      return NextResponse.json({ error: "Movimiento contable no encontrado" }, { status: 404 })
    }

    const { data: updatedMovement, error: updateError } = await (supabase.from("ledger_movements") as any)
      .update({ affects_balance: body.affects_balance })
      .eq("id", id)
      .eq("org_id", (user as any).org_id)
      .select("id, account_id, affects_balance")
      .single()

    if (updateError) {
      console.error("Error updating ledger movement affects_balance:", updateError)
      return NextResponse.json({ error: "Error al actualizar movimiento contable" }, { status: 500 })
    }

    invalidateBalanceCache(updatedMovement.account_id)

    return NextResponse.json({
      movement: updatedMovement,
      message: body.affects_balance
        ? "El movimiento vuelve a afectar el saldo."
        : "El movimiento queda visible pero ya no afecta el saldo.",
    })
  } catch (error) {
    console.error("PATCH /api/accounting/ledger/[id]:", error)
    return NextResponse.json({ error: "Error al actualizar movimiento contable" }, { status: 500 })
  }
}
