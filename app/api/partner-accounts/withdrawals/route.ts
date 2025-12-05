import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

// GET - Obtener retiros (opcionalmente filtrados por socio)
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    if (!["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const partnerId = searchParams.get("partnerId")

    let query = (supabase
      .from("partner_withdrawals") as any)
      .select(`
        *,
        partner:partner_id(id, partner_name),
        account:account_id(id, name, currency),
        created_by_user:created_by(id, name)
      `)
      .order("withdrawal_date", { ascending: false })

    if (partnerId) {
      query = query.eq("partner_id", partnerId)
    }

    const { data: withdrawals, error } = await query

    if (error) {
      console.error("Error fetching withdrawals:", error)
      return NextResponse.json({ error: "Error al obtener retiros" }, { status: 500 })
    }

    return NextResponse.json({ withdrawals: withdrawals || [] })
  } catch (error) {
    console.error("Error in GET /api/partner-accounts/withdrawals:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// POST - Registrar un nuevo retiro
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Solo SUPER_ADMIN y CONTABLE pueden registrar retiros
    if (!["SUPER_ADMIN", "CONTABLE"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado para registrar retiros" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const { partner_id, amount, currency, withdrawal_date, account_id, description } = body

    // Validaciones
    if (!partner_id) {
      return NextResponse.json({ error: "Socio es requerido" }, { status: 400 })
    }
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Monto debe ser mayor a 0" }, { status: 400 })
    }
    if (!currency || !["ARS", "USD"].includes(currency)) {
      return NextResponse.json({ error: "Moneda debe ser ARS o USD" }, { status: 400 })
    }
    if (!withdrawal_date) {
      return NextResponse.json({ error: "Fecha es requerida" }, { status: 400 })
    }

    // Verificar que el socio existe
    const { data: partner, error: partnerError } = await (supabase
      .from("partner_accounts") as any)
      .select("id, partner_name")
      .eq("id", partner_id)
      .single()

    if (partnerError || !partner) {
      return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 })
    }

    // Crear movimiento de caja (egreso)
    let cashMovementId = null
    if (account_id) {
      const { data: cashMovement, error: cashError } = await supabase
        .from("cash_movements")
        .insert({
          user_id: user.id,
          type: "EXPENSE",
          category: "RETIRO_SOCIO",
          amount: amount,
          currency: currency,
          movement_date: new Date(withdrawal_date).toISOString(),
          notes: `Retiro de ${partner.partner_name}${description ? `: ${description}` : ""}`,
        })
        .select("id")
        .single()

      if (!cashError && cashMovement) {
        cashMovementId = cashMovement.id
      }
    }

    // Crear movimiento en ledger
    const { data: ledgerMovement, error: ledgerError } = await supabase
      .from("ledger_movements")
      .insert({
        account_id: account_id || null,
        type: "EXPENSE",
        amount: amount,
        currency: currency,
        description: `Retiro socio: ${partner.partner_name}${description ? ` - ${description}` : ""}`,
        movement_date: new Date(withdrawal_date).toISOString(),
        created_by: user.id,
      })
      .select("id")
      .single()

    let ledgerMovementId = null
    if (!ledgerError && ledgerMovement) {
      ledgerMovementId = ledgerMovement.id
    }

    // Crear el retiro
    const { data: withdrawal, error: withdrawalError } = await (supabase
      .from("partner_withdrawals") as any)
      .insert({
        partner_id,
        amount,
        currency,
        withdrawal_date,
        account_id: account_id || null,
        cash_movement_id: cashMovementId,
        ledger_movement_id: ledgerMovementId,
        description: description || null,
        created_by: user.id,
      })
      .select(`
        *,
        partner:partner_id(id, partner_name)
      `)
      .single()

    if (withdrawalError) {
      console.error("Error creating withdrawal:", withdrawalError)
      return NextResponse.json({ error: "Error al registrar retiro" }, { status: 500 })
    }

    return NextResponse.json({ 
      withdrawal,
      message: `Retiro de ${currency} ${amount.toLocaleString()} registrado para ${partner.partner_name}`
    })
  } catch (error) {
    console.error("Error in POST /api/partner-accounts/withdrawals:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

