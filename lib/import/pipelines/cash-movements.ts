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
  date: ["fecha", "date"],
  type: ["tipo", "type"],
  amount: ["monto", "amount"],
  currency: ["moneda", "currency"],
  account_name: ["cuenta", "account_name"],
  category: ["categoria", "category"],
  notes: ["notas", "notes"],
  operation_file_code: ["codigo_operacion", "operation_file_code"],
}

const REQUIRED = ["date", "type", "amount", "currency"]

export const cashMovementsPipeline: PipelineFn = async (
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
      reqErrors.forEach(e => errors.push({ rowNumber, field: e.field, message: e.message }))
      continue
    }

    const type = row.type.toUpperCase()
    if (type !== "INCOME" && type !== "EXPENSE") {
      errors.push({ rowNumber, field: "type", message: "Type debe ser INCOME o EXPENSE" })
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

    const movementDate = parseDate(row.date)
    if (!movementDate) {
      errors.push({ rowNumber, field: "date", message: "Fecha inválida" })
      continue
    }

    let operationId: string | null = null
    if (row.operation_file_code) {
      const op = await resolveOperationByFileCode(supabase, config.agencyId, row.operation_file_code)
      if (op) operationId = op.id
      else warnings.push({ rowNumber, message: `Operación no encontrada: ${row.operation_file_code}` })
    }

    if (dryRun) {
      successRows++
      continue
    }

    const inserted = await executeInsert(
      supabase,
      "cash_movements",
      {
        agency_id: config.agencyId,
        type,
        amount,
        currency,
        movement_date: movementDate.toISOString().slice(0, 10),
        category: row.category || (type === "INCOME" ? "SALE" : "OTHER"),
        notes: row.notes || null,
        operation_id: operationId,
      },
      rollbackLog
    )

    if (inserted) successRows++
    else errors.push({ rowNumber, message: "Falló insert cash_movement (DB)" })
  }

  return {
    totalRows: dataRows.length,
    successRows,
    errorRows: errors.length,
    warningRows: warnings.length,
    errors,
    warnings,
    rollbackLog,
    previewSummary: { cashMovementsToCreate: successRows },
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
