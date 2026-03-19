import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { getAfipConfigForAgency } from "@/lib/afip/afip-helpers"

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

    const config = await getAfipConfigForAgency(supabase, agencyId)

    if (!config) {
      return NextResponse.json({ configured: false })
    }

    return NextResponse.json({
      configured: true,
      config: {
        cuit: config.cuit ? `${config.cuit.substring(0, 2)}-XXXXXXX-${config.cuit.slice(-1)}` : '',
        environment: config.environment,
        punto_venta: config.point_of_sale,
      },
    })
  } catch (error: any) {
    console.error("[AFIP Status] Error:", error)
    return NextResponse.json({ error: error.message || "Error" }, { status: 500 })
  }
}
