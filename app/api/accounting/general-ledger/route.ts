/**
 * Mayor por cuenta contable y sumas y saldos — VIB-143 (E1/E3).
 *
 * La pestaña "Libro Mayor" que ya existe es un listado PLANO de movimientos
 * (más cerca de un libro diario): no se puede preguntar "cuánto hay en Ventas
 * de Viajes". Este endpoint agrupa por cuenta del plan y devuelve Debe, Haber y
 * saldo, más el detalle de una cuenta cuando se lo piden.
 *
 * HONESTIDAD DEL DATO
 * -------------------
 * Solo la mitad de los movimientos tiene `chart_account_id`: la capa operativa
 * (gastos, cobros, pagos a operadores) todavía no genera asiento. Por eso el
 * endpoint devuelve SIEMPRE un bloque `coverage` con cuántos movimientos del
 * período quedaron fuera. Sin eso, esto parecería un balance cerrado y no lo
 * es: mientras la cobertura no sea total, Activo ≠ Pasivo + PN + Resultado.
 * Cerrar esa brecha es VIB-142.
 *
 * Las monedas NO se mezclan: se agrupa por (cuenta, moneda), porque sumar ARS
 * con USD a un TC de referencia sería inventar un número.
 */
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions, assertPermission } from "@/lib/permissions-agency"

/** Naturaleza de cada categoría: define si el saldo es Debe − Haber o al revés. */
const SALDO_DEUDOR: Record<string, boolean> = {
  ACTIVO: true,
  PASIVO: false,
  PATRIMONIO_NETO: false,
  RESULTADO: true,
}

