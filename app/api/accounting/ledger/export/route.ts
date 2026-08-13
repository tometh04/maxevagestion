import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { startOfDayAR, endOfDayAR } from "@/lib/utils/date-range"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions, assertPermission } from "@/lib/permissions-agency"
import { buildCsv, csvResponse, numEs } from "@/lib/utils/csv"

/**
 * Export CSV del Libro Mayor. Mismos filtros que GET /api/accounting/ledger
 * (fecha, dateType, tipo, moneda, agencia, cuenta financiera) pero sin el cap
 * de 500 filas de la vista paginada — el caso de uso es conciliar una cuenta
 * (ej. Banco USD) contra un Excel, y ahí hace falta el período completo.
 */
const LIMIT_HARD = 10_000

const typeLabels: Record<string, string> = {
  INCOME: "Ingreso",
  EXPENSE: "Gasto",
  FX_GAIN: "Ganancia FX",
  FX_LOSS: "Pérdida FX",
  COMMISSION: "Comisión",
  OPERATOR_PAYMENT: "Pago Operador",
}

const HEADERS = [
  "Fecha",
  "Tipo",
  "Concepto",
  "Cuenta",
  "Moneda",
  "Monto Original",
  "Tipo de Cambio",
  "ARS Equivalente",
  "Método",
  "Comprobante",
  "Operación",
  "Cliente",
  "Destino",
  "Operador",
  "Vendedor",
  "Agencia",
  "Estado",
  "Notas",
]

/**
 * `movement_date` es timestamptz. Lo formateamos en hora AR como dd/MM/yyyy
 * para que Excel-ES lo reconozca como fecha (el ISO crudo queda como texto).
 */
function formatDateAR(value: string | null | undefined): string {
  if (!value) return ""
  const d = new Date(value)
  if (isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d)
}

function customerName(operation: any): string {
  const first = operation?.operation_customers?.[0]?.customers
  if (!first) return ""
  return [first.first_name, first.last_name].filter(Boolean).join(" ")
}

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    const perms = await resolveUserPermissions(
      supabase as any,
      user.id,
      (user as any).org_id,
      user.role,
      agencyIds
    )
    if (!assertPermission(user.role, perms, "accounting", "read")) {
      return NextResponse.json({ error: "No tiene permiso para ver contabilidad" }, { status: 403 })
    }

    const dateFrom = searchParams.get("dateFrom") || undefined
    const dateTo = searchParams.get("dateTo") || undefined
    const dateType = (searchParams.get("dateType") || "MOVIMIENTO").toUpperCase()
    const typeParam = searchParams.get("type") || "ALL"
    const currency = searchParams.get("currency") || undefined
    const accountId = searchParams.get("accountId") || undefined
    const agencyId = searchParams.get("agencyId") || undefined

    let query = (supabase.from("ledger_movements") as any)
      .select(
        `id, type, concept, currency, amount_original, amount_ars_equivalent, exchange_rate,
         movement_date, created_at, method, receipt_number, notes, seller_id, operation_id,
         reversed_at, reverses_movement_id,
         financial_accounts:account_id (name, type, currency),
         sellers:seller_id (name),
         operators:operator_id (name),
         operations:operation_id (id, file_code, agency_id, destination, agencies:agency_id(name), operation_customers(customers:customer_id(first_name, last_name)))`
      )
      // Cross-tenant fix: filtro explícito, no confiar en RLS.
      .eq("org_id", (user as any).org_id)

    // dateType OPERACION: pre-resolver operations en el rango (mismo criterio
    // que la vista paginada — los asientos sin operation_id quedan fuera).
    if (dateType === "OPERACION" && (dateFrom || dateTo)) {
      let opQuery = (supabase.from("operations") as any)
        .select("id")
        .eq("org_id", (user as any).org_id)
      if (dateFrom) opQuery = opQuery.gte("operation_date", dateFrom)
      if (dateTo) opQuery = opQuery.lte("operation_date", dateTo)
      const { data: matchingOps } = await opQuery.limit(5000)
      const opIds = (matchingOps || []).map((o: any) => o.id)
      if (opIds.length === 0) {
        return csvResponse(buildCsv(HEADERS, []), `libro-mayor-${Date.now()}.csv`)
      }
      query = query.in("operation_id", opIds)
    } else {
      if (dateFrom) query = query.gte("movement_date", startOfDayAR(dateFrom))
      if (dateTo) query = query.lte("movement_date", endOfDayAR(dateTo))
    }

    if (currency && currency !== "ALL") query = query.eq("currency", currency)
    if (accountId && accountId !== "ALL") query = query.eq("account_id", accountId)
    if (typeParam === "INCOME") query = query.in("type", ["INCOME", "FX_GAIN"])
    else if (typeParam !== "ALL") query = query.not("type", "in", '("INCOME","FX_GAIN")')

    query = query
      .order("movement_date", { ascending: false })
      .limit(LIMIT_HARD + 1)

    const { data: movements, error } = await query

    if (error) {
      console.error("Error exporting ledger movements:", error)
      return NextResponse.json({ error: "Error al exportar el libro mayor" }, { status: 500 })
    }

    let rows = movements || []

    // Mismos post-filtros que la vista paginada.
    if (user.role === "SELLER") {
      rows = rows.filter((m: any) => m.seller_id === user.id)
    }
    const userAgencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    if (userAgencyIds.length > 0) {
      rows = rows.filter((m: any) => {
        const opAgencyId = m.operations?.agency_id
        if (!opAgencyId) return true
        return userAgencyIds.includes(opAgencyId)
      })
    }

    // Filtro de agencia explícito: solo aplica a movimientos con operación.
    // Los asientos manuales / movimientos de caja puros no tienen agencia.
    if (agencyId && agencyId !== "ALL") {
      rows = rows.filter((m: any) => m.operations?.agency_id === agencyId)
    }

    const truncated = rows.length > LIMIT_HARD
    if (truncated) rows = rows.slice(0, LIMIT_HARD)

    const csv = buildCsv(
      HEADERS,
      rows.map((m: any) => [
        formatDateAR(m.movement_date),
        typeLabels[m.type] || m.type,
        m.concept,
        m.financial_accounts?.name || "",
        m.currency,
        numEs(m.amount_original),
        numEs(m.exchange_rate),
        numEs(m.amount_ars_equivalent),
        m.method || "",
        m.receipt_number || "",
        m.operations?.file_code || "",
        customerName(m.operations),
        m.operations?.destination || "",
        m.operators?.name || "",
        m.sellers?.name || "",
        m.operations?.agencies?.name || "",
        m.reversed_at ? "REVERSADO" : m.reverses_movement_id ? "REVERSO" : "VIGENTE",
        m.notes || "",
      ])
    )

    const filename = `libro-mayor${currency && currency !== "ALL" ? `-${currency}` : ""}${
      truncated ? "-TRUNCADO" : ""
    }-${Date.now()}.csv`

    return csvResponse(csv, filename)
  } catch (error) {
    console.error("Error in GET /api/accounting/ledger/export:", error)
    return NextResponse.json({ error: "Error al exportar el libro mayor" }, { status: 500 })
  }
}
