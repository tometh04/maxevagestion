import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions, assertPermission } from "@/lib/permissions-agency"

export const dynamic = 'force-dynamic'

async function resolvePerms(user: any, supabase: any) {
  const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
  return user.org_id
    ? resolveUserPermissions(supabase as any, user.id, user.org_id, user.role, agencyIds)
    : Promise.resolve(null)
}

/**
 * GET /api/accounting/monthly-exchange-rates
 * Obtiene el tipo de cambio para un mes específico
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const perms = await resolvePerms(user, supabase)
    if (!assertPermission(user.role, perms, "accounting", "read")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)

    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString())
    const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString())

    // Buscar TC guardado para este mes
    const { data, error } = await (supabase.from("monthly_exchange_rates") as any)
      .select("*")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle()

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching monthly exchange rate:", error)
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error("Error in GET /api/accounting/monthly-exchange-rates:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/accounting/monthly-exchange-rates
 * Guarda el tipo de cambio para un mes específico
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const perms = await resolvePerms(user, supabase)
    if (!assertPermission(user.role, perms, "accounting", "write")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const body = await request.json()

    const { year, month, usd_to_ars_rate } = body

    if (!year || !month || !usd_to_ars_rate) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    if (parseFloat(usd_to_ars_rate) <= 0) {
      return NextResponse.json({ error: "El tipo de cambio debe ser mayor a 0" }, { status: 400 })
    }

    // Upsert: crear o actualizar
    const { data, error } = await (supabase.from("monthly_exchange_rates") as any)
      .upsert(
        {
          year,
          month,
          usd_to_ars_rate: parseFloat(usd_to_ars_rate),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "year,month",
        }
      )
      .select()
      .single()

    if (error) {
      console.error("Error saving monthly exchange rate:", error)
      return NextResponse.json({ error: "Error al guardar tipo de cambio" }, { status: 500 })
    }

    // --- Validation: check for large changes vs previous month ---
    let warning: string | undefined
    try {
      const prevMonth = month === 1 ? 12 : month - 1
      const prevYear = month === 1 ? year - 1 : year

      const { data: prevRate } = await (supabase.from("monthly_exchange_rates") as any)
        .select("usd_to_ars_rate")
        .eq("year", prevYear)
        .eq("month", prevMonth)
        .maybeSingle()

      if (prevRate?.usd_to_ars_rate) {
        const previous = Number(prevRate.usd_to_ars_rate)
        const current = parseFloat(usd_to_ars_rate)
        const pctChange = Math.abs(((current - previous) / previous) * 100)

        if (pctChange > 20) {
          warning = `ALERTA: El tipo de cambio cambió un ${pctChange.toFixed(1)}% respecto al mes anterior (${previous} → ${current}). Variación muy significativa, por favor verificar.`
        } else if (pctChange > 5) {
          warning = `Aviso: El tipo de cambio cambió un ${pctChange.toFixed(1)}% respecto al mes anterior (${previous} → ${current}). Verificar que sea correcto.`
        }
      }
    } catch (validationError) {
      // Non-blocking – if the validation query fails we still return the saved data
      console.error("Error checking previous month exchange rate:", validationError)
    }

    return NextResponse.json({ data, ...(warning ? { warning } : {}) })
  } catch (error: any) {
    console.error("Error in POST /api/accounting/monthly-exchange-rates:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
