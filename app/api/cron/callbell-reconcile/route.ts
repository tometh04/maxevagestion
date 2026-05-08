import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { createAdminClient } from "@/lib/supabase/server"
import { reconcileAllAdvancedOrgs } from "@/lib/integrations/callbell/reconcile"

/**
 * Endpoint para Railway Cron — reconcilia el estado entre Callbell y Vibook
 * para todas las orgs en advanced mode. Se ejecuta cada 30 min.
 *
 * Protegido con CRON_SECRET token (Bearer auth, mismo patrón que el resto de
 * los crons en /api/cron/*).
 *
 * Schedule sugerido en Railway: cada 30 min (slash-30 * * * *).
 * Comando: curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *          https://app.vibook.ai/api/cron/callbell-reconcile
 *
 * Bypass de RLS via createAdminClient (necesario porque el cron no tiene
 * usuario logueado y necesita ver todas las orgs).
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const start = Date.now()
  try {
    const admin = createAdminClient() as unknown as SupabaseClient<Database>
    const result = await reconcileAllAdvancedOrgs(admin)
    return NextResponse.json({
      success: true,
      duration_ms: Date.now() - start,
      timestamp: new Date().toISOString(),
      ...result,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("callbell-reconcile error:", e)
    return NextResponse.json(
      { error: msg, duration_ms: Date.now() - start },
      { status: 500 }
    )
  }
}

// GET delega a POST para facilitar pruebas manuales con `curl -X GET`.
export async function GET(request: Request) {
  return POST(request)
}
