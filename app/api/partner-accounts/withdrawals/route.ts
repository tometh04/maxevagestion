import { NextResponse } from "next/server"
import { canPerformAction } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  validateSufficientBalance,
} from "@/lib/accounting/ledger"
import {
  getExchangeRate,
  getLatestExchangeRate,
  getExchangeRateWithFallback,
} from "@/lib/accounting/exchange-rates"

// GET - Obtener retiros (opcionalmente filtrados por socio)
export async function GET(request: Request) {
  try {
    // Gate por accounting.read (matriz dinámica por agencia). El set previo
    // [SUPER_ADMIN, ADMIN, CONTABLE] hardcodeado ignoraba ORG_OWNER (el owner
    // del tenant) y los roles adicionales del usuario.
    const { user, supabase, matrix } = await getRequestPermissions()
    if (!canPerformAction(user, "accounting", "read", matrix ?? undefined)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const orgId = (user as any).org_id as string

    const { searchParams } = new URL(request.url)
    const partnerId = searchParams.get("partnerId")
    const agencyId = searchParams.get("agencyId")

    // `partner_withdrawals` no tiene org_id: el tenant se resuelve por el socio.
    // Sin esto la tabla quedaba sin filtro explícito de organización.
    const { data: orgPartners, error: orgPartnersError } = await (supabase
      .from("partner_accounts") as any)
      .select("id")
      .eq("org_id", orgId)

    if (orgPartnersError) {
      console.error("Error fetching org partners:", orgPartnersError)
      return NextResponse.json({ error: "Error al obtener retiros" }, { status: 500 })
    }

    const orgPartnerIds = (orgPartners || []).map((p: any) => p.id)
    if (orgPartnerIds.length === 0) {
      return NextResponse.json({ withdrawals: [] })
    }
    if (partnerId && !orgPartnerIds.includes(partnerId)) {
      return NextResponse.json({ withdrawals: [] })
    }

    let query = (supabase
      .from("partner_withdrawals") as any)
      .select(`
        *,
        partner:partner_id(id, partner_name),
        account:account_id(id, name, currency, agency_id),
        created_by_user:created_by(id, name)
      `)
      .in("partner_id", partnerId ? [partnerId] : orgPartnerIds)
      .order("withdrawal_date", { ascending: false })

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
    // Gate por accounting.write. Antes exigía user.role ∈ [SUPER_ADMIN,
    // CONTABLE]: dejaba afuera al ORG_OWNER (el dueño del tenant) y al ADMIN
    // que sí administra la caja, y encima miraba solo el rol principal, así que
    // un usuario con CONTABLE como rol adicional también quedaba bloqueado.
    const { user, supabase, matrix } = await getRequestPermissions()
    if (!canPerformAction(user, "accounting", "write", matrix ?? undefined)) {
      return NextResponse.json({ error: "No autorizado para registrar movimientos de socios" }, { status: 403 })
    }

    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const orgId = (user as any).org_id as string

    const body = await request.json()

    const { partner_id, amount, currency, withdrawal_date, account_id, description, exchange_rate, movement_type = "WITHDRAWAL" } = body

    // Validar movement_type
    if (!["WITHDRAWAL", "DEPOSIT"].includes(movement_type)) {
      return NextResponse.json({ error: "Tipo de movimiento debe ser WITHDRAWAL o DEPOSIT" }, { status: 400 })
    }

    const isDeposit = movement_type === "DEPOSIT"

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

    // Verificar que el socio existe y es del tenant del usuario
    const { data: partner, error: partnerError } = await (supabase
      .from("partner_accounts") as any)
      .select("id, partner_name")
      .eq("id", partner_id)
      .eq("org_id", orgId)
      .single()

    if (partnerError || !partner) {
      return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 })
    }

    // Verificar que la cuenta financiera existe, es del tenant, y obtener su
    // tipo para el método de pago
    const { data: account, error: accountError } = await (supabase
      .from("financial_accounts") as any)
      .select("id, name, currency, type, agency_id")
      .eq("id", account_id)
      .eq("org_id", orgId)
      .single()

    if (accountError || !account) {
      console.error("Error fetching financial account:", accountError)
      return NextResponse.json({ error: "Cuenta financiera no encontrada" }, { status: 404 })
    }

    // Validar tipo de cambio si la moneda del retiro es diferente a la de la cuenta
    const accountCurrency = account.currency as "ARS" | "USD"
    const needsConversion = currency !== accountCurrency
    
    if (needsConversion && !exchange_rate) {
      return NextResponse.json(
        { error: "Tipo de cambio requerido para convertir entre monedas diferentes" },
        { status: 400 }
      )
    }



    // Determinar método de pago según el tipo de cuenta financiera
    // Los tipos de cuenta son: CASH_ARS, CASH_USD, CHECKING_ARS, CHECKING_USD, etc.
    let paymentMethod: "CASH" | "BANK" | "MP" | "USD" | "OTHER" = "OTHER"
    if (account.type === "CASH_ARS" || account.type === "CASH_USD") {
      paymentMethod = "CASH"
    } else if (account.type === "CHECKING_ARS" || account.type === "CHECKING_USD") {
      paymentMethod = "BANK"
    } else if (account.type === "CREDIT_CARD") {
      paymentMethod = "MP"
    } else if (account.type === "SAVINGS_USD" || account.type === "SAVINGS_ARS") {
      paymentMethod = "USD"
    }

    // Calcular exchange rate
    let exchangeRate: number | null = null
    let withdrawalAmountInAccountCurrency = parseFloat(amount)

    if (needsConversion && exchange_rate) {
      // Usar el tipo de cambio proporcionado por el usuario
      exchangeRate = exchange_rate
      
      // Calcular el monto en la moneda de la cuenta
      if (currency === "ARS" && accountCurrency === "USD") {
        // Retiro en ARS desde cuenta USD: dividir por TC
        withdrawalAmountInAccountCurrency = parseFloat(amount) / exchange_rate
      } else if (currency === "USD" && accountCurrency === "ARS") {
        // Retiro en USD desde cuenta ARS: multiplicar por TC
        withdrawalAmountInAccountCurrency = parseFloat(amount) * exchange_rate
      }
    } else if (currency === "USD" && !needsConversion) {
      // Si el retiro es en USD y la cuenta también es USD, obtener TC para cálculo ARS equivalente
      const rateDate = new Date(withdrawal_date)
      const rateResult = await getExchangeRateWithFallback(supabase, rateDate, "partner-withdrawals")
      exchangeRate = rateResult.rate
    }

    // Calcular amount_ars_equivalent
    const amountARS = calculateARSEquivalent(
      withdrawalAmountInAccountCurrency,
      accountCurrency,
      exchangeRate
    )

    // Validar saldo suficiente solo para retiros de cuentas físicas (no para PARTNER).
    // Las cuentas PARTNER representan deuda con el socio y pueden quedar en negativo
    // legítimamente (ej: se pagó más de lo que prestó).
    if (!isDeposit && account.type !== "PARTNER") {
      const balanceCheck = await validateSufficientBalance(
        account_id,
        withdrawalAmountInAccountCurrency,
        accountCurrency,
        supabase
      )

      if (!balanceCheck.valid) {
        return NextResponse.json(
          { error: balanceCheck.error || "Saldo insuficiente en cuenta para realizar el retiro" },
          { status: 400 }
        )
      }
    }

    // Crear movimiento en ledger usando la función centralizada
    // IMPORTANTE: Usar la moneda de la cuenta, no la del retiro
    // Para aportes: INCOME (ingresa dinero a la cuenta)
    // Para retiros: EXPENSE (sale dinero de la cuenta)
    const ledgerType = isDeposit ? "INCOME" : "EXPENSE"
    const conceptPrefix = isDeposit ? "Aporte socio" : "Retiro socio"
    const { id: ledgerMovementId } = await createLedgerMovement(
      {
        operation_id: null,
        lead_id: null,
        type: ledgerType,
        concept: `${conceptPrefix}: ${partner.partner_name}${description ? ` - ${description}` : ""}`,
        currency: accountCurrency, // Usar moneda de la cuenta
        amount_original: withdrawalAmountInAccountCurrency, // Monto en moneda de la cuenta
        exchange_rate: exchangeRate,
        amount_ars_equivalent: amountARS,
        method: paymentMethod, // Método según tipo de cuenta financiera (CASH, BANK, MP, USD)
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
        movement_type: movement_type,
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

