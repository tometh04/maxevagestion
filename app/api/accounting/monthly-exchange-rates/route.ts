import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"

/**
 * GET /api/accounting/monthly-exchange-rates
 * Obtiene el tipo de cambio mensual para un año/mes específico
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    if (!canAccessModule(user.role as any, "accounting")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString())
    const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString())

    if (month < 1 || month > 12) {
      return NextResponse.json({ error: "Mes inválido" }, { status: 400 })
    }

    const { data, error } = await (supabase.from("monthly_exchange_rates") as any)
      .select("*")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle()

    if (error) {
      console.error("Error fetching monthly exchange rate:", error)
      return NextResponse.json({ error: "Error al obtener tipo de cambio mensual" }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error("Error in GET /api/accounting/monthly-exchange-rates:", error)
    return NextResponse.json({ error: error.message || "Error al obtener tipo de cambio mensual" }, { status: 500 })
  }
}

/**
 * POST /api/accounting/monthly-exchange-rates
 * Crea o actualiza el tipo de cambio mensual
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    if (!canAccessModule(user.role as any, "accounting")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()
    
    const { year, month, usd_to_ars_rate } = body

    if (!year || !month || !usd_to_ars_rate) {
      return NextResponse.json({ error: "Faltan campos requeridos: year, month, usd_to_ars_rate" }, { status: 400 })
    }

    if (month < 1 || month > 12) {
      return NextResponse.json({ error: "Mes inválido (debe estar entre 1 y 12)" }, { status: 400 })
    }

    if (parseFloat(usd_to_ars_rate) <= 0) {
      return NextResponse.json({ error: "El tipo de cambio debe ser mayor a 0" }, { status: 400 })
    }

    const { data, error } = await (supabase.from("monthly_exchange_rates") as any)
      .upsert(
        {
          year,
          month,
          usd_to_ars_rate: parseFloat(usd_to_ars_rate),
          created_by: user.id,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "year,month",
        }
      )
      .select()
      .single()

    if (error) {
      console.error("Error upserting monthly exchange rate:", error)
      return NextResponse.json({ error: "Error al guardar tipo de cambio mensual" }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error("Error in POST /api/accounting/monthly-exchange-rates:", error)
    return NextResponse.json({ error: error.message || "Error al guardar tipo de cambio mensual" }, { status: 500 })
  }
}
