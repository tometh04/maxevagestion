import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * GET /api/payments/detail
 *
 * Params:
 * - ledgerMovementId: ID directo del ledger_movement (preferido)
 * - operationId: ID de la operación (fallback para pagos parciales sin ledger_movement_id vinculado)
 *
 * Retorna info de la cuenta financiera usada para un pago,
 * incluyendo balance antes y después del movimiento.
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const ledgerMovementId = searchParams.get("ledgerMovementId")
    const operationId = searchParams.get("operationId")

    if (!ledgerMovementId && !operationId) {
      return NextResponse.json({ error: "ledgerMovementId o operationId es requerido" }, { status: 400 })
    }

    // 1. Encontrar el ledger_movement relevante
    let movement: any = null

    if (ledgerMovementId) {
      // Búsqueda directa por ID
      const { data, error } = await (supabase
        .from("ledger_movements") as any)
        .select(`
          id, created_at, type, amount_original, amount_ars_equivalent,
          currency, method, receipt_number, notes, account_id,
          financial_accounts:account_id(id, name, currency, type, initial_balance, chart_account_id)
        `)
        .eq("id", ledgerMovementId)
        .single()

      if (!error && data) movement = data
    }

    if (!movement && operationId) {
      // Fallback: buscar por operation_id (para pagos parciales, pagos masivos, etc.)
      // Buscar el movimiento EXPENSE más reciente de esta operación
      const { data, error } = await (supabase
        .from("ledger_movements") as any)
        .select(`
          id, created_at, type, amount_original, amount_ars_equivalent,
          currency, method, receipt_number, notes, account_id,
          financial_accounts:account_id(id, name, currency, type, initial_balance, chart_account_id)
        `)
        .eq("operation_id", operationId)
        .in("type", ["EXPENSE", "OPERATOR_PAYMENT"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!error && data) movement = data
    }

    if (!movement) {
      return NextResponse.json({
        account: null,
        movement: null,
        balanceBefore: null,
        balanceAfter: null,
      })
    }

    const account = movement.financial_accounts
    if (!account) {
      return NextResponse.json({
        account: null,
        movement: {
          receipt_number: movement.receipt_number,
          method: movement.method,
          notes: movement.notes,
          created_at: movement.created_at,
          amount_original: movement.amount_original,
          currency: movement.currency,
        },
        balanceBefore: null,
        balanceAfter: null,
      })
    }

    // 2. Determinar categoría del plan de cuentas (para lógica PASIVO vs ACTIVO)
    let category: string | null = null
    if (account.chart_account_id) {
      const { data: chartAccount } = await (supabase
        .from("chart_of_accounts") as any)
        .select("category")
        .eq("id", account.chart_account_id)
        .maybeSingle()
      category = chartAccount?.category || null
    }

    const accountCurrency = account.currency as "ARS" | "USD"
    const initialBalance = parseFloat(account.initial_balance || "0")

    // 3. Obtener TODOS los movimientos de esta cuenta para calcular balance
    const { data: allMovements, error: allMovError } = await (supabase
      .from("ledger_movements") as any)
      .select("id, type, amount_original, amount_ars_equivalent, created_at")
      .eq("account_id", account.id)
      .order("created_at", { ascending: true })

    if (allMovError) {
      return NextResponse.json({ error: "Error calculando balances" }, { status: 500 })
    }

    // Helper para calcular delta
    const calcDelta = (m: any) => {
      const amount = parseFloat(
        accountCurrency === "USD"
          ? (m.amount_original || "0")
          : (m.amount_ars_equivalent || "0")
      )
      if (category === "PASIVO") {
        if (m.type === "EXPENSE" || m.type === "OPERATOR_PAYMENT" || m.type === "FX_LOSS") return amount
        if (m.type === "INCOME" || m.type === "FX_GAIN") return -amount
        return 0
      }
      if (m.type === "INCOME" || m.type === "FX_GAIN") return amount
      if (m.type === "EXPENSE" || m.type === "FX_LOSS" || m.type === "COMMISSION" || m.type === "OPERATOR_PAYMENT") return -amount
      return 0
    }

    // 4. Calcular balance antes y después del movimiento
    let balanceBefore = initialBalance
    let balanceAfter = initialBalance
    let foundMovement = false

    for (const m of (allMovements || [])) {
      const delta = calcDelta(m)

      if (m.id === movement.id) {
        foundMovement = true
        balanceBefore = balanceAfter
        balanceAfter = balanceAfter + delta
        continue
      }

      if (!foundMovement) {
        balanceAfter += delta
      }
    }

    // Si no encontramos el movimiento, usar balance total como "before"
    if (!foundMovement) {
      balanceBefore = balanceAfter
      balanceAfter = balanceBefore + calcDelta(movement)
    }

    return NextResponse.json({
      account: {
        id: account.id,
        name: account.name,
        currency: account.currency,
        type: account.type,
      },
      movement: {
        receipt_number: movement.receipt_number,
        method: movement.method,
        notes: movement.notes,
        created_at: movement.created_at,
        amount_original: movement.amount_original,
        currency: movement.currency,
      },
      balanceBefore: Math.round(balanceBefore * 100) / 100,
      balanceAfter: Math.round(balanceAfter * 100) / 100,
    })
  } catch (error) {
    console.error("Error in GET /api/payments/detail:", error)
    return NextResponse.json({ error: "Error al obtener detalle del pago" }, { status: 500 })
  }
}
