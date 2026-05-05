import { parseCsv } from "../csv-parser"
import { mapHeaders } from "../header-mapper"
import { validateRequiredFields } from "../validator"
import {
  resolveCustomer,
  resolveOperator,
  resolveSeller,
} from "../resolver"
import { executeInsert, executeRollback } from "../executor"
import {
  parseAmount,
  parseDate,
  normalizeCurrency,
  normalizeStatus,
} from "../normalizer"
import { createExchangeRateResolver } from "../exchange-rate-resolver"
import type {
  PipelineFn,
  ImportError,
  ImportWarning,
  RollbackEntry,
} from "../types"

const SCHEMA = {
  file_code: ["codigo", "file_code"],
  operation_date: ["fecha_operacion", "fecha_de_operacion", "operation_date"],
  customer_name: ["nombre_cliente", "nombre_del_cliente", "cliente"],
  customer_email: ["email_cliente", "email"],
  destination: ["destino"],
  departure_date: ["fecha_salida", "salida"],
  return_date: ["fecha_regreso", "regreso"],
  adults: ["adultos"],
  children: ["ninos"],
  sale_amount: ["monto_venta", "venta"],
  amount_collected: ["monto_cobrado", "cobrado"],
  amount_pending: ["pendiente_de_cobrar", "pendiente_cobrar"],
  amount_paid_to_operator: ["pagado_a_operador", "pagado_operador"],
  amount_pending_to_operator: ["pendiente_a_operador", "pendiente_operador"],
  operator_1: ["operador_1"],
  cost_operator_1: ["costo_operador_1"],
  operator_2: ["operador_2"],
  cost_operator_2: ["costo_operador_2"],
  operator_3: ["operador_3"],
  cost_operator_3: ["costo_operador_3"],
  currency: ["moneda", "currency"],
  status: ["estado", "status"],
  seller_name: ["nombre_vendedor", "vendedor"],
}

const REQUIRED = [
  "operation_date",
  "customer_name",
  "destination",
  "departure_date",
  "sale_amount",
  "currency",
]

function generateFileCode(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `OP-${date}-${rand}`
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: "" }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}

