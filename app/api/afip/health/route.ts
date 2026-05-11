import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getOrgAfipHealth } from "@/lib/afip/check-org-health"

export const dynamic = "force-dynamic"

/**
 * GET /api/afip/health
 *
 * Devuelve el estado de salud de la integración AFIP del org del usuario.
 * Pensado para el badge de la sidebar — fetcheado on-mount y cada N min.
 *
 * Cache HTTP 60s + SWR 5min: cambios en estado de AFIP son lentos
 * (failures suceden a lo largo de horas), no necesitamos refresh real-time.
 *
 * Response:
 *   { status: 'ok' | 'warning' | 'error' | 'not-configured',
 *     recentFailures, lastErrorAt, lastErrorCode, message }
 */
export async function GET() {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const health = await getOrgAfipHealth(supabase, user.org_id)
    return NextResponse.json(health, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      },
    })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    console.error("Error in GET /api/afip/health:", error)
    return NextResponse.json(
      { status: "not-configured", recentFailures: 0, lastErrorAt: null, lastErrorCode: null, message: null },
      { status: 200 }
    )
  }
}
