/**
 * Descarga el CSR pendiente de una agencia (modo manual / sociedad) como archivo,
 * para re-tramitarlo en AFIP si se perdió el original.
 */
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const agencyId = searchParams.get("agencyId")

    if (!agencyId) {
      return NextResponse.json({ error: "agencyId requerido" }, { status: 400 })
    }

    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    if (!agencyIds.includes(agencyId)) {
      return NextResponse.json({ error: "No tiene acceso a esta agencia" }, { status: 403 })
    }

    const { data: integration } = await (supabase.from("integrations") as any)
      .select("config")
      .eq("agency_id", agencyId)
      .eq("integration_type", "afip")
      .maybeSingle()

    const config = (integration as any)?.config
    const csr = config?.pending_csr as string | undefined
    if (!csr) {
      return NextResponse.json({ error: "No hay un CSR pendiente para esta agencia" }, { status: 404 })
    }

    const cuit = String(config?.cuit || "afip").replace(/\D/g, "") || "afip"
    return new Response(csr, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${cuit}.csr"`,
      },
    })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    console.error("[AFIP CSR download] Error:", error)
    return NextResponse.json({ error: error.message || "Error al descargar el CSR" }, { status: 500 })
  }
}
