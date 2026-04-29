/**
 * Backfill conservador de exchange_rate para cobranzas manuales de clientes
 * cobradas en USD sobre operaciones de venta en ARS.
 *
 * El script NO recrea movimientos contables. Solo completa `payments.exchange_rate`
 * y normaliza `amount_usd` cuando el tipo de cambio puede inferirse con seguridad
 * desde el ledger ya existente.
 *
 * Uso:
 *   npx tsx scripts/backfill-customer-income-exchange-rates.ts --dry-run
 *   npx tsx scripts/backfill-customer-income-exchange-rates.ts --dry-run --operation-id <id>
 *   npx tsx scripts/backfill-customer-income-exchange-rates.ts --apply --operation-id <id>
 */

import { createClient } from "@supabase/supabase-js"
import {
  coercePositiveNumber,
  getOperationSaleCurrency,
  requiresCustomerIncomeExchangeRate,
} from "../lib/payments/customer-income-fx"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const args = process.argv.slice(2)
const isApply = args.includes("--apply")
const isDryRun = !isApply || args.includes("--dry-run")
const operationIdIndex = args.indexOf("--operation-id")
const operationIdFilter = operationIdIndex >= 0 ? args[operationIdIndex + 1] : null

if (operationIdIndex >= 0 && !operationIdFilter) {
  console.error("Debe indicar un valor para --operation-id")
  process.exit(1)
}

if (args.includes("--apply") && args.includes("--dry-run")) {
  console.error("Use solo uno de estos flags: --apply o --dry-run")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

function roundRate(value: number): number {
  return Math.round(value * 10000) / 10000
}

async function main() {
  console.log(
    isDryRun
      ? "DRY RUN: no se actualizaran pagos.\n"
      : "Aplicando backfill de exchange_rate a pagos elegibles.\n"
  )

  let query = (supabase.from("payments") as any)
    .select(`
      id,
      operation_id,
      amount,
      currency,
      exchange_rate,
      amount_usd,
      date_paid,
      source,
      status,
      payer_type,
      direction,
      ledger_movement_id,
      operations:operation_id(
        id,
        file_code,
        destination,
        sale_currency,
        currency
      ),
      ledger_movements:ledger_movement_id(
        id,
        exchange_rate,
        amount_ars_equivalent
      )
    `)
    .eq("source", "MANUAL")
    .eq("status", "PAID")
    .eq("payer_type", "CUSTOMER")
    .eq("direction", "INCOME")
    .eq("currency", "USD")
    .not("operation_id", "is", null)
    .order("date_paid", { ascending: true })

  if (operationIdFilter) {
    query = query.eq("operation_id", operationIdFilter)
  }

  const { data: payments, error } = await query

  if (error) {
    throw new Error(`Error obteniendo pagos: ${error.message}`)
  }

  const rows = payments || []
  console.log(`Pagos analizados: ${rows.length}`)

  let eligible = 0
  let updated = 0
  let alreadyCorrect = 0
  let skipped = 0
  const reviewRows: Array<{ paymentId: string; operationId: string; reason: string }> = []

  for (const payment of rows) {
    const paymentData = payment as any
    const operation = paymentData.operations || null
    const ledgerMovement = paymentData.ledger_movements || null
    const saleCurrency = getOperationSaleCurrency(operation)

    const needsExchangeRate = requiresCustomerIncomeExchangeRate({
      payerType: paymentData.payer_type,
      direction: paymentData.direction,
      paymentCurrency: paymentData.currency,
      saleCurrency,
    })

    if (!needsExchangeRate) {
      continue
    }

    eligible++

    const existingExchangeRate = coercePositiveNumber(paymentData.exchange_rate)
    if (existingExchangeRate) {
      alreadyCorrect++
      console.log(
        `[OK] Pago ${paymentData.id} | Operacion ${paymentData.operation_id} | TC existente ${existingExchangeRate}`
      )
      continue
    }

    const amount = Number(paymentData.amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      skipped++
      reviewRows.push({
        paymentId: paymentData.id,
        operationId: paymentData.operation_id,
        reason: "Monto invalido para inferir TC",
      })
      continue
    }

    let inferredExchangeRate = coercePositiveNumber(ledgerMovement?.exchange_rate)
    let inferenceSource = inferredExchangeRate ? "ledger.exchange_rate" : ""

    if (!inferredExchangeRate) {
      const arsEquivalent = coercePositiveNumber(ledgerMovement?.amount_ars_equivalent)
      if (arsEquivalent) {
        inferredExchangeRate = roundRate(arsEquivalent / amount)
        inferenceSource = "ledger.amount_ars_equivalent / payment.amount"
      }
    }

    if (!inferredExchangeRate) {
      skipped++
      reviewRows.push({
        paymentId: paymentData.id,
        operationId: paymentData.operation_id,
        reason: "Sin ledger utilizable para inferir TC",
      })
      console.log(
        `[REVIEW] Pago ${paymentData.id} | Operacion ${paymentData.operation_id} | Sin TC inferible`
      )
      continue
    }

    console.log(
      `[FIX] Pago ${paymentData.id} | Operacion ${paymentData.operation_id} | File ${
        operation?.file_code || "-"
      } | TC ${inferredExchangeRate} (${inferenceSource})`
    )

    if (isDryRun) {
      updated++
      continue
    }

    const { error: updateError } = await (supabase.from("payments") as any)
      .update({
        exchange_rate: inferredExchangeRate,
        amount_usd: amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentData.id)

    if (updateError) {
      skipped++
      reviewRows.push({
        paymentId: paymentData.id,
        operationId: paymentData.operation_id,
        reason: `Error actualizando pago: ${updateError.message}`,
      })
      console.error(`[ERROR] Pago ${paymentData.id}: ${updateError.message}`)
      continue
    }

    updated++
  }

  console.log("\nResumen")
  console.log(`Elegibles: ${eligible}`)
  console.log(isDryRun ? `Detectados para actualizar: ${updated}` : `Actualizados: ${updated}`)
  console.log(`Ya correctos: ${alreadyCorrect}`)
  console.log(`Saltados / revision manual: ${skipped}`)

  if (reviewRows.length > 0) {
    console.log("\nCasos para revision manual:")
    reviewRows.forEach((row) => {
      console.log(`- Pago ${row.paymentId} | Operacion ${row.operationId} | ${row.reason}`)
    })
  }
}

main().catch((error) => {
  console.error("Fallo el backfill:", error)
  process.exit(1)
})
