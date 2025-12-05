import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

// GET - Obtener todas las cuentas de socios
export async function GET() {
  try {
    const { user } = await getCurrentUser()
    
    // Solo SUPER_ADMIN y CONTABLE pueden ver cuentas de socios
    if (!["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()

    // Obtener socios con sus retiros
    const { data: partners, error } = await supabase
      .from("partner_accounts")
      .select(`
        *,
        users:user_id(id, name, email),
        partner_withdrawals(
          id,
          amount,
          currency,
          withdrawal_date,
          description
        )
      `)
      .eq("is_active", true)
      .order("partner_name", { ascending: true })

    if (error) {
      console.error("Error fetching partner accounts:", error)
      return NextResponse.json({ error: "Error al obtener cuentas de socios" }, { status: 500 })
    }

    // Calcular balances por socio
    const partnersWithBalance = (partners || []).map((partner: any) => {
      const withdrawals = partner.partner_withdrawals || []
      
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

    const { data: partner, error } = await supabase
      .from("partner_accounts")
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

