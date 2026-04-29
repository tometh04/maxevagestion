import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { autoUpdateExchangeRate } from "@/lib/accounting/bcra-exchange-rates"

/**
 * Endpoint para cron jobs - Actualizar tipo de cambio oficial desde BCRA
 * Protegido con CRON_SECRET token
 * Debe ejecutarse diariamente (ej: 08:00 Argentina time)
 *
 * Usa adminClient (service_role) porque el cron corre sin sesión de user
 * — el anon client queda bloqueado por RLS al intentar insertar en
 * exchange_rates.
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createAdminClient() as any

    const { data: adminUser } = await supabase
      .from("users")
      .select("id")
      .eq("role", "SUPER_ADMIN")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    const userId = (adminUser as { id: string } | null)?.id || undefined

    const result = await autoUpdateExchangeRate(supabase, userId)

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: "No se pudo obtener el tipo de cambio de ninguna fuente",
          timestamp: new Date().toISOString(),
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      rate: result.rate,
      source: result.source,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("Error in cron /api/cron/exchange-rates:", error)
    return NextResponse.json(
      { error: error.message || "Error al actualizar tipo de cambio" },
      { status: 500 }
    )
  }
}
