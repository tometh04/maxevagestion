/**
 * Fuente única de los gastos pagados de un tenant.
 *
 * Extraído de `app/api/expenses/monthly/route.ts` (sin cambios de comportamiento)
 * para que la pantalla de Gastos y el Reporte de Gastos lean exactamente el
 * mismo dataset. Si esta lógica se duplica, los números de la pantalla y los del
 * PDF se separan con el tiempo y el reporte deja de ser presentable.
 *
 * Qué se considera "gasto pagado":
 *  1. Recurrentes: `ledger_movements` type=EXPENSE con concepto
 *     "Gasto recurrente: ..." (solo existen cuando se pagaron efectivamente).
 *  2. Variables: `cash_movements` type=EXPENSE (se pagan al crearse).
 *     Se excluyen los conceptos de pago a operador / cliente.
 *
 * El caller es responsable de auth, permisos y de pasar el `orgId` ya validado.
 */

import { roundMoney } from "@/lib/currency"
import { startOfDayAR, endOfDayAR } from "@/lib/utils/date-range"

export type ExpenseType = "recurring" | "variable"

export interface ExpenseRow {
  id: string
  expense_type: ExpenseType
  description: string
  provider_name: string | null
  category: string | null
  category_color: string | null
  amount: number
  currency: string
  movement_date: string
  notes: string | null
  financial_accounts: { id: string; name: string; currency: string } | null
  users: { id: string; name: string } | null
  is_paid: boolean
}

export interface ExpenseTotals {
  ars: number
  usd: number
  count: number
  countRecurring: number
  countVariable: number
  arsRecurring: number
  arsVariable: number
  usdRecurring: number
  usdVariable: number
}

export interface FetchExpensesParams {
  /** Client Supabase del request (auth-aware). No usar service role acá. */
  supabase: any
  /** Ya validado por el caller. */
  orgId: string
  dateFrom?: string | null
  dateTo?: string | null
  /** "ARS" | "USD" | "ALL" | null (= todas). */
  currency?: string | null
  /** "recurring" | "variable" | null (= ambos). */
  type?: string | null
  /** Solo aplica a gastos variables. */
  categoryId?: string | null
  agencyId?: string | null
  /**
   * Criterio de atribución del filtro por agencia:
   *  - "office" (default): la oficina a la que pertenece el gasto.
   *  - "account": la oficina de la cuenta desde la que salió la plata.
   */
  agencyMode?: "office" | "account"
  /**
   * Si viene seteado, los gastos variables se limitan a los cargados por ese
   * usuario (permiso `cash.ownDataOnly`).
   */
  ownDataOnlyUserId?: string | null
}

