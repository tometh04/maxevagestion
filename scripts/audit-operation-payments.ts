/**
 * Auditoria read-only de pagos y movimientos contables de una operacion.
 *
 * Uso:
 *   npx tsx scripts/audit-operation-payments.ts --operation-id <uuid>
 *   npx tsx scripts/audit-operation-payments.ts --file-code <codigo>
 *   npx tsx scripts/audit-operation-payments.ts --ref <fragmento>
 *   npx tsx scripts/audit-operation-payments.ts --ref 310d1f4f --json
 */

import { createClient } from "@supabase/supabase-js"
import {
  findPaymentCounterpartMovement,
  getPaymentCounterpartAccountCode,
} from "../lib/accounting/payment-counterparts"
import {
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
const operationId = readFlag("--operation-id")
const fileCode = readFlag("--file-code")
const ref = readFlag("--ref")
const jsonOutput = args.includes("--json")

if (!operationId && !fileCode && !ref) {
  console.error("Debe indicar --operation-id, --file-code o --ref")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

function readFlag(flag: string): string | null {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] || null : null
}

function formatAmount(amount: number | null | undefined, currency?: string | null): string {
  if (amount == null || Number.isNaN(Number(amount))) {
    return "-"
  }

  return `${currency || ""} ${Number(amount).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`.trim()
}

function formatDate(value?: string | null): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().slice(0, 10)
}

function summarizeAccount(account: any): string {
  if (!account) return "-"
  return `${account.name} (${account.currency || "?"}${account.type ? ` / ${account.type}` : ""})`
}