type Fila = {
  chart_account_id: string
  account_code: string
  account_name: string
  category: string
  currency: string
  debit: number
  credit: number
  balance: number
  movements: number
}

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const orgId = (user as any).org_id
    if (!orgId) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    const perms = await resolveUserPermissions(
      supabase as any,
      user.id,
      orgId,
      (user as any).roles ?? [user.role],
      agencyIds
    )
    if (!assertPermission(user.role, perms, "accounting", "read")) {
      return NextResponse.json({ error: "No tiene permiso para ver contabilidad" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get("dateFrom") || undefined
    const dateTo = searchParams.get("dateTo") || undefined
    const currency = searchParams.get("currency") || undefined
    // Detalle de UNA cuenta (el "mayor" propiamente dicho).
    const chartAccountId = searchParams.get("chartAccountId") || undefined

    // ---------------------------------------------------------------- plan
    const { data: cuentas, error: cuentasError } = await (supabase
      .from("chart_of_accounts") as any)
      .select("id, account_code, account_name, category")
      .eq("org_id", orgId)

    if (cuentasError) {
      console.error("Error leyendo plan de cuentas:", cuentasError.message)
      return NextResponse.json({ error: "Error al obtener el plan de cuentas" }, { status: 500 })
    }

    const planPorId = new Map<string, any>((cuentas ?? []).map((c: any) => [c.id, c]))

    // ------------------------------------------------------------ detalle
    if (chartAccountId) {
      if (!planPorId.has(chartAccountId)) {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
      }

      let q = (supabase.from("ledger_movements") as any)
        .select(
          "id, movement_date, concept, currency, debit_amount, credit_amount, amount_original, amount_ars_equivalent, operation_id, journal_entry_id, journal_entries:journal_entry_id(entry_number, description, source), operations:operation_id(file_code, destination)"
        )
        .eq("org_id", orgId)
        .eq("chart_account_id", chartAccountId)
        .order("movement_date", { ascending: true })
        .limit(500)

      if (dateFrom) q = q.gte("movement_date", dateFrom)
      if (dateTo) q = q.lte("movement_date", dateTo)
      if (currency && currency !== "ALL") q = q.eq("currency", currency)

      const { data: movs, error: movsError } = await q
      if (movsError) {
        console.error("Error leyendo el mayor de la cuenta:", movsError.message)
        return NextResponse.json({ error: "Error al obtener el mayor" }, { status: 500 })
      }

      // Saldo corriente, para leer la cuenta como un mayor de verdad.
      const cuenta = planPorId.get(chartAccountId)
      const deudor = SALDO_DEUDOR[cuenta.category] ?? true
      const corrido: Record<string, number> = {}
      const movimientos = (movs ?? []).map((m: any) => {
        const debe = Number(m.debit_amount) || 0
        const haber = Number(m.credit_amount) || 0
        const delta = deudor ? debe - haber : haber - debe
        corrido[m.currency] = (corrido[m.currency] ?? 0) + delta
        return {
          id: m.id,
          movement_date: m.movement_date,
          concept: m.concept,
          currency: m.currency,
          debit: debe,
          credit: haber,
          running_balance: corrido[m.currency],
          entry_number: m.journal_entries?.entry_number ?? null,
          entry_description: m.journal_entries?.description ?? null,
          source: m.journal_entries?.source ?? null,
          operation_id: m.operation_id,
          file_code: m.operations?.file_code ?? null,
          destination: m.operations?.destination ?? null,
        }
      })

      return NextResponse.json({
        account: {
          id: cuenta.id,
          account_code: cuenta.account_code,
          account_name: cuenta.account_name,
          category: cuenta.category,
        },
        movements: movimientos,
        truncated: movimientos.length === 500,
      })
    }

    // -------------------------------------------------- sumas y saldos
    // PostgREST no agrupa, así que se agrega en memoria. Se pagina de verdad:
    // el cap silencioso de 1.000 filas daría totales incompletos que igual
    // parecerían correctos (ver el mismo problema en AGENTS.md con .limit(0)).
    const PAGE = 1000
    const acumulado = new Map<string, Fila>()
    let conCuenta = 0
    let sinCuenta = 0

    for (let from = 0; ; from += PAGE) {
      let q = (supabase.from("ledger_movements") as any)
        .select("chart_account_id, currency, debit_amount, credit_amount")
        .eq("org_id", orgId)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1)

      if (dateFrom) q = q.gte("movement_date", dateFrom)
      if (dateTo) q = q.lte("movement_date", dateTo)
      if (currency && currency !== "ALL") q = q.eq("currency", currency)

      const { data, error } = await q
      if (error) {
        console.error("Error leyendo movimientos:", error.message)
        return NextResponse.json({ error: "Error al obtener el mayor" }, { status: 500 })
      }
      if (!data || data.length === 0) break

      for (const m of data as any[]) {
        const debe = Number(m.debit_amount) || 0
        const haber = Number(m.credit_amount) || 0

        // Un movimiento cuenta para el mayor solo si tiene cuenta contable Y un
        // lado de la partida doble. Hay movimientos con cuenta pero sin Debe ni
        // Haber (no son línea de asiento): sumarlos como "clasificados" infla la
        // cobertura y agrega filas en cero que no significan nada.
        if (!m.chart_account_id || (debe === 0 && haber === 0)) {
          sinCuenta++
          continue
        }
        const cuenta = planPorId.get(m.chart_account_id)
        // Defensa: una cuenta de otra org no debería aparecer nunca (RLS +
        // filtro por org_id), pero si aparece no se cuenta como clasificada.
        if (!cuenta) {
          sinCuenta++
          continue
        }
        conCuenta++

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
            balance: 0,
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

    const filas = Array.from(acumulado.values())
    for (const f of filas) {
      const deudor = SALDO_DEUDOR[f.category] ?? true
      f.balance = deudor ? f.debit - f.credit : f.credit - f.debit
      f.debit = Math.round(f.debit * 100) / 100
      f.credit = Math.round(f.credit * 100) / 100
      f.balance = Math.round(f.balance * 100) / 100
    }
    filas.sort((a, b) =>
      a.account_code === b.account_code
        ? a.currency.localeCompare(b.currency)
        : a.account_code.localeCompare(b.account_code)
    )

    // Totales por moneda: en un mayor completo el Debe iguala al Haber. Acá
    // sirve justamente para mostrar CUÁNTO falta para que eso pase.
    const totales: Record<string, { debit: number; credit: number }> = {}
    for (const f of filas) {
      if (!totales[f.currency]) totales[f.currency] = { debit: 0, credit: 0 }
      totales[f.currency].debit += f.debit
      totales[f.currency].credit += f.credit
    }
    for (const t of Object.values(totales)) {
      t.debit = Math.round(t.debit * 100) / 100
      t.credit = Math.round(t.credit * 100) / 100
    }

    // COBERTURA: cuántos HECHOS ECONÓMICOS tienen asiento.
    //
    // Contar "movimientos con cuenta contable" sería engañoso: los asientos de
    // los movimientos de plata se ESPEJAN (filas nuevas) en vez de anotarse
    // sobre el movimiento original, así que ese original nunca recibe cuenta
    // contable y la métrica jamás llegaría al 100% por diseño.
    //
    // Lo que importa es al revés: de los movimientos que mueven plata, cuántos
    // tienen su asiento, sea porque son parte de uno (`journal_entry_id`) o
    // porque uno los espeja (`source_movement_id`).
    //
    // Va por la RPC readonly, que es SECURITY INVOKER y respeta RLS, igual que
    // getAccountBalancesBatch.
    const filtroFecha = [
      dateFrom ? `and movement_date >= '${dateFrom}'` : "",
      dateTo ? `and movement_date <= '${dateTo}'` : "",
    ].join(" ")
    const { data: cov } = await (supabase as any).rpc("execute_readonly_query", {
      query_text: `select count(*) as total, count(*) filter (where lm.journal_entry_id is not null or exists (select 1 from journal_entries je where je.source_movement_id = lm.id)) as con_asiento from ledger_movements lm where lm.affects_balance = true and lm.account_id is not null and lm.org_id = '${orgId}' ${filtroFecha}`,
    })

    const covRow = Array.isArray(cov) ? cov[0] : null
    const totalPlata = Number(covRow?.total ?? 0)
    const conAsiento = Number(covRow?.con_asiento ?? 0)

    return NextResponse.json({
      accounts: filas,
      totals: totales,
      coverage: {
        classified: conAsiento,
        unclassified: totalPlata - conAsiento,
        total: totalPlata,
        pct: totalPlata > 0 ? Math.round((conAsiento / totalPlata) * 100) : 0,
      },
      // Diagnóstico: movimientos leídos para armar el mayor. No es la cobertura.
      lines: { withAccount: conCuenta, withoutAccount: sinCuenta },
    })
  } catch (error: any) {
    console.error("Error en GET /api/accounting/general-ledger:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
