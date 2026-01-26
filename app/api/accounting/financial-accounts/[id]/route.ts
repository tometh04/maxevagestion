import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getAccountBalance, createLedgerMovement, calculateARSEquivalent } from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"
import { canPerformAction } from "@/lib/permissions-api"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!canPerformAction(user, "accounting", "write")) {
      return NextResponse.json({ error: "No tiene permiso para eliminar cuentas" }, { status: 403 })
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: "ID de cuenta requerido" }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const { transfer_to_account_id } = body

    const { data: account, error: accountError } = await (supabase.from("financial_accounts") as any)
      .select("id, name, currency, is_active")
      .eq("id", id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    if (!account.is_active) {
      return NextResponse.json({ error: "La cuenta ya está eliminada" }, { status: 400 })
    }

    // Verificar cuántas cuentas activas quedan
    const { data: activeAccounts, error: countError } = await (supabase.from("financial_accounts") as any)
      .select("id", { count: "exact" })
      .eq("is_active", true)
    
    const activeCount = activeAccounts?.length || 0
    const isLastAccount = activeCount === 1

    const balance = await getAccountBalance(id, supabase)
    let targetName: string | null = null

    // Si es la última cuenta, se permite eliminar todo (incluyendo movimientos)
    if (isLastAccount) {
      console.log(`⚠️ Última cuenta financiera. Se eliminarán todos los movimientos contables.`)
      
      // Eliminar TODOS los movimientos contables del sistema
      // Usar una condición que siempre sea verdadera (id IS NOT NULL siempre es true para registros válidos)
      const { error: deleteMovementsError } = await (supabase.from("ledger_movements") as any)
        .delete()
        .not("id", "is", null) // Condición siempre verdadera para borrar todo
      
      if (deleteMovementsError) {
        console.error("Error eliminando movimientos contables:", deleteMovementsError)
        return NextResponse.json({ error: "Error al eliminar movimientos contables" }, { status: 500 })
      }
      
      console.log(`✅ Todos los movimientos contables eliminados`)
    } else if (Math.abs(balance) > 1e-6) {
      // Si NO es la última cuenta y tiene saldo, requiere transferencia
      if (!transfer_to_account_id) {
        return NextResponse.json(
          {
            error: "La cuenta tiene saldo. Debe indicar una cuenta destino para transferir el saldo.",
            balance,
            currency: account.currency,
          },
          { status: 400 }
        )
      }

      const { data: target, error: targetError } = await (supabase.from("financial_accounts") as any)
        .select("id, name, currency, is_active")
        .eq("id", transfer_to_account_id)
        .single()

      if (targetError || !target || !target.is_active) {
        return NextResponse.json({ error: "Cuenta destino no encontrada o inactiva" }, { status: 400 })
      }

      if (target.id === id) {
        return NextResponse.json({ error: "La cuenta destino no puede ser la misma cuenta" }, { status: 400 })
      }

      if (target.currency !== account.currency) {
        return NextResponse.json({
          error: `Solo puede transferir a cuentas en la misma moneda (${account.currency})`,
        }, { status: 400 })
      }

      targetName = target.name
      const amount = Math.abs(balance)
      let exchangeRate: number | null = null

      if (account.currency === "USD") {
        exchangeRate = await getExchangeRate(supabase, new Date())
        if (!exchangeRate) exchangeRate = await getLatestExchangeRate(supabase)
        if (!exchangeRate) exchangeRate = 1000
      }

      const amountARS = account.currency === "ARS"
        ? amount
        : calculateARSEquivalent(amount, "USD", exchangeRate)

      const method = "BANK"
      const conceptBase = `Transferencia por cierre de cuenta "${account.name}"`

      if (balance > 0) {
        await createLedgerMovement(
          {
            operation_id: null,
            lead_id: null,
            type: "EXPENSE",
            concept: `${conceptBase} → ${target.name}`,
            currency: account.currency as "ARS" | "USD",
            amount_original: amount,
            exchange_rate: account.currency === "USD" ? exchangeRate : null,
            amount_ars_equivalent: amountARS,
            method,
            account_id: id,
            notes: `Saldo transferido a cuenta ${target.name}`,
            created_by: user.id,
          },
          supabase
        )
        await createLedgerMovement(
          {
            operation_id: null,
            lead_id: null,
            type: "INCOME",
            concept: `${conceptBase} (desde "${account.name}")`,
            currency: account.currency as "ARS" | "USD",
            amount_original: amount,
            exchange_rate: account.currency === "USD" ? exchangeRate : null,
            amount_ars_equivalent: amountARS,
            method,
            account_id: target.id,
            notes: `Saldo recibido desde cuenta ${account.name}`,
            created_by: user.id,
          },
          supabase
        )
      } else {
        await createLedgerMovement(
          {
            operation_id: null,
            lead_id: null,
            type: "INCOME",
            concept: `${conceptBase} → ${target.name}`,
            currency: account.currency as "ARS" | "USD",
            amount_original: amount,
            exchange_rate: account.currency === "USD" ? exchangeRate : null,
            amount_ars_equivalent: amountARS,
            method,
            account_id: id,
            notes: `Saldo negativo transferido a cuenta ${target.name}`,
            created_by: user.id,
          },
          supabase
        )
        await createLedgerMovement(
          {
            operation_id: null,
            lead_id: null,
            type: "EXPENSE",
            concept: `${conceptBase} (desde "${account.name}")`,
            currency: account.currency as "ARS" | "USD",
            amount_original: amount,
            exchange_rate: account.currency === "USD" ? exchangeRate : null,
            amount_ars_equivalent: amountARS,
            method,
            account_id: target.id,
            notes: `Saldo recibido desde cuenta ${account.name} (cierre)`,
            created_by: user.id,
          },
          supabase
        )
      }

      const verifyBalance = await getAccountBalance(target.id, supabase)
      console.log(`[DELETE account] Transferido ${amount} ${account.currency} a ${target.name}. Balance destino: ${verifyBalance}`)
      if (Math.abs(verifyBalance) < 1e-6 && amount > 1e-6) {
        console.warn(`[DELETE account] Balance destino sigue ~0 tras transferir ${amount}. Revisar getAccountBalance/chart.`)
      }
    }

    // HARD DELETE: Eliminar la cuenta completamente (no soft-delete)
    // Primero eliminar movimientos de ledger que referencian esta cuenta
    const { error: deleteLedgerError } = await (supabase.from("ledger_movements") as any)
      .delete()
      .eq("account_id", id)
    
    if (deleteLedgerError) {
      console.error("Error eliminando movimientos de ledger:", deleteLedgerError)
      return NextResponse.json({ error: "Error al eliminar movimientos de la cuenta" }, { status: 500 })
    }

    // Eliminar la cuenta
    const { error: deleteError } = await (supabase.from("financial_accounts") as any)
      .delete()
      .eq("id", id)

    if (deleteError) {
      console.error("Error eliminando cuenta:", deleteError)
      return NextResponse.json({ error: "Error al eliminar la cuenta" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: isLastAccount
        ? "Última cuenta eliminada. Todos los movimientos contables fueron eliminados."
        : targetName
        ? `Cuenta eliminada. Saldo transferido a "${targetName}".`
        : "Cuenta eliminada correctamente.",
    })
  } catch (e: any) {
    console.error("DELETE /api/accounting/financial-accounts/[id]:", e)
    return NextResponse.json({ error: e?.message || "Error al eliminar cuenta" }, { status: 500 })
  }
}
