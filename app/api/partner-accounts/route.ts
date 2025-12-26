import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

// GET - Obtener todas las cuentas de socios
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Solo SUPER_ADMIN y CONTABLE pueden ver cuentas de socios
    if (!["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
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
    const { user } = await getCurrentUser()
    
    // Solo SUPER_ADMIN puede crear socios
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Solo el administrador puede crear socios" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const { partner_name, user_id, notes } = body

    if (!partner_name) {
      return NextResponse.json({ error: "El nombre del socio es requerido" }, { status: 400 })
    }

    const { data: partner, error } = await (supabase
      .from("partner_accounts") as any)
      .insert({
        partner_name,
        user_id: user_id || null,
        notes: notes || null,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating partner account:", error)
      return NextResponse.json({ error: "Error al crear cuenta de socio" }, { status: 500 })
    }

    return NextResponse.json({ partner })
  } catch (error) {
    console.error("Error in POST /api/partner-accounts:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

