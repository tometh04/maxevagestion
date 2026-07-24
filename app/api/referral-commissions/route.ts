import { NextResponse } from "next/server"
import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction, isOwnDataOnlyResolved } from "@/lib/permissions-api"

export const dynamic = "force-dynamic"

/**
 * Comisiones a referidores (VIB-62). Superficie de finanzas: se gatea por el
 * módulo `commissions` y SOLO la ven quienes ven todas las comisiones (no un
 * vendedor limitado a "lo propio", porque las comisiones de referido no son de
 * un vendedor). No toca caja ni contabilidad: es un registro/seguimiento propio.
 */

export async function GET(request: Request) {
  try {
    const { user, supabase, matrix } = await getRequestPermissions()

    if (!(user as any)?.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const canViewAll =
      canPerformAction(user, "commissions", "read", matrix ?? undefined) &&
      !isOwnDataOnlyResolved(user, "commissions", matrix ?? undefined)

    if (!canViewAll) {
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
