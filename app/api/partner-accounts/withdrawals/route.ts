import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  createLedgerMovement,
  calculateARSEquivalent,
} from "@/lib/accounting/ledger"
import {
  getExchangeRate,
  getLatestExchangeRate,
} from "@/lib/accounting/exchange-rates"

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
    const agencyId = searchParams.get("agencyId")

    let query = (supabase
      .from("partner_withdrawals") as any)
      .select(`
        *,
        partner:partner_id(id, partner_name),
        account:account_id(id, name, currency, agency_id),
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

    // Filtrar por agencia si se especifica
    let filteredWithdrawals = withdrawals || []
    if (agencyId && agencyId !== "ALL") {
      filteredWithdrawals = filteredWithdrawals.filter((w: any) => {
        const account = w.account
        return account && account.agency_id === agencyId
      })
    }

    return NextResponse.json({ withdrawals: filteredWithdrawals })
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
    if (!account_id) {
      return NextResponse.json({ error: "Cuenta financiera es requerida. Debe seleccionar de qué cuenta se realiza el retiro." }, { status: 400 })
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

    // Verificar que la cuenta financiera existe
    const { data: account, error: accountError } = await (supabase
      .from("financial_accounts") as any)
      .select("id, currency")
      .eq("id", account_id)
        .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Cuenta financiera no encontrada" }, { status: 404 })
    }

    // Calcular exchange rate si es USD
    let exchangeRate: number | null = null
    if (currency === "USD") {
      const rateDate = new Date(withdrawal_date)
      exchangeRate = await getExchangeRate(supabase, rateDate)
      
      // Si no hay tasa para esa fecha, usar la más reciente disponible
      if (!exchangeRate) {
        exchangeRate = await getLatestExchangeRate(supabase)
      }
      
      // Fallback: si aún no hay tasa, usar 1000 como último recurso
      if (!exchangeRate) {
        console.warn(`No exchange rate found for ${rateDate.toISOString()}, using fallback 1000`)
        exchangeRate = 1000
      }
    }

    // Calcular amount_ars_equivalent
    const amountARS = calculateARSEquivalent(
      parseFloat(amount),
      currency as "ARS" | "USD",
      exchangeRate
    )

    // Crear movimiento en ledger usando la función centralizada
    const { id: ledgerMovementId } = await createLedgerMovement(
      {
        operation_id: null,
        lead_id: null,
        type: "EXPENSE",
        concept: `Retiro socio: ${partner.partner_name}${description ? ` - ${description}` : ""}`,
        currency: currency as "ARS" | "USD",
        amount_original: parseFloat(amount),
        exchange_rate: currency === "USD" ? exchangeRate : null,
        amount_ars_equivalent: amountARS,
        method: "CASH", // Por defecto, se puede ajustar si se agrega campo de método
        account_id: account_id,
        seller_id: null,
        operator_id: null,
        receipt_number: null,
        notes: description || null,
        created_by: user.id,
      },
      supabase
    )

    // Crear el retiro
    const { data: withdrawal, error: withdrawalError } = await (supabase
      .from("partner_withdrawals") as any)
      .insert({
        partner_id,
        amount,
        currency,
        withdrawal_date,
        account_id: account_id,
        cash_movement_id: null, // Ya no se usa cash_movements, todo va por ledger
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

