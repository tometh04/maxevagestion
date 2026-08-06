import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  createLedgerMovement,
  getOrCreateDefaultAccount,
  validateSufficientBalance,
  isAccountingOnlyAccount,
} from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate, getExchangeRateWithFallback } from "@/lib/accounting/exchange-rates"
import {
  buildFinancialCostMovement,
  buildFinancialCostConcept,
  buildFinancialIncomeConcept,
} from "@/lib/accounting/financial-result"
import { roundMoney } from "@/lib/currency"
import { startOfDayAR } from "@/lib/utils/date-range"

type LedgerMethod = "CASH" | "BANK" | "MP" | "USD" | "OTHER"

/** Método del ledger según el tipo de cuenta. Cada asiento usa el de SU cuenta:
 *  el pago puede salir de un banco en USD y la comisión de la financiera de la
 *  caja en pesos. */
function ledgerMethodForAccountType(type: string | null | undefined): LedgerMethod {
  if (type === "CASH_ARS" || type === "CASH_USD") return "CASH"
  if (type === "CHECKING_ARS" || type === "CHECKING_USD") return "BANK"
  if (type === "CREDIT_CARD") return "MP"
  if (type === "SAVINGS_ARS" || type === "SAVINGS_USD") return "USD"
  return "OTHER"
}