export const operationsMasterPipeline: PipelineFn = async (
  supabase,
  csvContent,
  config,
  options = {}
) => {
  const dryRun = options.dryRun ?? false
  const errors: ImportError[] = []
  const warnings: ImportWarning[] = []
  const rollbackLog: RollbackEntry[] = []

  const rows = parseCsv(csvContent)
  if (rows.length < 2) {
    return {
      totalRows: 0,
      successRows: 0,
      errorRows: 0,
      warningRows: 0,
      errors,
      warnings,
      rollbackLog,
      previewSummary: {},
    }
  }

  const [headers, ...dataRows] = rows
  const colMap = mapHeaders(headers, SCHEMA)
  const fxResolver = createExchangeRateResolver(supabase, config.exchangeRate)

  let successRows = 0
  let customersCreated = 0
  let operatorsCreated = 0
  let operationsCreated = 0
  let paymentsCreated = 0

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2
    const rawRow = dataRows[i]
    const row: Record<string, string> = {}
    colMap.forEach((field, idx) => {
      row[field] = rawRow[idx]?.trim() ?? ""
    })

    // Pendientes 1.5 — atomicidad row-level. Cada iteración acumula sus
    // inserts en `rowRollback`. Si la fila completa termina OK, pusheamos
    // a `rollbackLog` global. Si falla a mitad (ej. operation insert dies
    // tras customer/operators creados), llamamos executeRollback ANTES de
    // hacer continue para no dejar registros parciales en la DB.
    const rowRollback: RollbackEntry[] = []
    const abortRow = async (msg: string, err?: string) => {
      errors.push({
        rowNumber,
        message: err ? `${msg}: ${err}` : msg,
      })
      if (rowRollback.length > 0 && !dryRun) {
        const rb = await executeRollback(supabase, rowRollback)
        if (rb.failed > 0) {
          warnings.push({
            rowNumber,
            message: `Rollback parcial: ${rb.deleted} ok, ${rb.failed} fallaron al borrar — quedaron registros huérfanos`,
          })
        }
      }
    }

    const reqErrors = validateRequiredFields(row, REQUIRED)
    if (reqErrors.length > 0) {
      reqErrors.forEach(e =>
        errors.push({ rowNumber, field: e.field, message: e.message })
      )
      continue
    }

    const opDate = parseDate(row.operation_date)
    const departureDate = parseDate(row.departure_date)
    if (!opDate || !departureDate) {
      errors.push({ rowNumber, message: "Fechas inválidas" })
      continue
    }
    const returnDate = row.return_date ? parseDate(row.return_date) : null

    const currency = normalizeCurrency(row.currency)
    if (!currency) {
      errors.push({ rowNumber, message: "Currency inválida" })
      continue
    }

    const status =
      normalizeStatus(row.status) ?? config.defaultStatus ?? "CONFIRMED"

    const saleAmountRaw = parseAmount(row.sale_amount)
    if (saleAmountRaw === null || saleAmountRaw < 0) {
      errors.push({ rowNumber, field: "sale_amount", message: "Monto venta inválido" })
      continue
    }

    // Conversión a ARS si es USD
    let fxRate = 1
    if (currency === "USD") {
      fxRate = await fxResolver(opDate)
    }
    const saleAmountArs = saleAmountRaw * fxRate

    // ─── Cliente ─────────────────────────────────
    const { firstName, lastName } = splitName(row.customer_name)
    let customer = await resolveCustomer(supabase, config.agencyId, {
      email: row.customer_email,
      name: { firstName, lastName },
    })

    if (!customer && !dryRun) {
      const inserted = await executeInsert(
        supabase,
        "customers",
        {
          agency_id: config.agencyId,
          first_name: firstName,
          last_name: lastName,
          phone: "",
          email: row.customer_email || null,
        },
        rowRollback
      )
      if (inserted?.id) {
        customer = { id: inserted.id }
        customersCreated++
      }
    } else if (!customer && dryRun) {
      customersCreated++
    }

    // ─── Operadores (hasta 3) ────────────────────
    const operatorEntries: Array<{ id: string; cost: number }> = []
    for (let opIdx = 1; opIdx <= 3; opIdx++) {
      const opName = row[`operator_${opIdx}`]
      if (!opName) continue

      const costRaw = parseAmount(row[`cost_operator_${opIdx}`] ?? "") ?? 0
      const costArs = currency === "USD" ? costRaw * fxRate : costRaw

      let operator = await resolveOperator(supabase, config.agencyId, opName)
      if (!operator && !dryRun) {
        const inserted = await executeInsert(
          supabase,
          "operators",
          { agency_id: config.agencyId, name: opName },
          rowRollback
        )
        if (inserted?.id) {
          operator = { id: inserted.id }
          operatorsCreated++
        }
      } else if (!operator && dryRun) {
        operatorsCreated++
      }

      if (operator) {
        operatorEntries.push({ id: operator.id, cost: costArs })
      }
    }

    const totalOperatorCost = operatorEntries.reduce((s, e) => s + e.cost, 0)
    const marginAmount = saleAmountArs - totalOperatorCost
    const marginPercentage =
      saleAmountArs > 0 ? (marginAmount / saleAmountArs) * 100 : 0

    // Vendedor (opcional)
    const seller = row.seller_name
      ? await resolveSeller(supabase, config.agencyId, { name: row.seller_name })
      : null

    if (!seller && row.seller_name) {
      warnings.push({ rowNumber, message: `Vendedor no encontrado: ${row.seller_name}` })
    }

    // ─── Operación ───────────────────────────────
    const fileCode = row.file_code || generateFileCode()
    let operation: { id: string } | { error: string } | null = null

    if (!dryRun) {
      operation = await executeInsert(
        supabase,
        "operations",
        {
          agency_id: config.agencyId,
          file_code: fileCode,
          seller_id: seller?.id ?? null,
          type: "PACKAGE",
          product_type: "PAQUETE",
          destination: row.destination,
          departure_date: departureDate.toISOString().slice(0, 10),
          return_date: returnDate ? returnDate.toISOString().slice(0, 10) : null,
          adults: row.adults ? parseInt(row.adults) : 1,
          children: row.children ? parseInt(row.children) : 0,
          infants: 0,
          status,
          operation_date: opDate.toISOString().slice(0, 10),
          sale_amount_total: saleAmountArs,
          operator_cost: totalOperatorCost,
          currency: "ARS",
          sale_currency: "ARS",
          operator_cost_currency: "ARS",
          margin_amount: marginAmount,
          margin_percentage: marginPercentage,
        },
        rowRollback
      )
      if (!operation || !("id" in operation)) {
        const errMsg = operation && "error" in operation ? operation.error : "sin detalle"
        await abortRow("Falló insert operation (DB)", errMsg)
        continue
      }
      const operationId = operation.id
      operationsCreated++

      // Vincular cliente
      if (customer) {
        await executeInsert(
          supabase,
          "operation_customers",
          {
            operation_id: operationId,
            customer_id: customer.id,
            role: "MAIN",
          },
          rowRollback
        )
      }

      // Vincular operadores
      for (const oe of operatorEntries) {
        await executeInsert(
          supabase,
          "operation_operators",
          {
            operation_id: operationId,
            operator_id: oe.id,
            cost: oe.cost,
            product_type: "PAQUETE",
          },
          rowRollback
        )
      }
    } else {
      operationsCreated++
    }

    // ─── Payments ────────────────────────────────
    const collected = parseAmount(row.amount_collected ?? "") ?? 0
    const pendingCollected = parseAmount(row.amount_pending ?? "") ?? 0
    const totalPaidToOps = parseAmount(row.amount_paid_to_operator ?? "") ?? 0
    const totalPendingToOps = parseAmount(row.amount_pending_to_operator ?? "") ?? 0

    const collectedArs = currency === "USD" ? collected * fxRate : collected
    const pendingCollectedArs = currency === "USD" ? pendingCollected * fxRate : pendingCollected

    // Helper: operationId queda en undefined en dryRun. Las inserciones de
    // payments lo usan; sólo se ejecutan si operationId está set (post-guard).
    const operationId = operation && "id" in operation ? operation.id : undefined

    if (collectedArs > 0 && operationId && !dryRun) {
      await executeInsert(
        supabase,
        "payments",
        {
          agency_id: config.agencyId,
          operation_id: operationId,
          amount: collectedArs,
          currency: "ARS",
          direction: "INCOME",
          payer_type: "CUSTOMER",
          method: "TRANSFER",
          date_due: opDate.toISOString().slice(0, 10),
          date_paid: opDate.toISOString().slice(0, 10),
          status: "PAID",
        },
        rowRollback
      )
      paymentsCreated++
    } else if (collectedArs > 0) {
      paymentsCreated++
    }

    if (pendingCollectedArs > 0 && operation && !dryRun) {
      await executeInsert(
        supabase,
        "payments",
        {
          agency_id: config.agencyId,
          operation_id: operationId,
          amount: pendingCollectedArs,
          currency: "ARS",
          direction: "INCOME",
          payer_type: "CUSTOMER",
          method: "TRANSFER",
          date_due: departureDate.toISOString().slice(0, 10),
          status: "PENDING",
        },
        rowRollback
      )
      paymentsCreated++
    } else if (pendingCollectedArs > 0) {
      paymentsCreated++
    }

    // Distribuir paid/pending entre operadores proporcional al cost
    if (totalOperatorCost > 0 && operatorEntries.length > 0) {
      for (const oe of operatorEntries) {
        const ratio = oe.cost / totalOperatorCost
        const paid = totalPaidToOps * (currency === "USD" ? fxRate : 1) * ratio
        const pending = totalPendingToOps * (currency === "USD" ? fxRate : 1) * ratio

        if (paid > 0 && operation && !dryRun) {
          await executeInsert(
            supabase,
            "payments",
            {
              agency_id: config.agencyId,
              operation_id: operationId,
              amount: paid,
              currency: "ARS",
              direction: "EXPENSE",
              payer_type: "OPERATOR",
              method: "TRANSFER",
              date_due: opDate.toISOString().slice(0, 10),
              date_paid: opDate.toISOString().slice(0, 10),
              status: "PAID",
            },
            rowRollback
          )
          paymentsCreated++
        } else if (paid > 0) {
          paymentsCreated++
        }

        if (pending > 0 && operation && !dryRun) {
          await executeInsert(
            supabase,
            "payments",
            {
              agency_id: config.agencyId,
              operation_id: operationId,
              amount: pending,
              currency: "ARS",
              direction: "EXPENSE",
              payer_type: "OPERATOR",
              method: "TRANSFER",
              date_due: departureDate.toISOString().slice(0, 10),
              status: "PENDING",
            },
            rowRollback
          )
          paymentsCreated++
        } else if (pending > 0) {
          paymentsCreated++
        }
      }
    }

    // Fila terminó OK — promovemos sus inserts al log global para que
    // un rollback total post-import también borre estos.
    rollbackLog.push(...rowRollback)
    successRows++
  }

  return {
    totalRows: dataRows.length,
    successRows,
    errorRows: errors.length,
    warningRows: warnings.length,
    errors,
    warnings,
    rollbackLog,
    previewSummary: {
      customersToCreate: customersCreated,
      operatorsToCreate: operatorsCreated,
      operationsToCreate: operationsCreated,
      paymentsToCreate: paymentsCreated,
    },
  }
}
