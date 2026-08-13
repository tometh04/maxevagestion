import { NextResponse } from "next/server"
import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction } from "@/lib/permissions-api"

export const dynamic = "force-dynamic"

/**
 * Comisiones a referidores (VIB-62). Se gatea por el módulo propio `referrals`
 * (VIB-86): el vendedor que carga la venta no tiene que ver cuánto se lleva el
 * referidor. No toca caja ni contabilidad: es un registro/seguimiento propio.
 */

export async function GET(request: Request) {
  try {
    const { user, supabase, matrix } = await getRequestPermissions()

    if (!(user as any)?.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    // VIB-86: módulo propio. Antes se colgaba de `commissions` + ownDataOnly;
    // ahora el gate es el mismo que usa la pantalla de Referidos.
    if (!canPerformAction(user, "referrals", "read", matrix ?? undefined)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const partnerId = searchParams.get("partnerId")

    let query = (supabase.from("referral_commissions") as any)
      .select(`
        *,
        referral_partners:referral_partner_id(id, name),
        operations:operation_id(
          id,
          file_code,
          destination,
          departure_date,
          sale_amount_total,
          sale_currency
        ),
        customers:customer_id(id, first_name, last_name)
      `)
      .eq("org_id", (user as any).org_id)
      .order("date_calculated", { ascending: false })

    if (status && status !== "ALL") {
      query = query.eq("status", status)
    }
    if (partnerId && partnerId !== "ALL") {
      query = query.eq("referral_partner_id", partnerId)
    }

    const { data, error } = await query
    if (error) {
      console.error("Error listando referral_commissions:", error)
      return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }

    return NextResponse.json({ commissions: data ?? [] })
  } catch (error) {
    console.error("Error in GET /api/referral-commissions:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
