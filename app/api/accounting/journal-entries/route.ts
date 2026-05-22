import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions, assertPermission } from "@/lib/permissions-agency"
import {
  listJournalEntries,
  createJournalEntry,
  validateJournalBalance,
  type JournalEntrySource,
  type JournalEntryLine,
} from "@/lib/accounting/journal-entries"

/**
 * GET /api/accounting/journal-entries
 * Lista asientos contables con filtros
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    const perms = (user as any).org_id
      ? await resolveUserPermissions(supabase as any, user.id, (user as any).org_id, user.role, agencyIds)
      : null
    if (!assertPermission(user.role, perms, "accounting", "read")) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)

    const result = await listJournalEntries(supabase, {
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      dateType: searchParams.get("dateType") || undefined,
      source: (searchParams.get("source") as JournalEntrySource | "ALL") || "ALL",
      operationId: searchParams.get("operationId") || undefined,
      search: searchParams.get("search") || undefined,
      limit: parseInt(searchParams.get("limit") || "50"),
      offset: parseInt(searchParams.get("offset") || "0"),
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error en GET /api/accounting/journal-entries:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/accounting/journal-entries
 * Crear un asiento contable manual
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    const perms = (user as any).org_id
      ? await resolveUserPermissions(supabase as any, user.id, (user as any).org_id, user.role, agencyIds)
      : null
    if (!assertPermission(user.role, perms, "accounting", "write")) {
      return NextResponse.json({ error: "Sin permisos para crear asientos" }, { status: 403 })
    }
    const body = await req.json()

    const { entry_date, description, lines, operation_id, currency, exchange_rate, notes } = body

    // Validaciones básicas
    if (!entry_date) {
      return NextResponse.json({ error: "Fecha requerida" }, { status: 400 })
    }
    if (!description?.trim()) {
      return NextResponse.json({ error: "Descripción requerida" }, { status: 400 })
    }
    if (!lines || !Array.isArray(lines) || lines.length < 2) {
      return NextResponse.json({ error: "Se requieren al menos 2 líneas" }, { status: 400 })
    }

    // Validar balance antes de crear
    const balance = validateJournalBalance(lines)
    if (!balance.valid) {
      return NextResponse.json(
        {
          error: `Asiento desbalanceado: Debe ${balance.totalDebit.toFixed(2)} ≠ Haber ${balance.totalCredit.toFixed(2)}`,
          totalDebit: balance.totalDebit,
          totalCredit: balance.totalCredit,
          difference: balance.difference,
        },
        { status: 400 }
      )
    }

    const journalEntry = await createJournalEntry(
      {
        entry_date,
        description: description.trim(),
        lines: lines as JournalEntryLine[],
        operation_id: operation_id || null,
        source: "MANUAL",
        currency: currency || "ARS",
        exchange_rate: exchange_rate || null,
        created_by: user.id,
        notes: notes || null,
      },
      supabase
    )

    return NextResponse.json(journalEntry, { status: 201 })
  } catch (error: any) {
    console.error("Error en POST /api/accounting/journal-entries:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
