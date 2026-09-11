import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * Export de movimientos de caja (VIB-146).
 *
 * Yamil pidió "poder descargar los movimientos de las cajas para conciliar".
 * El botón ya existía, pero el archivo tenía dos problemas:
 *
 * 1. Se armaba con "," como separador, sin BOM y sin `sep=;`, o sea el formato
 *    que Excel en español (Argentina) abre con TODO amontonado en la columna A.
 *    Mismo bug que ya se había arreglado en /api/operations/export-csv.
 * 2. No traía la cuenta de cada movimiento, que es el primer dato que se
 *    necesita para cruzar contra un extracto bancario.
 *
 * Ahora usa el mismo formato que el export de operaciones y agrega Cuenta,
 * el monto con signo y un saldo acumulado por cuenta.
 */

// Separador ";" (no ","): Excel-ES usa punto y coma como separador de lista y
// la coma como decimal. Ver la directiva `sep=;` al final.
const DELIM = ";"

const HEADERS = [
  "Fecha",
  "Cuenta",
  "Tipo",
  "Categoría",
  "Monto",
  "Moneda",
  "Saldo acumulado",
  "Agencia",
  "Operación",
  "Usuario",
  "Notas",
]

/**
 * Escapa con comillas si el valor trae el separador, comillas o saltos de
 * línea. NO escapa por coma: los montos decimales la usan (1234,56).
 */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ""
  const str = String(value)
  if (/[";\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Decimal argentino: coma, sin separador de miles (rompería el parseo). */
function numEs(value: unknown): string {
  if (value === null || value === undefined || value === "") return ""
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return String(value)
  return n.toFixed(2).replace(".", ",")
}

/** Fecha corta dd/MM/yyyy, que es como la espera Excel-ES. */
function dateEs(value: unknown): string {
  if (!value) return ""
  const raw = String(value)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : raw
}

/**
 * BOM para que Excel detecte UTF-8 (sin esto se rompen los acentos) y `sep=;`
 * para fijar el separador en cualquier configuración regional. CRLF es lo que
 * espera Excel en Windows.
 */
function buildCsvResponse(rows: string[][], truncated = false): NextResponse {
  const BOM = "﻿"
  const body =
    BOM +
    "sep=;\r\n" +
    [HEADERS, ...rows].map((row) => row.map(csvEscape).join(DELIM)).join("\r\n")

  const today = new Date().toISOString().slice(0, 10)
  const parcial = truncated ? `-TRUNCADO-${LIMIT_HARD}` : ""

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="movimientos-caja-${today}${parcial}.csv"`,
    },
  })
}

const PAGE = 1000
/** Tope por descarga, alineado con el resto de los exports. */
const LIMIT_HARD = 10_000

/**
 * Trae los movimientos paginando.
 *
 * Antes se hacía `await query` sin `.limit()` ni `.range()`, así que PostgREST
 * cortaba en su máximo por defecto (1000 filas) sin que nada lo dijera. En la
 * agencia más grande eso era una fracción de la caja presentada como el
 * archivo completo — y peor: el "Saldo acumulado" se calculaba sobre ese
 * pedazo, o sea que el número tampoco cerraba con el extracto.
 */
async function fetchAllMovements(
  buildQuery: () => any
): Promise<{ movements: any[]; truncated: boolean }> {
  const movements: any[] = []
  for (let from = 0; from < LIMIT_HARD; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) return { movements, truncated: false }
    movements.push(...data)
    if (data.length < PAGE) return { movements, truncated: false }
  }
  return { movements, truncated: true }
}

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Cross-tenant fix (2026-05-18): exigir org_id.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const dateType = (searchParams.get("dateType") ?? "MOVIMIENTO").toUpperCase()
    const type = searchParams.get("type")
    const currency = searchParams.get("currency")
    const agencyId = searchParams.get("agencyId")

    // Mapeo dateType (mismo comportamiento que /api/cash/movements):
    // - MOVIMIENTO (default): cash_movements.movement_date con timezone AR
    // - OPERACION: pre-resolver operation_ids cuya operations.operation_date cae
    //   en [from,to] y restringir cash_movements.operation_id IN (...).
    let operationIds: string[] | null = null
    if (dateType === "OPERACION" && (dateFrom || dateTo)) {
      let opQuery = (supabase.from("operations") as any)
        .select("id")
        .eq("org_id", (user as any).org_id)
      if (dateFrom) opQuery = opQuery.gte("operation_date", dateFrom)
      if (dateTo) opQuery = opQuery.lte("operation_date", dateTo)
      const { data: matchingOps } = await opQuery.limit(5000)
      const ids = (matchingOps || []).map((o: any) => String(o.id))
      if (ids.length === 0) {
        return buildCsvResponse([])
      }
      operationIds = ids
    }

    // Se rearma en cada página: una query de PostgREST se consume una sola vez.
    const buildQuery = () => {
      let query = (supabase
        .from("cash_movements") as any)
        .select(
          `
        *,
        agencies:agency_id (
          name
        ),
        users:user_id (
          name
        ),
        financial_accounts:financial_account_id (
          name,
          currency
        ),
        operations:operation_id (
          id,
          destination,
          agency_id,
          agencies:agency_id (
            name
          )
        )
      `,
        )
        // Cross-tenant fix: scopear export por org del user.
        .eq("org_id", (user as any).org_id)
        // Ascendente: el saldo acumulado se calcula en este orden, y para conciliar
        // se lee de lo más viejo a lo más nuevo.
        .order("movement_date", { ascending: true })
        // Desempate estable: sin un segundo criterio, dos movimientos con la
        // misma fecha pueden caer en distinto orden entre página y página, y la
        // paginación duplicaría uno y se comería otro.
        .order("id", { ascending: true })

      if (user.role === "SELLER") {
        query = query.eq("user_id", user.id)
      }

      if (type && type !== "ALL") {
        query = query.eq("type", type)
      }

      if (currency && currency !== "ALL") {
        query = query.eq("currency", currency)
      }

      if (agencyId && agencyId !== "ALL") {
        // Por la oficina DEL MOVIMIENTO. Antes se resolvía por las operaciones de
        // esa oficina, así que el export por oficina dejaba afuera todo lo que no
        // cuelga de una venta (gastos, transferencias, ajustes).
        query = query.eq("agency_id", agencyId)
      }

      if (operationIds) {
        query = query.in("operation_id", operationIds)
      } else {
        if (dateFrom) query = query.gte("movement_day", dateFrom)
        if (dateTo) query = query.lte("movement_day", dateTo)
      }

      return query
    }

    let movements: any[] = []
    let truncated = false
    try {
      const result = await fetchAllMovements(buildQuery)
      movements = result.movements
      truncated = result.truncated
    } catch (error) {
      console.error("Error exporting movements:", error)
      return NextResponse.json({ error: "Error al exportar movimientos" }, { status: 500 })
    }

    /**
     * Saldo acumulado por cuenta + moneda.
     *
     * Es el saldo DEL PERÍODO EXPORTADO, no el saldo real de la cuenta: arranca
     * en cero en el primer movimiento del rango. Mezclar cuentas o monedas en un
     * mismo acumulado no tendría sentido, de ahí la clave compuesta.
     *
     * Los egresos restan. `type` es INCOME/EXPENSE y `amount` viene siempre en
     * positivo, así que el signo se aplica acá y también en la columna Monto:
     * sin eso, un extracto bancario no se puede cruzar.
     */
    const runningByAccount = new Map<string, number>()

    const rows = (movements || []).map((movement: any) => {
      const accountName = movement.financial_accounts?.name || "Sin cuenta"
      const signedAmount =
        movement.type === "EXPENSE" ? -Number(movement.amount || 0) : Number(movement.amount || 0)

      const balanceKey = `${accountName}::${movement.currency}`
      const running = (runningByAccount.get(balanceKey) ?? 0) + signedAmount
      runningByAccount.set(balanceKey, running)

      return [
        dateEs(movement.movement_date),
        accountName,
        movement.type,
        movement.category,
        numEs(signedAmount),
        movement.currency,
        numEs(running),
        movement.agencies?.name || movement.operations?.agencies?.name || "",
        movement.operations?.destination || "",
        movement.users?.name || "",
        movement.notes || "",
      ]
    })

    return buildCsvResponse(rows, truncated)
  } catch (error) {
    console.error("Error in GET /api/cash/export:", error)
    return NextResponse.json({ error: "Error al exportar movimientos" }, { status: 500 })
  }
}
