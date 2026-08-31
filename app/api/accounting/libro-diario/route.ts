import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getUserAgencyIds, canPerformAction } from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"
import { loadReportCompany } from "@/lib/reports/report-company"
import { armarLibroDiario, tamañoDelLibro, type AsientoCrudo } from "@/lib/accounting/libro-diario"
import { generateLibroDiarioPdf } from "@/lib/pdf/libro-diario-pdf"

/**
 * GET /api/accounting/libro-diario
 *
 * El Libro Diario de un período: en JSON para la pantalla, en PDF con
 * `?formato=pdf`.
 *
 * POR QUÉ HAY UN TOPE
 * -------------------
 * Medido en producción, un mes ronda los 1.600 asientos y 3.100 líneas, que se
 * generan sin problema. Un ejercicio entero de Lozada llega a 19.000 asientos y
 * ahí el PDF no se arma dentro de un request: se cae por timeout después de
 * hacer todo el trabajo.
 *
 * En vez de dejar que eso pase, se corta antes y se explica. Un rango mensual
 * es además cómo se encuadernan los libros, así que el tope no molesta al uso
 * normal.
 */
const MAX_ASIENTOS = 5000
const PAGE = 1000

export async function GET(request: Request) {
  const { user } = await getCurrentUser()
  if (!user?.org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
  }

  const supabase = await createServerClient()
  const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
  const perms = await resolveUserPermissions(
    supabase as any,
    user.id,
    user.org_id,
    (user as any).roles ?? [user.role],
    agencyIds
  )
  if (!canPerformAction(user, "accounting", "read", perms)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const desde = searchParams.get("desde")
  const hasta = searchParams.get("hasta")
  const agencyId = searchParams.get("agencyId")
  const formato = searchParams.get("formato")

  if (!desde || !hasta) {
    return NextResponse.json({ error: "Faltan las fechas del período" }, { status: 400 })
  }
  if (desde > hasta) {
    return NextResponse.json({ error: "La fecha de inicio es posterior a la de fin" }, { status: 400 })
  }
  if (agencyId && agencyIds.length > 0 && !agencyIds.includes(agencyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    // Se pagina de verdad: el cap silencioso de PostgREST daría un libro
    // incompleto que igual parecería correcto, y un libro al que le faltan
    // asientos no es un libro con menos hojas, es un libro falso.
    const crudos: AsientoCrudo[] = []
    for (let from = 0; ; from += PAGE) {
      let q = (supabase.from("journal_entries") as any)
        .select(
          "id, entry_date, description, currency, entry_number, agency_id, ledger_movements!ledger_movements_journal_entry_id_fkey(debit_amount, credit_amount, concept, chart_of_accounts(account_code, account_name))"
        )
        .eq("org_id", user.org_id)
        .gte("entry_date", desde)
        .lte("entry_date", hasta)
        .order("entry_date", { ascending: true })
        .range(from, from + PAGE - 1)

      if (agencyId) q = q.eq("agency_id", agencyId)

      const { data, error } = await q
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break

      for (const e of data as any[]) {
        crudos.push({
          id: e.id,
          entry_date: String(e.entry_date).slice(0, 10),
          description: e.description,
          currency: e.currency,
          entry_number: e.entry_number,
          lineas: ((e.ledger_movements ?? []) as any[])
            // Una línea sin cuenta del plan no se puede imprimir en un libro:
            // no habría qué poner en la columna Cuenta.
            .filter((l) => l.chart_of_accounts)
            .map((l) => ({
              account_code: l.chart_of_accounts.account_code,
              account_name: l.chart_of_accounts.account_name,
              debit_amount: l.debit_amount,
              credit_amount: l.credit_amount,
              concept: l.concept,
            })),
        })
      }

      if (crudos.length > MAX_ASIENTOS) {
        return NextResponse.json(
          {
            error: `El período tiene más de ${MAX_ASIENTOS.toLocaleString("es-AR")} asientos. Pedilo por rangos más cortos: un mes por vez es lo habitual para encuadernar.`,
            demasiadoGrande: true,
          },
          { status: 413 }
        )
      }
      if (data.length < PAGE) break
    }

    const libro = armarLibroDiario(crudos, desde, hasta)

    if (formato !== "pdf") {
      return NextResponse.json({ ...libro, tamaño: tamañoDelLibro(libro) })
    }

    let nombreAgencia: string | null = null
    if (agencyId) {
      const { data: ag } = await (supabase.from("agencies") as any)
        .select("name")
        .eq("id", agencyId)
        .eq("org_id", user.org_id)
        .maybeSingle()
      nombreAgencia = ag?.name ?? null
    }

    const company = await loadReportCompany({ supabase, orgId: user.org_id })
    const pdf = generateLibroDiarioPdf({ libro, company, agencia: nombreAgencia })

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="libro-diario-${desde}_${hasta}.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e: any) {
    console.error("[accounting/libro-diario] error:", e?.message)
    return NextResponse.json({ error: "No se pudo armar el Libro Diario" }, { status: 500 })
  }
}
