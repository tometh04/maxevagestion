import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getAccountBalance } from "@/lib/accounting/ledger"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Get all financial accounts with agency info
    const { data: accounts, error: accountsError } = await (supabase.from("financial_accounts") as any)
      .select(`
        *,
        agencies:agency_id(id, name)
      `)
      .order("agency_id", { ascending: true })
      .order("type", { ascending: true })
      .order("currency", { ascending: true })

    if (accountsError) {
      console.error("Error fetching financial accounts:", accountsError)
      return NextResponse.json({ error: "Error al obtener cuentas financieras" }, { status: 500 })
    }

    // Calculate balance for each account
    const accountsWithBalance = await Promise.all(
      (accounts || []).map(async (account: any) => {
        try {
          const balance = await getAccountBalance(account.id, supabase)
          return {
            ...account,
            current_balance: balance,
          }
        } catch (error) {
          console.error(`Error calculating balance for account ${account.id}:`, error)
          return {
            ...account,
            current_balance: account.initial_balance || 0,
          }
        }
      })
    )

    return NextResponse.json({ accounts: accountsWithBalance })
  } catch (error) {
    console.error("Error in GET /api/accounting/financial-accounts:", error)
    return NextResponse.json({ error: "Error al obtener cuentas financieras" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos
    if (user.role !== "SUPER_ADMIN" && user.role !== "CONTABLE") {
      return NextResponse.json({ error: "No tiene permiso para crear cuentas" }, { status: 403 })
    }

    const body = await request.json()
    const {
      name,
      type,
      currency,
      agency_id,
      initial_balance,
      account_number,
      bank_name,
      card_number,
      card_holder,
      card_expiry_date,
      asset_type,
      asset_description,
      asset_quantity,
      notes,
      is_active,
    } = body

    // Validar campos requeridos
    if (!name || !type || !currency || !agency_id) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Validar tipo
    const validTypes = [
      "SAVINGS_ARS",
      "SAVINGS_USD",
      "CHECKING_ARS",
      "CHECKING_USD",
      "CASH_ARS",
      "CASH_USD",
      "CREDIT_CARD",
      "ASSETS",
    ]
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Tipo de cuenta inválido" }, { status: 400 })
    }

    // Preparar datos para inserción
    const accountData: any = {
      name,
      type,
      currency,
      agency_id,
      initial_balance: Number(initial_balance) || 0,
      notes: notes || null,
      is_active: is_active !== undefined ? is_active : true,
      created_by: user.id,
    }

    // Campos opcionales según tipo
    if (account_number) accountData.account_number = account_number
    if (bank_name) accountData.bank_name = bank_name
    if (card_number) accountData.card_number = card_number.slice(-4) // Solo últimos 4 dígitos
    if (card_holder) accountData.card_holder = card_holder
    if (card_expiry_date) accountData.card_expiry_date = card_expiry_date
    if (asset_type) accountData.asset_type = asset_type
    if (asset_description) accountData.asset_description = asset_description
    if (asset_quantity !== undefined) accountData.asset_quantity = Number(asset_quantity) || 0

    const { data: account, error: insertError } = await (supabase.from("financial_accounts") as any)
      .insert(accountData)
      .select()
      .single()

    if (insertError) {
      console.error("Error creating financial account:", insertError)
      return NextResponse.json({ error: "Error al crear cuenta: " + insertError.message }, { status: 500 })
    }

    return NextResponse.json({ account }, { status: 201 })
  } catch (error: any) {
    console.error("Error in POST /api/accounting/financial-accounts:", error)
    return NextResponse.json({ error: "Error al crear cuenta" }, { status: 500 })
  }
}

