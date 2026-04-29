import { parseCsv } from "../csv-parser"
import { mapHeaders } from "../header-mapper"
import { validateRequiredFields, validateEmailFormat } from "../validator"
import { createAdminClient } from "@/lib/supabase/server"
import type {
  PipelineFn,
  ImportResult,
  ImportError,
  ImportWarning,
  RollbackEntry,
} from "../types"

const SCHEMA = {
  name:     ["nombre", "name"],
  email:    ["email"],
  role:     ["rol", "role"],
  commission: ["comision", "commission", "comisión", "default_commission_percentage"],
  password: ["password", "contraseña"],
}

const REQUIRED = ["name", "email", "role", "password"]

const VALID_ROLES = ["SUPER_ADMIN", "ADMIN", "CONTABLE", "SELLER", "VIEWER"] as const

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

export const usersPipeline: PipelineFn = async (
  _supabase,
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

  // We always need admin client for auth.admin operations
  const admin = createAdminClient()

  let successRows = 0
  let orgId: string | null = null

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2
    const rawRow = dataRows[i]
    const row: Record<string, string> = {}
    colMap.forEach((field, idx) => {
      row[field] = rawRow[idx]?.trim() ?? ""
    })

    // --- Validations ---
    const requiredErrors = validateRequiredFields(row, REQUIRED)
    if (requiredErrors.length > 0) {
      requiredErrors.forEach(e =>
        errors.push({ rowNumber, field: e.field, message: e.message })
      )
      continue
    }

    const emailError = validateEmailFormat(row.email)
    if (emailError) {
      errors.push({ rowNumber, field: "email", message: emailError })
      continue
    }

    if (row.password.length < 6) {
      errors.push({ rowNumber, field: "password", message: "La contraseña debe tener al menos 6 caracteres" })
      continue
    }

    const commissionRaw = row.commission ? parseFloat(row.commission) : 0
    const commission = isNaN(commissionRaw) ? 0 : commissionRaw
    if (commission < 0 || commission > 100) {
      errors.push({ rowNumber, field: "commission", message: "La comisión debe estar entre 0 y 100" })
      continue
    }

    const roleInput = row.role?.toUpperCase()
    const role = VALID_ROLES.includes(roleInput as any) ? roleInput : "SELLER"
    if (!VALID_ROLES.includes(roleInput as any)) {
      warnings.push({ rowNumber, message: `Rol "${row.role}" inválido, se usará SELLER` })
    }

    if (dryRun) {
      successRows++
      continue
    }

    // --- Resolve org_id from agency (cached) ---
    if (!orgId) {
      const { data: agencyData, error: agencyError } = await (admin.from("agencies" as any) as any)
        .select("org_id")
        .eq("id", config.agencyId)
        .maybeSingle()

      if (agencyError || !agencyData) {
        errors.push({ rowNumber, message: `No se pudo obtener org_id de la agencia: ${agencyError?.message ?? "no encontrada"}` })
        continue
      }
      orgId = agencyData.org_id
    }

    // --- Resolve or create auth user ---
    let authId: string

    // Try to find existing auth user by email
    const { data: existingAuthUser, error: getUserError } = await (admin.auth.admin as any).getUserByEmail(row.email)

    if (!getUserError && existingAuthUser?.user) {
      authId = existingAuthUser.user.id
    } else {
      // Create new auth user
      const { data: createData, error: createError } = await admin.auth.admin.createUser({
        email: row.email,
        password: row.password,
        email_confirm: true,
        user_metadata: { full_name: row.name },
      })

      if (createError || !createData?.user) {
        errors.push({ rowNumber, field: "email", message: `Error creando usuario auth: ${createError?.message ?? "desconocido"}` })
        continue
      }
      authId = createData.user.id
    }

    // --- Resolve or create public users record ---
    const { data: existingUser } = await (admin.from("users" as any) as any)
      .select("id")
      .eq("auth_id", authId)
      .maybeSingle()

    let publicUserId: string

    if (existingUser) {
      publicUserId = existingUser.id
      // Update commission if needed
      await (admin.from("users" as any) as any)
        .update({ default_commission_percentage: commission })
        .eq("id", publicUserId)
    } else {
      const { data: newUser, error: userInsertError } = await (admin.from("users" as any) as any)
        .insert({
          auth_id: authId,
          org_id: orgId,
          name: row.name,
          email: row.email,
          role,
          default_commission_percentage: commission,
        })
        .select("id")
        .single()

      if (userInsertError || !newUser) {
        errors.push({ rowNumber, message: `Error insertando en users: ${userInsertError?.message ?? "desconocido"}` })
        continue
      }

      publicUserId = newUser.id
      rollbackLog.push({ table: "users", id: publicUserId })
    }

    // --- Link to agency via user_agencies (ON CONFLICT DO NOTHING) ---
    const { error: linkError } = await (admin.from("user_agencies" as any) as any)
      .upsert(
        { user_id: publicUserId, agency_id: config.agencyId },
        { onConflict: "user_id,agency_id", ignoreDuplicates: true }
      )

    if (linkError) {
      warnings.push({ rowNumber, message: `No se pudo vincular a la agencia: ${linkError.message}` })
    }

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
      usersToCreate: successRows,
    },
  }
}