export async function fetchExpenses(
  params: FetchExpensesParams
): Promise<{ expenses: ExpenseRow[]; totals: ExpenseTotals }> {
  const {
    supabase,
    orgId,
    dateFrom,
    dateTo,
    currency,
    type: typeFilter,
    categoryId: categoryIdFilter,
    agencyId,
    ownDataOnlyUserId,
  } = params
  const agencyMode = params.agencyMode === "account" ? "account" : "office"

  // El filtro por agencia se resuelve en memoria para poder atribuir cada
  // gasto según el criterio elegido. Necesitamos el mapa cuenta -> oficina
  // para el modo "account" (y como fallback del modo "office" en recurrentes,
  // cuando el asiento no matchea ningún gasto recurrente conocido).
  const filterByAgency = !!(agencyId && agencyId !== "ALL")
  const accountAgencyById = new Map<string, string | null>()
  if (filterByAgency) {
    const { data: orgAccounts } = await (supabase.from("financial_accounts") as any)
      .select("id, agency_id")
      .eq("org_id", orgId)
    for (const a of orgAccounts || []) {
      accountAgencyById.set(a.id as string, (a.agency_id ?? null) as string | null)
    }
  }

  // Enriquecimiento de categorías (para el resumen por categoría / torta).
  // recurring_payment_categories es la fuente compartida de categorías con color.
  const { data: catRows } = await (supabase.from("recurring_payment_categories") as any)
    .select("id, name, color")
    .eq("org_id", orgId)
  const categoryById = new Map<string, { id: string; name: string; color: string | null }>(
    (catRows || []).map((c: any) => [c.id, c])
  )

  // Los gastos recurrentes viven en ledger_movements con concepto
  // "Gasto recurrente: <description>" y NO conservan category_id. Recuperamos la
  // categoría matcheando la description contra recurring_payments (scopeado por org).
  const { data: recRows } = await (supabase.from("recurring_payments") as any)
    .select("description, category_id, agency_id")
    .eq("org_id", orgId)
  const recCategoryIdByDescription = new Map<string, string>()
  // description -> agency_id del gasto recurrente (puede ser null = sin oficina).
  // Se usa para atribuir el pago a su oficina real, no a la de la cuenta.
  const recAgencyIdByDescription = new Map<string, string | null>()
  for (const r of recRows || []) {
    if (r.description && r.category_id) {
      recCategoryIdByDescription.set(String(r.description).trim(), r.category_id)
    }
    if (r.description) {
      recAgencyIdByDescription.set(String(r.description).trim(), (r.agency_id ?? null) as string | null)
    }
  }

  const allExpenses: ExpenseRow[] = []

  // 1. RECURRING EXPENSES (paid): from ledger_movements
  if (!typeFilter || typeFilter === "recurring") {
    let recQuery = (supabase.from("ledger_movements") as any)
      .select(`
        id, type, concept, currency, amount_original, category_id,
        movement_date, created_at, account_id, notes, receipt_number,
        financial_accounts:account_id (id, name, currency),
        users:created_by (id, name)
      `)
      .eq("type", "EXPENSE")
      .eq("org_id", orgId)
      .like("concept", "Gasto recurrente:%")
      .order("movement_date", { ascending: false })

    if (dateFrom) recQuery = recQuery.gte("movement_date", startOfDayAR(dateFrom))
    if (dateTo) recQuery = recQuery.lte("movement_date", endOfDayAR(dateTo))
    if (currency && currency !== "ALL") recQuery = recQuery.eq("currency", currency)
    // El filtro por agencia se resuelve abajo, en memoria, atribuyendo cada
    // pago a la oficina del gasto (no a la de la cuenta pagadora).

    const { data: recurring, error: recError } = await recQuery

    if (!recError && recurring) {
      for (const e of recurring) {
        const description = (e.concept || "")
          .replace("Gasto recurrente: ", "")
          .replace("Gasto recurrente:", "")
          .trim()

        // Filtro por agencia según el criterio elegido:
        //  - office:  la oficina del gasto recurrente manda; fallback a la
        //             cuenta pagadora si el gasto no matchea o no tiene oficina.
        //  - account: la oficina de la cuenta desde la que se pagó.
        if (filterByAgency) {
          let resolvedAgency: string | null
          if (agencyMode === "account") {
            resolvedAgency = accountAgencyById.get(e.account_id) ?? null
          } else {
            const ownAgency = recAgencyIdByDescription.has(description)
              ? recAgencyIdByDescription.get(description) ?? null
              : null
            resolvedAgency = ownAgency ?? (accountAgencyById.get(e.account_id) ?? null)
          }
          if (resolvedAgency !== agencyId) continue
        }

        // Preferir la categoría persistida en el asiento (pagos nuevos);
        // fallback a matching por descripción para pagos históricos.
        const recCategoryId = e.category_id || recCategoryIdByDescription.get(description) || null
        const recCat = recCategoryId ? categoryById.get(recCategoryId) : null

        allExpenses.push({
          id: e.id,
          expense_type: "recurring",
          description,
          provider_name: null,
          category: recCat?.name || "Recurrente",
          category_color: recCat?.color || null,
          amount: Number(e.amount_original),
          currency: e.currency,
          movement_date: e.movement_date,
          notes: e.notes,
          financial_accounts: e.financial_accounts,
          users: e.users,
          is_paid: true,
        })
      }
    }
  }

  // 2. VARIABLE EXPENSES: from cash_movements type=EXPENSE (paid on creation)
  if (!typeFilter || typeFilter === "variable") {
    let varQuery = (supabase.from("cash_movements") as any)
      .select(`
        id, type, category, amount, currency,
        movement_date, created_at, notes,
        financial_account_id, category_id,
        financial_accounts:financial_account_id (id, name, currency),
        users:user_id (id, name)
      `)
      .eq("type", "EXPENSE")
      .eq("org_id", orgId)
      .not("category", "in", '("OPERATOR_PAYMENT","Pago Operador","Pago Cliente")')
      .order("movement_date", { ascending: false })

    if (dateFrom) varQuery = varQuery.gte("movement_date", startOfDayAR(dateFrom))
    if (dateTo) varQuery = varQuery.lte("movement_date", endOfDayAR(dateTo))
    if (currency && currency !== "ALL") varQuery = varQuery.eq("currency", currency)
    if (categoryIdFilter && categoryIdFilter !== "all") varQuery = varQuery.eq("category_id", categoryIdFilter)
    // Modo "office": el gasto variable ya guarda la oficina a la que se cargó
    // (agency_id), así que filtramos directo en la query. Modo "account": la
    // oficina la da la cuenta pagadora, se resuelve en memoria más abajo.
    if (filterByAgency && agencyMode === "office") varQuery = varQuery.eq("agency_id", agencyId)
    // Restringido a gastos propios (cash.ownDataOnly por agencia)
    if (ownDataOnlyUserId) varQuery = varQuery.eq("user_id", ownDataOnlyUserId)

    const { data: variables, error: varError } = await varQuery

    if (!varError && variables) {
      for (const v of variables) {
        // Modo "account": filtrar por la oficina de la cuenta pagadora.
        if (filterByAgency && agencyMode === "account") {
          const acctAgency = accountAgencyById.get(v.financial_account_id) ?? null
          if (acctAgency !== agencyId) continue
        }

        const varCat = v.category_id ? categoryById.get(v.category_id) : null
        allExpenses.push({
          id: v.id,
          expense_type: "variable",
          // El detalle cargado por el usuario primero: la categoría ya viaja en
          // su propio campo y, en el PDF, además agrupa. Al revés (como estaba)
          // el detalle mostraba "Marketing y sistemas" cinco veces seguidas en
          // lugar de Facebook, Apple, Manychat — que es justo lo que se busca
          // cuando hay que rastrear un gasto puntual.
          description: v.notes || v.category || "Gasto variable",
          provider_name: null,
          category: v.category || varCat?.name || null,
          category_color: varCat?.color || null,
          amount: Number(v.amount),
          currency: v.currency,
          movement_date: v.movement_date,
          notes: v.notes,
          financial_accounts: v.financial_accounts,
          users: v.users,
          is_paid: true,
        })
      }
    }
  }

  // Sort all by movement_date descending
  allExpenses.sort((a, b) => new Date(b.movement_date).getTime() - new Date(a.movement_date).getTime())

  return { expenses: allExpenses, totals: computeExpenseTotals(allExpenses) }
}

