import { NextResponse } from "next/server"
import { canPerformAction } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"

// GET - Obtener todas las cuentas de socios
export async function GET(request: Request) {
  try {
    // Gate por accounting.read (matriz dinámica por agencia). El set previo
    // [SUPER_ADMIN, ADMIN, CONTABLE] hardcodeado ignoraba ORG_OWNER (el owner
    // del tenant) y los roles adicionales del usuario.
    const { user, supabase, matrix } = await getRequestPermissions()
    if (!canPerformAction(user, "accounting", "read", matrix ?? undefined)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    // Cross-tenant: exigir org_id y filtrar explícito, sin depender solo de RLS.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const orgId = (user as any).org_id as string

    const { searchParams } = new URL(request.url)
    const agencyId = searchParams.get("agencyId")

    // Obtener socios con sus retiros
    let query = (supabase
      .from("partner_accounts") as any)
      .select(`
        *,
        users:user_id(id, name, email),
        partner_withdrawals(
          id,
          amount,
          currency,
          withdrawal_date,
          description,
          account_id,
          financial_accounts:account_id(agency_id)
        )
      `)
      .eq("is_active", true)
      .eq("org_id", orgId)
      .order("partner_name", { ascending: true })

    const { data: partners, error } = await query

    if (error) {
      console.error("Error fetching partner accounts:", error)
      return NextResponse.json({ error: "Error al obtener cuentas de socios" }, { status: 500 })
    }

    // Calcular balances por socio
    let partnersWithBalance = (partners || []).map((partner: any) => {
      let withdrawals = partner.partner_withdrawals || []

      // Filtrar retiros por agencia si se especifica
      if (agencyId && agencyId !== "ALL") {
        withdrawals = withdrawals.filter((w: any) => {
          const account = w.financial_accounts
          return account && account.agency_id === agencyId
        })
      }

      const totalARS = withdrawals
        .filter((w: any) => w.currency === "ARS")
        .reduce((sum: number, w: any) => sum + Number(w.amount), 0)

      const totalUSD = withdrawals
        .filter((w: any) => w.currency === "USD")
        .reduce((sum: number, w: any) => sum + Number(w.amount), 0)

      return {
        ...partner,
        total_withdrawn_ars: totalARS,
        total_withdrawn_usd: totalUSD,
        withdrawals_count: withdrawals.length,
      }
    })

    // Si se filtra por agencia, solo mostrar socios que tengan retiros de esa agencia
    if (agencyId && agencyId !== "ALL") {
      partnersWithBalance = partnersWithBalance.filter((p: any) => p.withdrawals_count > 0)
    }

    return NextResponse.json({ partners: partnersWithBalance })
  } catch (error) {
    console.error("Error in GET /api/partner-accounts:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// POST - Crear nuevo socio
export async function POST(request: Request) {
  try {
    const { user, supabase, matrix } = await getRequestPermissions()
    if (!canPerformAction(user, "accounting", "write", matrix ?? undefined)) {
      return NextResponse.json({ error: "No autorizado para crear socios" }, { status: 403 })
    }

    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const orgId = (user as any).org_id as string

    const body = await request.json()

    const { partner_name, user_id, notes, profit_percentage } = body

    if (!partner_name || !partner_name.trim()) {
      return NextResponse.json({ error: "El nombre del socio es requerido" }, { status: 400 })
    }

    // Limpiar y validar nombre
    const cleanedName = partner_name.trim()

    // Validar porcentaje si se proporciona
    let profitPercentage = profit_percentage ? parseFloat(profit_percentage) : 0
    if (profitPercentage < 0 || profitPercentage > 100) {
      return NextResponse.json({ error: "El porcentaje debe estar entre 0 y 100" }, { status: 400 })
    }

    // El socio puede vincularse a un usuario, que debe ser del mismo tenant.
    if (user_id) {
      const { data: linkedUser } = await (supabase.from("users") as any)
        .select("id")
        .eq("id", user_id)
        .eq("org_id", orgId)
        .maybeSingle()
      if (!linkedUser) {
        return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
      }
    }

    const { data: partner, error } = await (supabase
      .from("partner_accounts") as any)
      .insert({
        partner_name: cleanedName,
        user_id: user_id || null,
        notes: notes?.trim() || null,
        profit_percentage: profitPercentage,
        is_active: true,
        org_id: orgId,
      })
      .select()
      .single()

    if (error) {
      console.error("[PartnerAccounts API] Error creating partner account:", error)
      console.error("[PartnerAccounts API] Error details:", JSON.stringify(error, null, 2))
      return NextResponse.json({
        error: `Error al crear cuenta de socio: ${error.message || "Error desconocido"}`,
        details: error.message
      }, { status: 500 })
    }

    return NextResponse.json({ partner })
  } catch (error: any) {
    console.error("[PartnerAccounts API] Exception in POST /api/partner-accounts:", error)
    console.error("[PartnerAccounts API] Stack trace:", error.stack)
    return NextResponse.json({
      error: `Error interno: ${error.message || "Error desconocido"}`,
      details: error.message
    }, { status: 500 })
  }
}
