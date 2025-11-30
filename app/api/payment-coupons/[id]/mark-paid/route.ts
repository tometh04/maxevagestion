import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

/**
 * Marca un cupón como pagado
 * Sincroniza con: Payments, Cash Movements, Cash Boxes
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "cash", "write")) {
      return NextResponse.json({ error: "No tiene permiso para marcar cupones como pagados" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { id } = await params
    const couponId = id
    const body = await request.json()

    const { payment_id, paid_date, payment_reference, cash_box_id } = body

    // Get coupon
    const { data: coupon } = await (supabase.from("payment_coupons") as any)
      .select("*")
      .eq("id", couponId)
      .single()

    if (!coupon) {
      return NextResponse.json({ error: "Cupón no encontrado" }, { status: 404 })
    }

    const coup = coupon as any

    if (coup.status === "PAID") {
      return NextResponse.json({ error: "Este cupón ya está marcado como pagado" }, { status: 400 })
    }

    // Update coupon
    const updateData: Record<string, any> = {
      status: "PAID",
      paid_date: paid_date || new Date().toISOString().split("T")[0],
      payment_reference: payment_reference || null,
      updated_at: new Date().toISOString(),
    }

    if (payment_id) {
      updateData.payment_id = payment_id
    }

    const { data: updatedCoupon, error: updateError } = await (supabase.from("payment_coupons") as any)
      .update(updateData)
      .eq("id", couponId)
      .select()
      .single()

    if (updateError) {
      console.error("Error updating coupon:", updateError)
      return NextResponse.json({ error: "Error al actualizar cupón" }, { status: 500 })
    }

    // Create cash movement if cash_box_id provided
    if (cash_box_id) {
      await (supabase.from("cash_movements") as any).insert({
        cash_box_id,
        operation_id: coup.operation_id,
        user_id: user.id,
        type: "INCOME",
        category: "COUPON_PAYMENT",
        amount: coup.amount,
        currency: coup.currency,
        movement_date: paid_date || new Date().toISOString(),
        notes: `Pago de cupón ${coup.coupon_number}`,
        is_touristic: true,
      })
    }

    return NextResponse.json({ coupon: updatedCoupon })
  } catch (error: any) {
    console.error("Error in POST /api/payment-coupons/[id]/mark-paid:", error)
    return NextResponse.json({ error: error.message || "Error al marcar cupón como pagado" }, { status: 500 })
  }
}