/**
 * Totales por moneda y por tipo. El total ARS/USD suma AMBOS tipos
 * (fijos + variables); el desglose por tipo se usa en las tarjetas.
 * ARS y USD nunca se mezclan: no hay TC confiable por movimiento.
 */
export function computeExpenseTotals(expenses: ExpenseRow[]): ExpenseTotals {
  let totalARS = 0
  let totalUSD = 0
  let arsRecurring = 0
  let arsVariable = 0
  let usdRecurring = 0
  let usdVariable = 0
  let countRecurring = 0
  let countVariable = 0

  for (const e of expenses) {
    const isRecurring = e.expense_type === "recurring"
    if (e.currency === "ARS") {
      totalARS += e.amount
      if (isRecurring) arsRecurring += e.amount
      else arsVariable += e.amount
    } else if (e.currency === "USD") {
      totalUSD += e.amount
      if (isRecurring) usdRecurring += e.amount
      else usdVariable += e.amount
    }
    if (isRecurring) countRecurring++
    else countVariable++
  }

  return {
    ars: roundMoney(totalARS),
    usd: roundMoney(totalUSD),
    count: expenses.length,
    countRecurring,
    countVariable,
    arsRecurring: roundMoney(arsRecurring),
    arsVariable: roundMoney(arsVariable),
    usdRecurring: roundMoney(usdRecurring),
    usdVariable: roundMoney(usdVariable),
  }
}
