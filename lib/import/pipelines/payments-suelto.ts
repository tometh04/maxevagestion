import { parseCsv } from "../csv-parser"
import { mapHeaders } from "../header-mapper"
import { validateRequiredFields } from "../validator"
import { resolveOperationByFileCode } from "../resolver"
import { executeInsert } from "../executor"
import { parseAmount, parseDate, normalizeCurrency } from "../normalizer"
import type {
  PipelineFn,
  ImportResult,
  ImportError,
  ImportWarning,
  RollbackEntry,
} from "../types"

const SCHEMA = {
  operation_file_code: ["codigo_operacion", "codigo", "operation_file_code", "file_code"],
  amount: ["monto", "amount"],
  currency: ["moneda", "currency"],
  date_due: ["fecha_vencimiento", "fecha_venc", "date_due"],
  date_paid: ["fecha_pago", "date_paid"],
  direction: ["direccion", "direction", "tipo"],
  method: ["metodo", "method"],
  reference: ["referencia", "reference"],
}

const REQUIRED = ["operation_file_code", "amount", "currency", "date_due", "direction"]

export const paymentsSueltoPipeline: PipelineFn = async (
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
    return emptyResult({ errors, warnings, rollbackLog })
  }

  const [headers, ...dataRows] = rows
  const colMap = mapHeaders(headers, SCHEMA)
  let successRows = 0

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2
    const rawRow = dataRows[i]
    const row: Record<string, string> = {}
    colMap.forEach((field, idx) => {
      row[field] = rawRow[idx]?.trim() ?? ""
    })

    const reqErrors = validateRequiredFields(row, REQUIRED)
    if (reqErrors.length > 0) {
      reqErrors.forEach(e =>
        errors.push({ rowNumber, field: e.field, message: e.message })
      )
      continue
    }

    // Resolver operación SCOPED a la agencia (defensa en profundidad)
    const operation = await resolveOperationByFileCode(
      supabase,
      config.agencyId,
      row.operation_file_code
    )
    if (!operation) {
      errors.push({
        rowNumber,
        message: `Operación no encontrada en esta agencia: ${row.operation_file_code}`,
      })
      continue
    }

    const amount = parseAmount(row.amount)
    if (amount === null || amount < 0) {
      errors.push({ rowNumber, field: "amount", message: "Monto inválido" })
      continue
    }

    const currency = normalizeCurrency(row.currency)
    if (!currency) {
      errors.push({ rowNumber, field: "currency", message: "Currency inválida" })
      continue
    }

    const direction = row.direction.toUpperCase()
    if (direction !== "INCOME" && direction !== "EXPENSE") {
      errors.push({
        rowNumber,
        field: "direction",
        message: "Direction debe ser INCOME o EXPENSE",
      })
      continue
    }

    const dateDue = parseDate(row.date_due)
    if (!dateDue) {
      errors.push({ rowNumber, field: "date_due", message: "Fecha vencimiento inválida" })
      continue
    }
    const datePaid = row.date_paid ? parseDate(row.date_paid) : null

    if (dryRun) {
      successRows++
      continue
    }

    const inserted = await executeInsert(
      supabase,
      "payments",
      {
        agency_id: config.agencyId,
        operation_id: operation.id,
        amount,
        currency,
        direction,
        payer_type: direction === "INCOME" ? "CUSTOMER" : "OPERATOR",
        method: row.method || "TRANSFER",
        date_due: dateDue.toISOString().slice(0, 10),
        date_paid: datePaid ? datePaid.toISOString().slice(0, 10) : null,
        status: datePaid ? "PAID" : "PENDING",
        reference: row.reference || null,
      },
      rollbackLog
    )

    if (inserted?.id) successRows++
    else errors.push({
      rowNumber,
      message: `Falló insert payment (DB): ${inserted?.error ?? "sin detalle"}`,
    })
  }

  return {
    totalRows: dataRows.length,
    successRows,
    errorRows: errors.length,
    warningRows: warnings.length,
    errors,
    warnings,
    rollbackLog,
    previewSummary: { paymentsToCreate: successRows },
  }
}

function emptyResult(partial: Partial<ImportResult>): ImportResult {
  return {
    totalRows: 0,
    successRows: 0,
    errorRows: 0,
    warningRows: 0,
    errors: [],
    warnings: [],
    rollbackLog: [],
    previewSummary: {},
    ...partial,
  }
}
