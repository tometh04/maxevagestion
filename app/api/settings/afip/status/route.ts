import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const agencyId = searchParams.get("agencyId")

    if (!agencyId) {
      return NextResponse.json({ error: "agencyId requerido" }, { status: 400 })
    }

    // Validar acceso
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    if (!agencyIds.includes(agencyId)) {
      return NextResponse.json({ error: "No tiene acceso a esta agencia" }, { status: 403 })
    }

    const { data: config } = await supabase
      .from('afip_config')
      .select('cuit, environment, punto_venta, automation_status, is_active, created_at')
      .eq('agency_id', agencyId)
      .eq('is_active', true)
      .maybeSingle()

    if (!config) {
      return NextResponse.json({ configured: false })
    }

    return NextResponse.json({
      configured: config.automation_status === 'complete',
      config: {
        cuit: config.cuit ? `${config.cuit.substring(0, 2)}-XXXXXXX-${config.cuit.slice(-1)}` : '',
        environment: config.environment,
        punto_venta: config.punto_venta,
        automation_status: config.automation_status,
        created_at: config.created_at,
      },
    })
  } catch (error: any) {
    console.error("[AFIP Status] Error:", error)
    return NextResponse.json({ error: error.message || "Error" }, { status: 500 })
  }
}
