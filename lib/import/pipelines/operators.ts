import { parseCsv } from "../csv-parser"
import { mapHeaders } from "../header-mapper"
import { validateRequiredFields, validateEmailFormat } from "../validator"
import { resolveOperator } from "../resolver"
import { executeInsert } from "../executor"
import { parseAmount } from "../normalizer"
import type {
  PipelineFn,
  ImportResult,
  ImportError,
  ImportWarning,
  RollbackEntry,
} from "../types"

const SCHEMA = {
  name: ["nombre", "name", "operador"],
  contact_name: ["contacto", "contact_name", "nombre_contacto"],
  contact_email: ["email_contacto", "contact_email"],
  contact_phone: ["telefono_contacto", "contact_phone"],
  credit_limit: ["limite_credito", "credit_limit"],
}

const REQUIRED = ["name"]

export const operatorsPipeline: PipelineFn = async (
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
  let warningRows = 0

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2
    const rawRow = dataRows[i]
    const row: Record<string, string> = {}
    colMap.forEach((field, idx) => {
      row[field] = rawRow[idx]?.trim() ?? ""
    })

    const requiredErrors = validateRequiredFields(row, REQUIRED)
    if (requiredErrors.length > 0) {
      requiredErrors.forEach(e =>
        errors.push({ rowNumber, field: e.field, message: e.message })
      )
      continue
    }

    const emailError = validateEmailFormat(row.contact_email ?? "")
    if (emailError) warnings.push({ rowNumber, message: emailError })

    const existing = await resolveOperator(supabase, config.agencyId, row.name)
    if (existing) {
      warnings.push({ rowNumber, message: `Operador ya existía: ${row.name}` })
      warningRows++
      continue
    }

    if (dryRun) {
      successRows++
      continue
    }

    const credit = row.credit_limit ? parseAmount(row.credit_limit) : null
    const inserted = await executeInsert(
      supabase,
      "operators",
      {
        agency_id: config.agencyId,
        name: row.name,
        contact_name: row.contact_name || null,
        contact_email: row.contact_email || null,
        contact_phone: row.contact_phone || null,
        credit_limit: credit,
      },
      rollbackLog
    )

    if (inserted?.id) successRows++
    else errors.push({
      rowNumber,
      message: `Falló insert (DB): ${inserted?.error ?? "sin detalle"}`,
    })
  }

  return {
    totalRows: dataRows.length,
    successRows,
    errorRows: errors.length,
    warningRows,
    errors,
    warnings,
    rollbackLog,
    previewSummary: { operatorsToCreate: successRows },
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
