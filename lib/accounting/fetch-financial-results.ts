/**
 * Movimientos de resultado financiero del período.
 *
 * Son las dos caras de operar con una financiera para pagar a operadores:
 *  - INCOME  "Ganancia financiera por depósito ..." — la bonificación por pagar
 *    por depósito (existe desde antes de este módulo).
 *  - EXPENSE "Costo financiero por depósito ..." — la comisión que cobra la
 *    financiera, en pesos y desde otra caja.
 *
 * No son gastos de la agencia y por eso no aparecen en `fetchExpenses`: aquel
 * lee los recurrentes por concepto (`Gasto recurrente:%`) y los variables desde
 * `cash_movements`, y el pago masivo no escribe cash movements. Quedan fuera
 * solos, sin filtro extra. Este archivo existe para traerlos explícitamente y
 * que el reporte societario pueda mostrarlos netos en su propia línea, en vez
 * de que sean plata invisible.
 *
 * El ancla es el CONCEPTO (ver `lib/accounting/financial-result.ts`): la cuenta
 * contable no sirve —los movimientos históricos tienen `chart_account_id` en
 * null— y la cuenta financiera tampoco, porque la elige el usuario a mano.
 *
 * El caller es responsable de auth, permisos y de pasar el `orgId` ya validado.
 */

import {
  FINANCIAL_COST_LIKE,
  FINANCIAL_INCOME_LIKE,
} from "@/lib/accounting/financial-result"
import { fetchAllRows } from "@/lib/supabase/fetch-all"
import { endOfDayAR, startOfDayAR } from "@/lib/utils/date-range"

export type FinancialResultKind = "INCOME" | "COST"

export interface FinancialResultRow {
  id: string
  kind: FinancialResultKind
  concept: string
  /** `amount_original`, SIEMPRE positivo. El signo lo pone el reporte. */
  amount: number
  currency: string
  movement_date: string
  accountId: string | null
  receiptNumber: string | null
}

export interface FetchFinancialResultsParams {
  /** Client Supabase del request (auth-aware). No usar service role acá. */
  supabase: any
  /** Ya validado por el caller. */
  orgId: string
  dateFrom?: string | null
  dateTo?: string | null
  /** Filtro elegido por el usuario. "ALL" o null = todas. */
  agencyId?: string | null
  /** Techo de oficinas visibles para el usuario. Vacío = sin restricción. */
  agencyIds?: string[]
}

export interface FetchFinancialResultsResult {
  rows: FinancialResultRow[]
  truncated: boolean
}

const SELECT = "id, concept, currency, amount_original, movement_date, account_id, receipt_number"

export async function fetchFinancialResults(
  params: FetchFinancialResultsParams
): Promise<FetchFinancialResultsResult> {
  const { supabase, orgId, dateFrom, dateTo } = params
  const agencyId = params.agencyId && params.agencyId !== "ALL" ? params.agencyId : null
  const allowedAgencies = params.agencyIds?.length ? new Set(params.agencyIds) : null

  const query = (ledgerType: "INCOME" | "EXPENSE", conceptLike: string) =>
    fetchAllRows<any>((from, to) => {
      let q = (supabase.from("ledger_movements") as any)
        .select(SELECT)
        .eq("org_id", orgId)
        .eq("type", ledgerType)
        .like("concept", conceptLike)
        // Excluido del saldo = no movió plata; no puede afectar el resultado.
        .eq("affects_balance", true)
        // Un movimiento reversado no cuenta. El contra-movimiento tampoco entra
        // por su cuenta: `buildLedgerReversalPayload` le pisa el concepto con
        // "Contra-movimiento", así que nunca matchea el LIKE.
        .is("reversed_at", null)

      if (dateFrom) q = q.gte("movement_date", startOfDayAR(dateFrom))
      if (dateTo) q = q.lte("movement_date", endOfDayAR(dateTo))

      return q.order("id", { ascending: true }).range(from, to)
    })

  // Dos queries en vez de un `.or()` con dos patrones: el tipo de ledger ya las
  // separa, y así cada filtro viaja plano (sin quoting de PostgREST).
  const [income, cost] = await Promise.all([
    query("INCOME", FINANCIAL_INCOME_LIKE),
    query("EXPENSE", FINANCIAL_COST_LIKE),
  ])

  const needsAgencyResolution = !!agencyId || !!allowedAgencies
  const accountAgencyById = new Map<string, string | null>()
  if (needsAgencyResolution) {
    // `ledger_movements` no tiene `agency_id` y estos asientos no cuelgan de
    // ninguna operación, así que la única atribución posible es la oficina de
    // la cuenta por la que se movió la plata.
    const { data: orgAccounts } = await (supabase.from("financial_accounts") as any)
      .select("id, agency_id")
      .eq("org_id", orgId)
    for (const a of (orgAccounts || []) as any[]) {
      accountAgencyById.set(a.id as string, (a.agency_id ?? null) as string | null)
    }
  }

  const rows: FinancialResultRow[] = []
  const push = (kind: FinancialResultKind, raw: any[]) => {
    for (const m of raw) {
      if (needsAgencyResolution) {
        const resolved = m.account_id ? accountAgencyById.get(m.account_id) ?? null : null
        if (agencyId && resolved !== agencyId) continue
        // Sin oficina = resultado compartido de la org: no se recorta por
        // alcance, misma regla que los gastos sin oficina.
        if (allowedAgencies && resolved && !allowedAgencies.has(resolved)) continue
      }

      rows.push({
        id: m.id,
        kind,
        concept: m.concept || "",
        // En positivo siempre: quien arma la cascada decide si suma o resta.
        amount: Math.abs(Number(m.amount_original) || 0),
        currency: String(m.currency || "ARS").toUpperCase(),
        movement_date: m.movement_date,
        accountId: m.account_id ?? null,
        receiptNumber: m.receipt_number ?? null,
      })
    }
  }

  push("INCOME", income.rows)
  push("COST", cost.rows)

  rows.sort(
    (a, b) => new Date(b.movement_date).getTime() - new Date(a.movement_date).getTime()
  )

  return { rows, truncated: income.truncated || cost.truncated }
}