interface ToProcessItem {
  paymentItem: { operator_payment_id: string; operation_id: string; amount_to_pay: number | string }
  operatorPayment: any
  amountInPaymentCurrency: number
  amountARS: number
  newPaidAmount: number
  isFullyPaid: boolean
  operation: any
  // P0 2026-05-10: captured at fetch time for CAS guard against concurrent
  // bulk runs that would otherwise double-pay the same operator_payment.
  originalPaidAmount: any
  originalStatus: string
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    // Cross-tenant fix (2026-05-18): exigir org_id. Este endpoint procesa
    // bulk payments por id — sin scopear, un user podría pagar deudas
    // ajenas pasando IDs enumerados.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const {
      payments,
      payment_account_id,
      payment_currency,
      exchange_rate,
      receipt_number,
      payment_date,
      notes,
      deposit_bonus,
      financial_fee,
      apply_retention_ganancias,
      apply_retention_iva,
      retention_ganancias_override,
      retention_iva_override,
    } = body

    const hasDepositBonus = deposit_bonus?.enabled && deposit_bonus?.percentage > 0 && deposit_bonus?.bonus_account_id

    // Comisión de la financiera: plata en PESOS que sale de otra caja cada vez
    // que se paga en dólares por depósito. Es independiente de la bonificación
    // (se puede tener una sin la otra) y no es un gasto de la agencia: se netea
    // contra la ganancia financiera en el reporte societario.
    const financialFeeAmount = roundMoney(Number(financial_fee?.amount_ars) || 0)
    const hasFinancialFee = financialFeeAmount > 0 && !!financial_fee?.account_id

    // Load tax settings for automatic retentions
    let retentionGananciasRate = 0
    let retentionIvaRate = 0
    if (apply_retention_ganancias || apply_retention_iva) {
      const { data: taxSettings } = await (supabase.from("financial_settings") as any)
        .select("retention_ganancias_rate, retention_iva_rate")
        .limit(1)
        .maybeSingle()
      if (taxSettings) {
        retentionGananciasRate = apply_retention_ganancias
          ? (retention_ganancias_override ?? (Number(taxSettings.retention_ganancias_rate) || 0))
          : 0
        retentionIvaRate = apply_retention_iva
          ? (retention_iva_override ?? (Number(taxSettings.retention_iva_rate) || 0))
          : 0
      }
    }

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return NextResponse.json({ error: "Debe especificar al menos un pago" }, { status: 400 })
    }

    if (!payment_account_id || !receipt_number || !payment_date) {
      return NextResponse.json(
        { error: "Faltan campos requeridos (payment_account_id, receipt_number, payment_date)" },
        { status: 400 }
      )
    }

    const { data: paymentAccount, error: accountError } = await (supabase.from("financial_accounts") as any)
      .select("*")
      .eq("id", payment_account_id)
      .eq("org_id", (user as any).org_id)
      .single()

    if (accountError || !paymentAccount) {
      return NextResponse.json({ error: "Cuenta financiera no encontrada" }, { status: 404 })
    }

    const accountCurrency = paymentAccount.currency as "ARS" | "USD"
    if (accountCurrency !== payment_currency) {
      console.error("[BulkPayment API] ❌ Moneda mismatch:", accountCurrency, "vs", payment_currency)
      return NextResponse.json(
        { error: `La cuenta debe estar en ${payment_currency}. Cuenta actual: ${accountCurrency}.` },
        { status: 400 }
      )
    }

    const accountingOnly = await isAccountingOnlyAccount(payment_account_id, supabase)
    if (accountingOnly) {
      return NextResponse.json(
        { error: "No se puede usar una cuenta solo contable (Cuentas por Cobrar/Pagar) para pagos." },
        { status: 400 }
      )
    }

    // Cuenta destino de la ganancia financiera. Hasta acá se pasaba cruda al
    // ledger sin validar el tenant: un id ajeno enumerado escribía en otra org.
    if (hasDepositBonus) {
      const { data: bonusAccount } = await (supabase.from("financial_accounts") as any)
        .select("id")
        .eq("id", deposit_bonus.bonus_account_id)
        .eq("org_id", (user as any).org_id)
        .maybeSingle()
      if (!bonusAccount) {
        return NextResponse.json(
          { error: "Cuenta de ganancia financiera no encontrada" },
          { status: 404 }
        )
      }
    }

    // Comisión de la financiera. Si vino el bloque pero está incompleto se
    // corta acá: dejarlo pasar en silencio significa plata que salió de la caja
    // y no quedó asentada en ningún lado.
    let feeAccount: any = null
    if (financial_fee) {
      if (!financial_fee.account_id || !(financialFeeAmount > 0)) {
        return NextResponse.json(
          { error: "El costo financiero necesita un monto mayor a 0 y una cuenta en pesos." },
          { status: 400 }
        )
      }

      const { data: feeAccountRow } = await (supabase.from("financial_accounts") as any)
        .select("id, type, currency")
        .eq("id", financial_fee.account_id)
        .eq("org_id", (user as any).org_id)
        .maybeSingle()

      if (!feeAccountRow) {
        return NextResponse.json(
          { error: "Cuenta del costo financiero no encontrada" },
          { status: 404 }
        )
      }

      // Bloqueante y no warning: validateSufficientBalance no convierte
      // monedas, así que con una cuenta en dólares compararía pesos contra
      // dólares y dejaría pasar cualquier monto.
      if (feeAccountRow.currency !== "ARS") {
        return NextResponse.json(
          { error: "La comisión de la financiera se paga en ARS. Elegí una cuenta en pesos." },
          { status: 400 }
        )
      }

      const feeAccountingOnly = await isAccountingOnlyAccount(financial_fee.account_id, supabase)
      if (feeAccountingOnly) {
        return NextResponse.json(
          { error: "No se puede usar una cuenta solo contable para el costo financiero." },
          { status: 400 }
        )
      }

      feeAccount = feeAccountRow
    }

    let exchangeRateValue: number | null = null
    const rateDate = payment_date ? new Date(payment_date) : new Date()
    if (payment_currency === "USD") {
      const rateResult = await getExchangeRateWithFallback(supabase, rateDate, "bulk-operator-payments")
      exchangeRateValue = rateResult.rate
    } else if (exchange_rate != null) {
      exchangeRateValue = parseFloat(String(exchange_rate))
    } else {
      const rateResult = await getExchangeRateWithFallback(supabase, rateDate, "bulk-operator-payments-ars")
      exchangeRateValue = rateResult.rate
    }

    const errors: string[] = []
    const toProcess: ToProcessItem[] = []
    let totalDebit = 0

    for (const paymentItem of payments) {
      const { operator_payment_id, operation_id, amount_to_pay } = paymentItem

      if (!operator_payment_id || !operation_id || amount_to_pay == null || Number(amount_to_pay) <= 0) {
        errors.push(`Pago inválido: ${operator_payment_id}`)
        continue
      }

      const { data: operatorPayment, error: opError } = await (supabase.from("operator_payments") as any)
        .select("*")
        .eq("id", operator_payment_id)
        .eq("org_id", (user as any).org_id)
        .single()

      if (opError || !operatorPayment) {
        errors.push(`Pago de operador no encontrado: ${operator_payment_id}`)
        continue
      }

      const paymentCurrency = operatorPayment.currency as "ARS" | "USD"
      const amt = parseFloat(String(amount_to_pay))
      let amountInPaymentCurrency = amt
      let amountARS = 0

      if (paymentCurrency !== payment_currency) {
        if (!exchange_rate && !exchangeRateValue) {
          errors.push(`Se requiere tipo de cambio para convertir ${paymentCurrency} a ${payment_currency} en ${operator_payment_id}`)
          continue
        }
        const rate = exchangeRateValue ?? parseFloat(String(exchange_rate))
        if (payment_currency === "USD" && paymentCurrency === "ARS") {
          amountInPaymentCurrency = amt / rate
        } else if (payment_currency === "ARS" && paymentCurrency === "USD") {
          amountInPaymentCurrency = amt * rate
        }
      }

      amountInPaymentCurrency = roundMoney(amountInPaymentCurrency)
      if (payment_currency === "USD") {
        amountARS = roundMoney(amountInPaymentCurrency * exchangeRateValue!)
      } else {
        amountARS = amountInPaymentCurrency
      }

      const currentPaidAmount = parseFloat(operatorPayment.paid_amount || "0") || 0
      const newPaidAmount = roundMoney(currentPaidAmount + amt)
      const totalAmount = parseFloat(operatorPayment.amount)
      const isFullyPaid = newPaidAmount >= totalAmount

      const { data: operation } = await (supabase.from("operations") as any)
        .select("seller_id, operator_id, agency_id")
        .eq("id", operation_id)
        .eq("org_id", (user as any).org_id)
        .single()

      toProcess.push({
        paymentItem: { operator_payment_id, operation_id, amount_to_pay },
        operatorPayment,
        amountInPaymentCurrency,
        amountARS,
        newPaidAmount,
        isFullyPaid,
        // CAS snapshot for race detection at UPDATE time
        originalPaidAmount: operatorPayment.paid_amount,
        originalStatus: operatorPayment.status,
        operation: operation || null,
      })
      totalDebit += amountInPaymentCurrency
    }

    totalDebit = roundMoney(totalDebit)

    if (toProcess.length === 0) {
      return NextResponse.json(
        { error: "Ningún pago válido para procesar.", details: errors },
        { status: 400 }
      )
    }

    // Si hay bonificación por depósito, el monto real que sale de caja es menor
    let bonusTotal = 0
    if (hasDepositBonus) {
      const pct = deposit_bonus.percentage
      bonusTotal = roundMoney(totalDebit - totalDebit / (1 + pct / 100))
    }
    const actualDebitFromAccount = roundMoney(totalDebit - bonusTotal)

    // Si la comisión sale de la MISMA cuenta que el pago (y en la misma
    // moneda), las dos validaciones por separado pueden pasar mientras la suma
    // sobregira: hay que validar el total de una.
    const feeSharesPaymentAccount =
      hasFinancialFee &&
      financial_fee.account_id === payment_account_id &&
      payment_currency === "ARS"
    const debitToValidate = feeSharesPaymentAccount
      ? roundMoney(actualDebitFromAccount + financialFeeAmount)
      : actualDebitFromAccount

    const balanceCheck = await validateSufficientBalance(
      payment_account_id,
      debitToValidate,
      payment_currency as "ARS" | "USD",
      supabase
    )
    if (!balanceCheck.valid) {
      console.error("[BulkPayment API] ❌ Saldo insuficiente:", balanceCheck.error)
      return NextResponse.json(
        { error: balanceCheck.error ?? "Saldo insuficiente en la cuenta para el total a pagar." },
        { status: 400 }
      )
    }

    if (hasFinancialFee && !feeSharesPaymentAccount) {
      const feeBalanceCheck = await validateSufficientBalance(
        financial_fee.account_id,
        financialFeeAmount,
        "ARS",
        supabase
      )
      if (!feeBalanceCheck.valid) {
        console.error("[BulkPayment API] ❌ Saldo insuficiente para el costo financiero:", feeBalanceCheck.error)
        return NextResponse.json(
          {
            error:
              feeBalanceCheck.error ??
              "Saldo insuficiente en la cuenta elegida para la comisión de la financiera.",
          },
          { status: 400 }
        )
      }
    }

    const ledgerMethod = ledgerMethodForAccountType(paymentAccount.type)

    const { data: costosChart } = await (supabase.from("chart_of_accounts") as any)
      .select("id")
      .eq("account_code", "4.2.01")
      .eq("is_active", true)
      .maybeSingle()

    let costAccountId: string
    if (costosChart) {
      // Buscar la FA canónica (la más antigua) asociada a "Costos de Operadores" (4.2.01).
      // IMPORTANTE: .order("created_at").limit(1) es crítico para NO generar duplicados.
      // Bug previo (pre-Abr/2026): filtrábamos por paymentAccount.currency en el lookup pero
      // el INSERT clavaba currency='ARS', así que pagos USD nunca encontraban FA y creaban
      // duplicados ARS sin parar. Adicionalmente, .maybeSingle() con 2+ filas erra silencioso
      // y caía al INSERT otra vez → crecimiento exponencial (llegamos a 42 duplicados en prod).
      // Mismo patrón que getOrCreateDefaultAccount en lib/accounting/ledger.ts.
      const { data: costosFAList } = await (supabase.from("financial_accounts") as any)
        .select("id")
        .eq("chart_account_id", costosChart.id)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)

      const existingFA = (costosFAList as Array<{ id: string }> | null)?.[0]

      if (existingFA?.id) {
        costAccountId = existingFA.id
      } else {
        // No existe ninguna: crear la canónica (una sola vez).
        const { data: newFA, error: insErr } = await (supabase.from("financial_accounts") as any)
          .insert({
            name: "Costo de Operadores",
            type: "CASH_ARS",
            currency: "ARS",
            chart_account_id: costosChart.id,
            initial_balance: 0,
            is_active: true,
            created_by: user.id,
          })
          .select("id")
          .single()
        if (insErr || !newFA?.id) {
          costAccountId = await getOrCreateDefaultAccount("CASH", "ARS", user.id, supabase)
        } else {
          costAccountId = newFA.id
        }
      }
    } else {
      costAccountId = await getOrCreateDefaultAccount("CASH", "ARS", user.id, supabase)
    }

    const processedPayments: { operator_payment_id: string; amount_paid: number | string; new_status: string }[] = []

    for (const item of toProcess) {
      try {
        const { operator_payment_id, operation_id, amount_to_pay } = item.paymentItem
        const operatorPaymentCurrency = item.operatorPayment.currency as "ARS" | "USD"
        const sellerId = item.operation?.seller_id ?? null
        const operatorId = item.operatorPayment?.operator_id ?? item.operation?.operator_id ?? null
        const paymentEquivalentAmount = roundMoney(item.amountInPaymentCurrency)
        const paymentEquivalentUsd =
          payment_currency === "USD"
            ? paymentEquivalentAmount
            : (exchangeRateValue && exchangeRateValue > 0
              ? roundMoney(paymentEquivalentAmount / exchangeRateValue)
              : null)

        // Calcular el monto real que sale de caja (descontando bonificación proporcional)
        let expenseAmount = item.amountInPaymentCurrency
        let expenseARS = item.amountARS
        if (hasDepositBonus && totalDebit > 0) {
          const pct = deposit_bonus.percentage
          expenseAmount = roundMoney(item.amountInPaymentCurrency / (1 + pct / 100))
          if (payment_currency === "USD") {
            expenseARS = roundMoney(expenseAmount * exchangeRateValue!)
          } else {
            expenseARS = expenseAmount
          }
        }

        // Verificar duplicados antes de crear el movimiento
        const { data: existingBulk } = await (supabase.from("ledger_movements") as any)
          .select("id")
          .eq("operation_id", operation_id)
          .eq("type", "EXPENSE")
          .eq("amount_original", expenseAmount)
          .eq("account_id", payment_account_id)
          .limit(1)
        if (existingBulk && existingBulk.length > 0) {
          errors.push(`Movimiento duplicado detectado para operación ${operation_id}, se omitió`)
          continue
        }

        const ledgerMovementResult = await createLedgerMovement(
          {
            operation_id,
            lead_id: null,
            type: "EXPENSE",
            concept: hasDepositBonus
              ? `Pago por depósito a operador - Operación ${operation_id.slice(0, 8)}`
              : `Pago masivo a operador - Operación ${operation_id.slice(0, 8)}`,
            currency: payment_currency as "ARS" | "USD",
            amount_original: expenseAmount,
            exchange_rate: payment_currency === "USD" ? exchangeRateValue : (exchange_rate != null ? exchangeRateValue : null),
            amount_ars_equivalent: expenseARS,
            method: ledgerMethod,
            account_id: payment_account_id,
            seller_id: sellerId,
            operator_id: operatorId,
            receipt_number,
            notes: notes ?? `Pago masivo - ${receipt_number}`,
            created_by: user.id,
          },
          supabase
        )

        const costAmount = parseFloat(String(amount_to_pay))
        const costARS = operatorPaymentCurrency === "USD"
          ? roundMoney(costAmount * exchangeRateValue!)
          : costAmount

        await createLedgerMovement(
          {
            operation_id,
            lead_id: null,
            type: "OPERATOR_PAYMENT",
            concept: `Costo operador - Operación ${operation_id.slice(0, 8)}`,
            currency: operatorPaymentCurrency,
            amount_original: roundMoney(costAmount),
            exchange_rate: operatorPaymentCurrency === "USD" ? exchangeRateValue! : null,
            amount_ars_equivalent: roundMoney(costARS),
            method: ledgerMethod,
            account_id: costAccountId,
            seller_id: sellerId,
            operator_id: operatorId,
            receipt_number,
            notes: notes ?? `Pago masivo - ${receipt_number}`,
            created_by: user.id,
          },
          supabase
        )

        const updateData: any = {
          paid_amount: item.newPaidAmount,
          updated_at: new Date().toISOString(),
        }
        if (item.isFullyPaid) {
          updateData.status = "PAID"
          updateData.ledger_movement_id = ledgerMovementResult.id
        }

        // P0 2026-05-10: CAS guard contra race conditions con bulk runs
        // concurrentes. Si paid_amount cambió desde que lo leímos en validación
        // (línea 160), otro request ya procesó este operator_payment → abort
        // este item con error explícito, NO escribir nada.
        // El ledger ya se creó antes (líneas ~311 y ~339) y queda como dato
        // huérfano detectable por /api/payments/orphans — preferible a doble
        // pago.
        const { data: updatedRows, error: updateError } = await (supabase.from("operator_payments") as any)
          .update(updateData)
          .eq("id", operator_payment_id)
          .eq("paid_amount", item.originalPaidAmount)
          .eq("status", item.originalStatus)
          .select("id")

        if (updateError) {
          errors.push(`Error actualizando ${operator_payment_id}: ${updateError.message}`)
          continue
        }

        if (!updatedRows || updatedRows.length === 0) {
          errors.push(
            `Race condition detectada en ${operator_payment_id}: ` +
            `otra operación modificó este pago mientras se procesaba. ` +
            `Ledger creado quedó huérfano (visible en /api/payments/orphans).`
          )
          continue
        }

        const paymentReference = [receipt_number, notes].filter(Boolean).join(" - ") || receipt_number
        const paymentData = {
          operation_id,
          operator_id: operatorId,
          operator_payment_id,
          source: "OPERATOR_BULK",
          payer_type: "OPERATOR" as const,
          direction: "EXPENSE" as const,
          method: "Pago Masivo",
          amount: paymentEquivalentAmount,
          currency: payment_currency,
          exchange_rate: exchangeRateValue,
          amount_usd: paymentEquivalentUsd,
          date_paid: payment_date,
          date_due: payment_date,
          status: "PAID" as const,
          reference: paymentReference || null,
          ledger_movement_id: ledgerMovementResult.id,
        }

        const { data: paymentRecord, error: paymentInsertError } = await (supabase.from("payments") as any)
          .insert(paymentData)
          .select("id")
          .single()

        if (paymentInsertError || !paymentRecord?.id) {
          errors.push(`Pago aplicado sin reflejo en operación ${operation_id.slice(0, 8)}: ${paymentInsertError?.message || "No se pudo registrar el payment"}`)
        }

        // Si se pagó más que el monto original (hasta 10% extra), actualizar operator_cost y monto de la deuda
        const originalAmount = parseFloat(item.operatorPayment.amount)
        if (item.newPaidAmount > originalAmount) {
          const extraAmount = roundMoney(item.newPaidAmount - originalAmount)
          // Actualizar el monto de la deuda del operador para reflejar el pago extra
          await (supabase.from("operator_payments") as any)
            .update({ amount: item.newPaidAmount, updated_at: new Date().toISOString() })
            .eq("id", operator_payment_id)

          // Actualizar el operator_cost de la operación en tiempo real
          if (item.paymentItem.operation_id) {
            const { data: currentOp } = await (supabase.from("operations") as any)
              .select("operator_cost, sale_amount_total")
              .eq("id", item.paymentItem.operation_id)
              .single()

            if (currentOp) {
              const newCost = roundMoney(parseFloat(currentOp.operator_cost) + extraAmount)
              const newMargin = roundMoney(parseFloat(currentOp.sale_amount_total) - newCost)
              const newMarginPct = parseFloat(currentOp.sale_amount_total) > 0
                ? roundMoney((newMargin / parseFloat(currentOp.sale_amount_total)) * 100)
                : 0

              await (supabase.from("operations") as any)
                .update({
                  operator_cost: newCost,
                  margin_amount: newMargin,
                  margin_percentage: newMarginPct,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", item.paymentItem.operation_id)
            }
          }
        }

        processedPayments.push({
          operator_payment_id,
          amount_paid: amount_to_pay,
          new_status: item.isFullyPaid ? "PAID" : "PENDING",
        })

        // Auto-create retenciones if configured
        const paymentAmount = Number(amount_to_pay)
        const taxPeriod = (payment_date || new Date().toISOString()).substring(0, 7)

        // Get operator info for counterpart data
        const operatorName = item.operatorPayment?.operators?.name || item.operation?.operators?.name || null
        const operatorCuit = null // TODO: add cuit to operators table

        if (retentionGananciasRate > 0 && paymentAmount > 0) {
          const retAmount = roundMoney(paymentAmount * retentionGananciasRate / 100)
          await (supabase.from("tax_withholdings") as any).insert({
            type: "RETENCION_GANANCIAS",
            direction: "PRACTICED",
            source_type: "OPERATOR_PAYMENT",
            source_id: operator_payment_id,
            operation_id: item.paymentItem.operation_id,
            operator_id: item.operatorPayment?.operator_id || null,
            counterpart_name: operatorName,
            counterpart_cuit: operatorCuit,
            currency: payment_currency,
            amount: retAmount,
            tax_period: taxPeriod,
            withholding_date: payment_date || new Date().toISOString().split("T")[0],
            status: "PENDING",
            notes: `Retención auto - ${retentionGananciasRate}% sobre ${payment_currency} ${paymentAmount}`,
            created_by: user.id,
          })
        }

        if (retentionIvaRate > 0 && paymentAmount > 0) {
          const retAmount = roundMoney(paymentAmount * retentionIvaRate / 100)
          await (supabase.from("tax_withholdings") as any).insert({
            type: "RETENCION_IVA",
            direction: "PRACTICED",
            source_type: "OPERATOR_PAYMENT",
            source_id: operator_payment_id,
            operation_id: item.paymentItem.operation_id,
            operator_id: item.operatorPayment?.operator_id || null,
            counterpart_name: operatorName,
            counterpart_cuit: operatorCuit,
            currency: payment_currency,
            amount: retAmount,
            tax_period: taxPeriod,
            withholding_date: payment_date || new Date().toISOString().split("T")[0],
            status: "PENDING",
            notes: `Retención auto - ${retentionIvaRate}% sobre ${payment_currency} ${paymentAmount}`,
            created_by: user.id,
          })
        }
      } catch (e: any) {
        errors.push(`Error procesando ${item.paymentItem.operator_payment_id}: ${e?.message ?? String(e)}`)
      }
    }

    if (processedPayments.length === 0) {
      return NextResponse.json(
        { error: "No se pudo procesar ningún pago.", details: errors },
        { status: 500 }
      )
    }

    // ============================================
    // RESULTADO FINANCIERO DEL LOTE
    // ============================================
    // La ganancia por depósito y la comisión de la financiera son las dos caras
    // de operar con una financiera. Se asientan una sola vez por lote (no por
    // deuda: el fee es por transferencia, no por pasajero) y con la fecha del
    // pago, para que el neteo del reporte societario no se parta cuando el lote
    // se carga después del cierre de mes.
    //
    // La fecha va con offset argentino explícito y no como "YYYY-MM-DD" pelado:
    // `new Date("2026-07-01").toISOString()` es medianoche UTC, o sea las 21h
    // del 30/06 en Argentina, y los reportes filtran por día argentino. Un pago
    // del 1° caería en el mes anterior.
    const financialMovementDate = payment_date
      ? startOfDayAR(String(payment_date).split("T")[0])
      : null

    // Crear INCOME de ganancia financiera por depósito
    if (hasDepositBonus && bonusTotal > 0 && processedPayments.length > 0) {
      try {
        const bonusARS = payment_currency === "USD"
          ? roundMoney(bonusTotal * exchangeRateValue!)
          : bonusTotal
        const bonusConcept = buildFinancialIncomeConcept(receipt_number)

        // Sin esta guarda, un doble submit del mismo lote duplicaba la
        // ganancia financiera: el chequeo de duplicados del loop sólo cubre el
        // EXPENSE de cada deuda.
        const { data: existingBonus } = await (supabase.from("ledger_movements") as any)
          .select("id")
          .eq("org_id", (user as any).org_id)
          .eq("type", "INCOME")
          .eq("concept", bonusConcept)
          .eq("account_id", deposit_bonus.bonus_account_id)
          .limit(1)

        if (existingBonus && existingBonus.length > 0) {
          errors.push("La ganancia financiera de este comprobante ya estaba registrada, se omitió")
        } else {
          await createLedgerMovement(
            {
              operation_id: null,
              lead_id: null,
              type: "INCOME",
              concept: bonusConcept,
              currency: payment_currency as "ARS" | "USD",
              amount_original: bonusTotal,
              exchange_rate: payment_currency === "USD" ? exchangeRateValue : null,
              amount_ars_equivalent: bonusARS,
              method: ledgerMethod,
              account_id: deposit_bonus.bonus_account_id,
              receipt_number,
              notes: `Bonificación ${deposit_bonus.percentage}% por depósito - ${processedPayments.length} pago(s)`,
              created_by: user.id,
              org_id: (user as any).org_id,
              movement_date: financialMovementDate,
            },
            supabase
          )
        }
      } catch (bonusErr: any) {
        console.error("[BulkPayment API] ❌ Error registrando ganancia financiera:", bonusErr)
        errors.push(`Error registrando ganancia financiera: ${bonusErr?.message ?? String(bonusErr)}`)
      }
    }

    // Crear EXPENSE de costo financiero (comisión de la financiera)
    if (hasFinancialFee && processedPayments.length > 0) {
      try {
        const feeConcept = buildFinancialCostConcept(receipt_number)

        // El comprobante identifica la transferencia: dos lotes con el mismo
        // comprobante y la misma cuenta registran una sola comisión, que es lo
        // correcto —la financiera la cobró una vez.
        const { data: existingFee } = await (supabase.from("ledger_movements") as any)
          .select("id")
          .eq("org_id", (user as any).org_id)
          .eq("type", "EXPENSE")
          .eq("concept", feeConcept)
          .eq("account_id", financial_fee.account_id)
          .limit(1)

        if (existingFee && existingFee.length > 0) {
          errors.push("El costo financiero de este comprobante ya estaba registrado, se omitió")
        } else {
          await createLedgerMovement(
            buildFinancialCostMovement({
              orgId: (user as any).org_id,
              accountId: financial_fee.account_id,
              amountArs: financialFeeAmount,
              method: ledgerMethodForAccountType(feeAccount?.type),
              receiptNumber: receipt_number,
              paymentDate: financialMovementDate,
              paymentsCount: processedPayments.length,
              createdBy: user.id,
            }),
            supabase
          )
        }
      } catch (feeErr: any) {
        // Los pagos ya se aplicaron: fallar duro acá dejaría las deudas
        // canceladas y la respuesta en error. Se avisa con un mensaje que dice
        // exactamente qué quedó pendiente, porque la plata SÍ salió de la caja.
        console.error("[BulkPayment API] ❌ Error registrando costo financiero:", feeErr)
        errors.push(
          "Los pagos se registraron pero el costo financiero NO quedó asentado: cargalo a mano como gasto en la caja en pesos."
        )
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({
        success: true,
        processed: processedPayments,
        errors,
        warning: `Se procesaron ${processedPayments.length} de ${payments.length} pagos. Algunos tuvieron errores.`,
      })
    }

    return NextResponse.json({
      success: true,
      processed: processedPayments,
      message: `Se procesaron ${processedPayments.length} pago(s) correctamente`,
    })
  } catch (e: any) {
    console.error("Error in POST /api/accounting/operator-payments/bulk:", e)
    return NextResponse.json(
      { error: e?.message ?? "Error al procesar pagos masivos" },
      { status: 500 }
    )
  }
}
