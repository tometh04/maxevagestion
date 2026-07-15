import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"

export const dynamic = 'force-dynamic'

function maskCuit(cuit: string): string {
  if (!cuit || cuit.length < 2) return cuit
  return `${cuit.substring(0, 2)}-XXXXXXX-${cuit.slice(-1)}`
}

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

    // Leer la integración directamente (incluye estados 'pending' del modo manual,
    // que getAfipConfigForAgency no devuelve porque filtra 'active').
    const { data: integration } = await (supabase.from("integrations") as any)
      .select("status, config")
      .eq("agency_id", agencyId)
      .eq("integration_type", "afip")
      .maybeSingle()

    const config = (integration as any)?.config
    if (!integration || !config) {
      return NextResponse.json({ configured: false })
    }

    const hasCert = !!(config.cert && config.key)
    const hasPendingCsr = !!config.pending_csr && !config.cert
    const certMode: "auto" | "manual" = config.cert_mode === "manual" ? "manual" : "auto"

    return NextResponse.json({
      // "configured" = listo para facturar (integración activa con cert)
      configured: (integration as any).status === "active",
      status: (integration as any).status,
      has_cert: hasCert,
      cert_mode: certMode,
      has_pending_csr: hasPendingCsr,
      config: {
        cuit: maskCuit(config.cuit),
        cuit_representada: config.cuit_representada ? maskCuit(config.cuit_representada) : null,
        environment: config.environment,
        punto_venta: config.point_of_sale,
      },
    })
  } catch (error: any) {
    if (error?.digest?.startsWith('NEXT_REDIRECT')) throw error
    console.error("[AFIP Status] Error:", error)
    return NextResponse.json({ error: error.message || "Error" }, { status: 500 })
  }
}