async function resolveOperation() {
  if (operationId) {
    const { data } = await (supabase.from("operations") as any)
      .select("id, file_code, destination, sale_amount_total, sale_currency, currency, updated_at")
      .eq("id", operationId)
      .maybeSingle()

    if (data) return data
  }

  if (fileCode) {
    const { data } = await (supabase.from("operations") as any)
      .select("id, file_code, destination, sale_amount_total, sale_currency, currency, updated_at")
      .eq("file_code", fileCode)
      .maybeSingle()

    if (data) return data
  }

  if (!ref) {
    return null
  }

  const normalizedRef = ref.replace(/^#/, "").trim().toLowerCase()

  const { data: byFileCode } = await (supabase.from("operations") as any)
    .select("id, file_code, destination, sale_amount_total, sale_currency, currency, updated_at")
    .ilike("file_code", `%${normalizedRef}%`)
    .order("updated_at", { ascending: false })
    .limit(20)

  if (byFileCode?.length === 1) {
    return byFileCode[0]
  }

  const { data: recentOperations, error } = await (supabase.from("operations") as any)
    .select("id, file_code, destination, sale_amount_total, sale_currency, currency, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500)

  if (error) {
    throw new Error(`Error buscando operaciones: ${error.message}`)
  }

  const prefixMatches = (recentOperations || []).filter((operation: any) => {
    return operation.id?.toLowerCase().startsWith(normalizedRef)
      || operation.file_code?.toLowerCase().includes(normalizedRef)
  })

  if (prefixMatches.length === 1) {
    return prefixMatches[0]
  }

  if (prefixMatches.length > 1) {
    console.error("Referencia ambigua. Coincidencias encontradas:")
    prefixMatches.slice(0, 10).forEach((operation: any) => {
      console.error(`- ${operation.file_code || "-"} | ${operation.id} | ${operation.destination || "-"}`)
    })
    process.exit(1)
  }

  return null
}

async function main() {
  const operation = await resolveOperation()

  if (!operation) {
    console.error("Operacion no encontrada con la referencia indicada")
    process.exit(1)
  }

  const saleCurrency = getOperationSaleCurrency(operation)

  const { data: payments, error: paymentsError } = await (supabase.from("payments") as any)
    .select(`
      id,
      operation_id,
      status,
      payer_type,
      direction,
      amount,
      currency,
      exchange_rate,
      amount_usd,
      method,
      reference,
      source,
      date_paid,
      date_due,
      ledger_movement_id,
      created_at,
      ledger_movements:ledger_movement_id(
        id,
        type,
        account_id,
        currency,
        amount_original,
        amount_ars_equivalent,
        exchange_rate,
        movement_date,
        created_at,
        notes,
        financial_accounts:account_id(id, name, currency, type)
      )
    `)
    .eq("operation_id", operation.id)
    .order("created_at", { ascending: true })

  if (paymentsError) {
    throw new Error(`Error obteniendo pagos: ${paymentsError.message}`)
  }

  const paymentIds = (payments || []).map((payment: any) => payment.id)

  const { data: cashMovements, error: cashError } = await (supabase.from("cash_movements") as any)
    .select(`
      id,
      payment_id,
      type,
      amount,
      currency,
      movement_date,
      notes,
      financial_account_id,
      financial_accounts:financial_account_id(id, name, currency, type)
    `)
    .in("payment_id", paymentIds.length > 0 ? paymentIds : ["00000000-0000-0000-0000-000000000000"])

  if (cashError) {
    throw new Error(`Error obteniendo cash_movements: ${cashError.message}`)
  }

  const { data: fxMovements, error: fxError } = await (supabase.from("ledger_movements") as any)
    .select("id, type, amount_original, amount_ars_equivalent, currency, created_at, notes")
    .eq("operation_id", operation.id)
    .in("type", ["FX_GAIN", "FX_LOSS"])
    .order("created_at", { ascending: true })

  if (fxError) {
    throw new Error(`Error obteniendo movimientos FX: ${fxError.message}`)
  }

  const cashByPaymentId = new Map<string, any[]>(
    (cashMovements || []).reduce((acc: Array<[string, any[]]>, movement: any) => {
      const existing = acc.find(([paymentId]) => paymentId === movement.payment_id)
      if (existing) {
        existing[1].push(movement)
      } else {
        acc.push([movement.payment_id, [movement]])
      }
      return acc
    }, [])
  )

  const paymentReports = []

  for (const payment of payments || []) {
    const mainMovement = payment.ledger_movements || null
    const counterpartAccountCode = getPaymentCounterpartAccountCode(payment.direction, payment.payer_type)
    const counterpartLookup = counterpartAccountCode
      ? await findPaymentCounterpartMovement({
          supabase,
          paymentId: payment.id,
          operationId: payment.operation_id,
          direction: payment.direction,
          payerType: payment.payer_type,
          currency: payment.currency,
          amount: Number(payment.amount || 0),
          reference: payment.reference || null,
          datePaid: payment.date_paid || null,
          selectedFinancialAccountId: mainMovement?.account_id || null,
          excludeLedgerMovementId: payment.ledger_movement_id || null,
        })
      : { accountId: null, markerCandidates: [], matchedCandidate: null }

    const warnings: string[] = []

    if (
      requiresCustomerIncomeExchangeRate({
        payerType: payment.payer_type,
        direction: payment.direction,
        paymentCurrency: payment.currency,
        saleCurrency,
      }) &&
      !payment.exchange_rate
    ) {
      warnings.push("Falta exchange_rate para una cobranza cross-currency")
    }

    if (payment.status === "PAID" && !mainMovement) {
      warnings.push("Pago PAID sin ledger principal")
    }

    const paymentCashMovements = cashByPaymentId.get(payment.id) || []
    if (payment.status === "PAID" && paymentCashMovements.length === 0) {
      warnings.push("Pago PAID sin cash_movement")
    }

    if (payment.status === "PAID" && counterpartAccountCode && !counterpartLookup.matchedCandidate) {
      warnings.push("Pago PAID sin contramovimiento CxC/CxP")
    }

    if (paymentCashMovements.some((movement) => !movement.financial_account_id)) {
      warnings.push("Hay cash_movement sin financial_account_id")
    }

    paymentReports.push({
      id: payment.id,
      status: payment.status,
      payer_type: payment.payer_type,
      direction: payment.direction,
      amount: Number(payment.amount || 0),
      currency: payment.currency,
      exchange_rate: payment.exchange_rate,
      amount_usd: payment.amount_usd,
      method: payment.method,
      reference: payment.reference,
      source: payment.source,
      date_paid: payment.date_paid,
      main_ledger: mainMovement
        ? {
            id: mainMovement.id,
            account: summarizeAccount(mainMovement.financial_accounts),
            amount_original: Number(mainMovement.amount_original || 0),
            amount_ars_equivalent: Number(mainMovement.amount_ars_equivalent || 0),
            exchange_rate: mainMovement.exchange_rate,
            movement_date: mainMovement.movement_date,
          }
        : null,
      counterpart_ledger: counterpartLookup.matchedCandidate,
      cash_movements: paymentCashMovements.map((movement) => ({
        id: movement.id,
        account: summarizeAccount(movement.financial_accounts),
        amount: Number(movement.amount || 0),
        currency: movement.currency,
        movement_date: movement.movement_date,
      })),
      warnings,
    })
  }

  const report = {
    operation: {
      id: operation.id,
      file_code: operation.file_code,
      destination: operation.destination,
      sale_amount_total: Number(operation.sale_amount_total || 0),
      sale_currency: saleCurrency,
      legacy_currency: operation.currency || null,
    },
    fx_movements: (fxMovements || []).map((movement: any) => ({
      id: movement.id,
      type: movement.type,
      amount_original: Number(movement.amount_original || 0),
      amount_ars_equivalent: Number(movement.amount_ars_equivalent || 0),
      currency: movement.currency,
      created_at: movement.created_at,
      notes: movement.notes,
    })),
    payments: paymentReports,
  }

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  console.log(`Operacion: ${operation.file_code || "-"} | ${operation.id}`)
  console.log(`Destino: ${operation.destination || "-"}`)
  console.log(`Venta: ${formatAmount(Number(operation.sale_amount_total || 0), saleCurrency)}`)
  console.log("")

  if ((fxMovements || []).length > 0) {
    console.log("Movimientos FX:")
    ;(fxMovements || []).forEach((movement: any) => {
      console.log(
        `- ${movement.type} | ${formatAmount(Number(movement.amount_original || 0), movement.currency)} | ${formatDate(movement.created_at)}`
      )
    })
    console.log("")
  }

  console.log(`Pagos: ${(paymentReports || []).length}`)
  paymentReports.forEach((payment: any) => {
    console.log(
      `- ${payment.id} | ${payment.status} | ${payment.payer_type}/${payment.direction} | ${formatAmount(payment.amount, payment.currency)}`
    )
    console.log(
      `  Metodo: ${payment.method || "-"} | TC: ${payment.exchange_rate || "-"} | Pago: ${formatDate(payment.date_paid)} | Ref: ${payment.reference || "-"}`
    )
    console.log(
      `  Ledger principal: ${payment.main_ledger ? `${payment.main_ledger.id} -> ${payment.main_ledger.account}` : "NO"}`
    )
    console.log(
      `  Contramovimiento: ${payment.counterpart_ledger ? `${payment.counterpart_ledger.id} -> ${payment.counterpart_ledger.account_id}` : "NO"}`
    )
    console.log(
      `  Caja: ${payment.cash_movements.length > 0 ? payment.cash_movements.map((movement: any) => `${movement.id} -> ${movement.account}`).join(" | ") : "NO"}`
    )
    if (payment.warnings.length > 0) {
      console.log(`  Warnings: ${payment.warnings.join(" | ")}`)
    }
    console.log("")
  })
}

main().catch((error) => {
  console.error("Fallo la auditoria:", error)
  process.exit(1)
})
