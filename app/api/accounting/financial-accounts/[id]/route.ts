import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getAccountBalance, createLedgerMovement, calculateARSEquivalent, invalidateBalanceCache } from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate, getExchangeRateWithFallback } from "@/lib/accounting/exchange-rates"
import { canPerformAction, getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"

/**
 * PATCH /api/accounting/financial-accounts/[id]
 *
 * Permite editar:
 *   - name: simple UPDATE de la columna
 *   - target_balance: el saldo NO es un campo stored sino la suma de
 *     ledger_movements. Para "fijar" el balance creamos un movimiento de
 *     ajuste manual (INCOME o EXPENSE según signo del delta) que lleva
 *     el balance al target deseado. Mantiene la integridad contable.
 *
 * El cliente puede mandar uno o ambos campos en el body. Si manda solo
 * name, no se toca el balance. Si manda target_balance, se crea el ajuste.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    const perms = (user as any).org_id
      ? await resolveUserPermissions(supabase as any, user.id, (user as any).org_id, user.role, agencyIds)
      : null
    if (!canPerformAction(user, "accounting", "write", perms ?? undefined)) {
      return NextResponse.json({ error: "No tiene permiso para editar cuentas" }, { status: 403 })
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: "ID de cuenta requerido" }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const { name, target_balance, adjustment_reason, bank_tax_rate, credit_limit } = body as {
      name?: string
      target_balance?: number | string | null
      adjustment_reason?: string | null
      bank_tax_rate?: number | null
      credit_limit?: number | string | null
    }

    // Cargar cuenta y validar tenant isolation
    const { data: account, error: accountError } = await (supabase.from("financial_accounts") as any)
      .select("id, name, currency, is_active, org_id")
      .eq("id", id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }
    if (user.org_id && account.org_id !== user.org_id) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }
    if (account.is_active === false) {
      return NextResponse.json({ error: "No se puede editar una cuenta inactiva" }, { status: 400 })
    }

    // ──────────────────────────────────────────────────────────
    // 1) Actualizar name y/o bank_tax_rate (si vinieron en el body)
    // ──────────────────────────────────────────────────────────
    let updatedName: string | null = null
    const simpleUpdate: Record<string, unknown> = {}

    if (typeof name === "string") {
      const trimmed = name.trim()
      if (trimmed.length === 0) {
        return NextResponse.json({ error: "El nombre no puede estar vacío" }, { status: 400 })
      }
      if (trimmed !== account.name) {
        simpleUpdate.name = trimmed
        updatedName = trimmed
      }
    }

    if ("bank_tax_rate" in body) {
      const rate = bank_tax_rate == null ? null : Number(bank_tax_rate)
      if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
        return NextResponse.json({ error: "bank_tax_rate debe ser un número entre 0 y 100" }, { status: 400 })
      }
      simpleUpdate.bank_tax_rate = rate
    }

    // Línea de crédito / giro en descubierto. Debe ser >= 0. 0 = no permite negativo.
    if ("credit_limit" in body) {
      const limit = credit_limit == null || credit_limit === "" ? 0 : Number(credit_limit)
      if (!Number.isFinite(limit) || limit < 0) {
        return NextResponse.json({ error: "El límite de crédito debe ser un número mayor o igual a 0" }, { status: 400 })
      }
      simpleUpdate.credit_limit = limit
    }

    if (Object.keys(simpleUpdate).length > 0) {
      const { error: updateError } = await (supabase.from("financial_accounts") as any)
        .update(simpleUpdate)
        .eq("id", id)
      if (updateError) {
        console.error("Error actualizando cuenta:", updateError)
        return NextResponse.json({ error: "Error al actualizar la cuenta" }, { status: 500 })
      }
    }

    // ──────────────────────────────────────────────────────────
    // 2) Ajuste de saldo (si vino target_balance)
    //    Creamos un ledger_movement de tipo INCOME (delta > 0) o EXPENSE
    //    (delta < 0) que lleva el balance al target. Mantiene double-entry.
    // ──────────────────────────────────────────────────────────
    let adjustmentMovementId: string | null = null
    let oldBalance: number | null = null
    let newBalance: number | null = null

    if (target_balance !== undefined && target_balance !== null && target_balance !== "") {
      const targetNum = Number(target_balance)
      if (!Number.isFinite(targetNum)) {
        return NextResponse.json({ error: "target_balance debe ser un número" }, { status: 400 })
      }

      const currentBalance = await getAccountBalance(id, supabase)
      const delta = Number((targetNum - currentBalance).toFixed(2))
      oldBalance = currentBalance

      if (Math.abs(delta) > 0.01) {
        const reason = (typeof adjustment_reason === "string" ? adjustment_reason.trim() : "") || "Ajuste manual sin motivo declarado"
        const concept = `Ajuste manual de saldo (${account.name})`

        // Para USD necesitamos exchange_rate para calcular ARS equivalent.
        // Para ARS, exchange_rate queda null y amount_ars_equivalent = delta directo.
        let exchangeRate: number | null = null
        if (account.currency === "USD") {
          const rateResult = await getExchangeRateWithFallback(supabase, new Date(), "financial-account-balance-adjustment")
          exchangeRate = rateResult.rate
        }
        const amountAbs = Math.abs(delta)
        const amountARS = account.currency === "ARS"
          ? amountAbs
          : calculateARSEquivalent(amountAbs, "USD", exchangeRate)

        try {
          const result = await createLedgerMovement(
            {
              operation_id: null,
              lead_id: null,
              type: delta > 0 ? "INCOME" : "EXPENSE",
              concept,
              currency: account.currency as "ARS" | "USD",
              amount_original: amountAbs,
              exchange_rate: account.currency === "USD" ? exchangeRate : null,
              amount_ars_equivalent: amountARS,
              method: "OTHER",
              account_id: id,
              notes: `Ajuste manual ${delta > 0 ? "+" : "-"}${amountAbs} ${account.currency}. Motivo: ${reason}. Saldo anterior: ${currentBalance.toFixed(2)} → nuevo: ${targetNum.toFixed(2)}.`,
              created_by: user.id,
              org_id: account.org_id,
            },
            supabase
          )
          adjustmentMovementId = result.id
        } catch (e: any) {
          console.error("Error creando movimiento de ajuste:", e)
          return NextResponse.json(
            { error: e?.message || "Error al ajustar el saldo" },
            { status: 500 }
          )
        }
      }

      // Recalcular para devolver el balance final (post-ajuste)
      invalidateBalanceCache(id)
      newBalance = await getAccountBalance(id, supabase)
    }

    return NextResponse.json({
      success: true,
      updated_name: updatedName,
      adjustment: adjustmentMovementId
        ? {
            movement_id: adjustmentMovementId,
            old_balance: oldBalance,
            new_balance: newBalance,
            delta: oldBalance != null && newBalance != null ? Number((newBalance - oldBalance).toFixed(2)) : null,
          }
        : null,
    })
  } catch (e: any) {
    console.error("PATCH /api/accounting/financial-accounts/[id]:", e)
    return NextResponse.json({ error: e?.message || "Error al editar cuenta" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const agencyIdsD = await getUserAgencyIds(supabase, user.id, user.role as any)
    const permsD = (user as any).org_id
      ? await resolveUserPermissions(supabase as any, user.id, (user as any).org_id, user.role, agencyIdsD)
      : null
    if (!canPerformAction(user, "accounting", "write", permsD ?? undefined)) {
      return NextResponse.json({ error: "No tiene permiso para eliminar cuentas" }, { status: 403 })
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: "ID de cuenta requerido" }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const { transfer_to_account_id } = body

    const { data: account, error: accountError } = await (supabase.from("financial_accounts") as any)
      .select("id, name, currency, is_active, org_id")
      .eq("id", id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    // Multi-tenant: solo permitir eliminar cuentas de la misma org
    if (user.org_id && account.org_id !== user.org_id) {
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
      
      // Eliminar TODOS los movimientos contables del sistema
      // Usar una condición que siempre sea verdadera (id IS NOT NULL siempre es true para registros válidos)
      const { error: deleteMovementsError } = await (supabase.from("ledger_movements") as any)
        .delete()
        .not("id", "is", null) // Condición siempre verdadera para borrar todo
      
      if (deleteMovementsError) {
        console.error("Error eliminando movimientos contables:", deleteMovementsError)
        return NextResponse.json({ error: "Error al eliminar movimientos contables" }, { status: 500 })
      }
      
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
        const rateResult = await getExchangeRateWithFallback(supabase, new Date(), "financial-account-close")
        exchangeRate = rateResult.rate
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

    // Invalidar cache de balance de la cuenta eliminada
    invalidateBalanceCache(id)

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
