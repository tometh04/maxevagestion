/**
 * Estado de Resultados y Balance — VIB-143 (E2).
 *
 * Los dos salen de la misma consulta porque leen las mismas líneas de asiento:
 * el Estado de Resultados mira las cuentas 4.x de un período, el Balance mira
 * las 1.x/2.x/3.x acumuladas hasta una fecha.
 *
 * DESDE CUÁNDO
 * ------------
 * Desde `financial_settings.accounting_start_date` de la agencia. Antes de esa
 * fecha hay asientos, pero de una época en la que la contabilidad no se llevaba
 * acá: se siguen viendo en el Mayor y no entran a los estados formales.
 *
 * EN QUÉ MONEDA
 * -------------
 * En la `primary_currency` de la agencia. Lozada Rosario la tiene en dólares y
 * Madero en pesos: la misma organización puede presentar distinto por sucursal,
 * y por eso la configuración es por agencia.
 */
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions, assertPermission } from "@/lib/permissions-agency"
import {
  armarBalance,
  armarEstadoDeResultados,
  type Cotizaciones,
  type LineaContable,
  type Moneda,
} from "@/lib/accounting/financial-statements"

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
    const agencyId = searchParams.get("agencyId") || null
    const hasta = searchParams.get("hasta") || new Date().toISOString().slice(0, 10)

    // ---------------------------------------------------- configuración
    // Si el reporte es de UNA agencia, manda su configuración. Consolidado usa
    // la de la primera del usuario, que es el criterio que ya aplica el resto
    // de la pantalla de Finanzas.
    // El filtro por `org_id` es explícito y no se apoya en RLS. Sin él, la
    // query se quedaba con la primera fila que encontrara cuando el usuario no
    // tiene agencias asignadas. Hoy RLS lo acota, pero es el anti-patrón que
    // marca AGENTS.md: el día que esto corra con service role —un cron, un
    // backfill— devolvería la configuración de otra organización, y
    // `primary_currency` y `accounting_start_date` deciden cómo se valúa y
    // desde cuándo se informa.
    let settingsQuery = (supabase.from("financial_settings") as any)
      .select("agency_id, primary_currency, accounting_start_date")
      .eq("org_id", orgId)
    if (agencyId) settingsQuery = settingsQuery.eq("agency_id", agencyId)
    else if (agencyIds.length > 0) settingsQuery = settingsQuery.in("agency_id", agencyIds)

    const { data: settingsRows } = await settingsQuery
    const settings = ((settingsRows ?? []) as any[])[0] ?? null

    const moneda: Moneda = (settings?.primary_currency === "ARS" ? "ARS" : "USD") as Moneda
    const desde: string | null = settings?.accounting_start_date ?? null

    if (!desde) {
      // Sin fecha de inicio no hay estado que emitir. Se responde explícito para
      // que la pantalla mande a configurarlo, en vez de mostrar un informe vacío
      // que parezca un error.
      return NextResponse.json({
        configurado: false,
        currency: moneda,
        message:
          "Falta definir desde cuándo esta agencia lleva su contabilidad en vibook.",
      })
    }

    // ---------------------------------------------------- cotizaciones
    const { data: rates } = await (supabase.from("monthly_exchange_rates") as any)
      .select("year, month, usd_to_ars_rate")
      .eq("org_id", orgId)

    const cotizaciones: Cotizaciones = {}
    for (const r of ((rates ?? []) as any[])) {
      const mes = `${r.year}-${String(r.month).padStart(2, "0")}`
      cotizaciones[mes] = Number(r.usd_to_ars_rate)
    }

    // ---------------------------------------------------- líneas
    // Se pagina de verdad: el cap silencioso de 1.000 filas de PostgREST daría
    // un estado contable incompleto que igual parecería correcto.
    const lineas: LineaContable[] = []
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      let q = (supabase.from("ledger_movements") as any)
        .select(
          "debit_amount, credit_amount, currency, movement_date, chart_account_id, journal_entries!inner(agency_id, org_id, close_kind), chart_of_accounts!inner(account_code, account_name, category)"
        )
        .eq("org_id", orgId)
        .not("chart_account_id", "is", null)
        .gte("movement_date", desde)
        .lte("movement_date", hasta)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1)

      if (agencyId) q = q.eq("journal_entries.agency_id", agencyId)

      const { data, error } = await q
      if (error) {
        console.error("Error leyendo líneas para los estados contables:", error.message)
        return NextResponse.json({ error: "Error al armar los estados" }, { status: 500 })
      }
      if (!data || data.length === 0) break

      for (const m of data as any[]) {
        const cuenta = m.chart_of_accounts
        if (!cuenta) continue
        lineas.push({
          account_code: cuenta.account_code,
          account_name: cuenta.account_name,
          category: cuenta.category,
          currency: m.currency,
          debit: Number(m.debit_amount) || 0,
          credit: Number(m.credit_amount) || 0,
          movement_date: String(m.movement_date).slice(0, 10),
          close_kind: m.journal_entries?.close_kind ?? null,
        })
      }

      if (data.length < PAGE) break
    }

    return NextResponse.json({
      configurado: true,
      desde,
      hasta,
      currency: moneda,
      resultados: armarEstadoDeResultados(lineas, cotizaciones, moneda),
      balance: armarBalance(lineas, cotizaciones, moneda),
      lineas: lineas.length,
    })
  } catch (error: any) {
    console.error("Error en GET /api/accounting/financial-statements:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
