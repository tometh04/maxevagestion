import { parseCsv } from "../csv-parser"
import { mapHeaders } from "../header-mapper"
import { validateRequiredFields, validateEmailFormat } from "../validator"
import { resolveCustomer } from "../resolver"
import { executeInsert } from "../executor"
import type {
  PipelineFn,
  ImportResult,
  ImportError,
  ImportWarning,
  RollbackEntry,
} from "../types"

const SCHEMA = {
  first_name: ["nombre", "first_name"],
  last_name: ["apellido", "last_name"],
  phone: ["telefono", "phone"],
  email: ["email"],
  document_number: ["dni", "document_number", "numero_documento", "numero_de_documento"],
  document_type: ["tipo_documento", "document_type", "tipo_de_documento"],
}

const REQUIRED = ["first_name", "last_name", "phone"]

export const customersPipeline: PipelineFn = async (
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
    const rowNumber = i + 2 // +2 = +1 for header row, +1 for 1-indexed
    const rawRow = dataRows[i]
    const row: Record<string, string> = {}
    colMap.forEach((field, idx) => {
      row[field] = rawRow[idx]?.trim() ?? ""
    })

    // Validaciones
    const requiredErrors = validateRequiredFields(row, REQUIRED)
    if (requiredErrors.length > 0) {
      requiredErrors.forEach(e =>
        errors.push({ rowNumber, field: e.field, message: e.message })
      )
      continue
    }

    const emailError = validateEmailFormat(row.email ?? "")
    if (emailError) {
      warnings.push({ rowNumber, message: emailError })
    }

    // Dedupe scopeado al agency
    const existing = await resolveCustomer(supabase, config.agencyId, {
      documentNumber: row.document_number,
      email: row.email,
      name:
        row.first_name && row.last_name
          ? { firstName: row.first_name, lastName: row.last_name }
          : undefined,
    })

    if (existing) {
      warnings.push({
        rowNumber,
        message: `Cliente ya existía: ${row.first_name} ${row.last_name}`,
      })
      warningRows++
      continue
    }

    if (dryRun) {
      successRows++
      continue
    }

    const inserted = await executeInsert(
      supabase,
      "customers",
      {
        agency_id: config.agencyId,
        first_name: row.first_name,
        last_name: row.last_name,
        phone: row.phone,
        email: row.email || null,
        document_number: row.document_number || null,
        document_type: row.document_type || null,
      },
      rollbackLog
    )

    if (inserted) {
      successRows++
    } else {
      errors.push({ rowNumber, message: "Falló insert (DB)" })
    }
  }

  return {
    totalRows: dataRows.length,
    successRows,
    errorRows: errors.length,
    warningRows,
    errors,
    warnings,
    rollbackLog,
    previewSummary: {
      customersToCreate: successRows,
    },
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
