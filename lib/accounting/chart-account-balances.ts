/**
 * Saldos por cuenta del plan, en un rango de fechas.
 *
 * POR QUÉ EXISTE
 * --------------
 * Esta lógica vivía inline dentro del route del Mayor por Cuenta y no había
 * forma de reutilizarla. El cierre de ejercicio necesita exactamente lo mismo
 * —cuánto acumuló cada cuenta 4.x en el año— y copiarla habría dejado dos
 * versiones del mismo cálculo, que es como aparecen las diferencias que después
 * nadie sabe explicar.
 *
 * DEVUELVE DEBE Y HABER CRUDOS, SIN SIGNO
 * ---------------------------------------
 * Y eso es deliberado. En el repo conviven dos criterios opuestos para la
 * familia 4: el Mayor por Cuenta la trata como deudora (un ingreso le sale
 * negativo) y el Estado de Resultados la trata al revés. Si este módulo
 * impusiera un signo, uno de los dos consumidores tendría que darlo vuelta, y
 * el próximo que lo lea no sabría cuál es el correcto.
 *
 * Cada consumidor aplica su criterio sobre Debe y Haber, que no son opinables.
 *
 * SE PAGINA DE VERDAD
 * -------------------
 * PostgREST corta en 1.000 filas sin avisar. Con un tope silencioso los totales
 * saldrían incompletos y aun así parecerían correctos, que es la peor forma de
 * estar mal.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

const PAGE = 1000

export interface SaldoPorCuenta {
  chart_account_id: string
  account_code: string
  account_name: string
  category: string
  currency: string
  debit: number
  credit: number
  movements: number
}

export interface CuentaDelPlan {
  id: string
  account_code: string
  account_name: string
  category: string
}

export interface SaldosParams {
  orgId: string
  /** Inclusive. Omitir para no acotar por abajo. */
  desde?: string | null
  /** Inclusive. Omitir para no acotar por arriba. */
  hasta?: string | null
  /** Filtra por moneda. Omitir para traer todas. */
  currency?: string | null
  /**
   * Excluye asientos por su tipo de cierre.
   *
   * Lo necesita el Estado de Resultados: el asiento de refundición cancela las
   * cuentas 4.x y está fechado dentro del ejercicio, así que si se incluye hace
   * que el estado de ese mismo año muestre todo en cero.
   */
  excluirCloseKinds?: string[]
}

export interface SaldosResultado {
  filas: SaldoPorCuenta[]
  /** Movimientos que sí quedaron clasificados en una cuenta del plan. */
  clasificados: number
  /** Movimientos sin cuenta contable, o sin Debe ni Haber. */
  sinClasificar: number
}

/** El plan de cuentas de la organización, indexado por id. */
export async function leerPlanDeCuentas(
  supabase: SupabaseClient<any>,
  orgId: string
): Promise<Map<string, CuentaDelPlan>> {
  const { data } = await (supabase.from("chart_of_accounts") as any)
    .select("id, account_code, account_name, category")
    .eq("org_id", orgId)

  const plan = new Map<string, CuentaDelPlan>()
  for (const c of (data ?? []) as CuentaDelPlan[]) plan.set(c.id, c)
  return plan
}

/**
 * Acumula Debe y Haber por cuenta del plan y moneda.
 *
 * La clave de agregación incluye la moneda a propósito: sumar pesos con dólares
 * daría un número que parece un total y no lo es.
 */
export async function calcularSaldosPorCuenta(
  supabase: SupabaseClient<any>,
  params: SaldosParams,
  planPorId?: Map<string, CuentaDelPlan>
): Promise<SaldosResultado> {
  const plan = planPorId ?? (await leerPlanDeCuentas(supabase, params.orgId))
  const acumulado = new Map<string, SaldoPorCuenta>()
  let clasificados = 0
  let sinClasificar = 0

  const excluir = new Set(params.excluirCloseKinds ?? [])
  // Solo se pide `journal_entries.close_kind` si hace falta filtrar: el join
  // encarece la query y la mayoría de los llamadores no lo necesita.
  //
  // Se nombra la clave foránea explícitamente porque hay DOS relaciones entre
  // estas tablas —`ledger_movements.journal_entry_id` y
  // `journal_entries.source_movement_id`— y sin desambiguar PostgREST rechaza
  // la query. La que sirve es la primera: la línea que pertenece al asiento.
  const select = excluir.size
    ? "chart_account_id, currency, debit_amount, credit_amount, journal_entries!ledger_movements_journal_entry_id_fkey(close_kind)"
    : "chart_account_id, currency, debit_amount, credit_amount"

  for (let from = 0; ; from += PAGE) {
    let q = (supabase.from("ledger_movements") as any)
      .select(select)
      .eq("org_id", params.orgId)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)

    if (params.desde) q = q.gte("movement_date", params.desde)
    if (params.hasta) q = q.lte("movement_date", params.hasta)
    if (params.currency && params.currency !== "ALL") q = q.eq("currency", params.currency)

    const { data, error } = await q
    if (error) throw new Error(`Error leyendo movimientos: ${error.message}`)
    if (!data || data.length === 0) break

    for (const m of data as any[]) {
      const debe = Number(m.debit_amount) || 0
      const haber = Number(m.credit_amount) || 0

      // Un movimiento cuenta para el mayor solo si tiene cuenta contable Y un
      // lado de la partida doble. Hay movimientos con cuenta pero sin Debe ni
      // Haber: sumarlos como clasificados infla la cobertura y agrega filas en
      // cero que no significan nada.
      if (!m.chart_account_id || (debe === 0 && haber === 0)) {
        sinClasificar++
        continue
      }

      if (excluir.size && m.journal_entries?.close_kind) {
        if (excluir.has(m.journal_entries.close_kind)) continue
      }

      const cuenta = plan.get(m.chart_account_id)
      // Defensa: una cuenta de otra organización no debería aparecer nunca
      // (RLS más el filtro por org_id), pero si aparece no se cuenta como
      // clasificada en vez de romper.
      if (!cuenta) {
        sinClasificar++
        continue
      }
      clasificados++

      const key = `${m.chart_account_id}|${m.currency}`
      let fila = acumulado.get(key)
      if (!fila) {
        fila = {
          chart_account_id: m.chart_account_id,
          account_code: cuenta.account_code,
          account_name: cuenta.account_name,
          category: cuenta.category,
          currency: m.currency,
          debit: 0,
          credit: 0,
          movements: 0,
        }
        acumulado.set(key, fila)
      }
      fila.debit += debe
      fila.credit += haber
      fila.movements++
    }

    if (data.length < PAGE) break
  }

  return { filas: Array.from(acumulado.values()), clasificados, sinClasificar }
}

/**
 * Los saldos de las cuentas de resultado (familia 4), agrupados por moneda.
 *
 * Es lo que consume el cierre de ejercicio. Se filtra por prefijo de código y
 * no por categoría porque es el mismo criterio que usa el Estado de Resultados
 * (`armarEstadoDeResultados` filtra por `4.1`, `4.2` y `4.3`), y las dos cosas
 * tienen que hablar del mismo universo de cuentas.
 */
export function agruparResultadosPorMoneda(
  filas: SaldoPorCuenta[]
): Map<string, SaldoPorCuenta[]> {
  const porMoneda = new Map<string, SaldoPorCuenta[]>()
  for (const f of filas) {
    if (!f.account_code.startsWith("4.")) continue
    const lista = porMoneda.get(f.currency) ?? []
    lista.push(f)
    porMoneda.set(f.currency, lista)
  }
  return porMoneda
}
