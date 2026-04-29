/**
 * Retorna el estado de la integración AFIP para una agencia específica.
 * Antes este endpoint devolvía info basada en variables de entorno globales
 * (AFIP_CUIT, AFIP_PASSWORD), lo que en un SaaS multi-tenant hacía que
 * TODOS los tenants vieran "Credenciales del sistema configuradas" con el
 * CUIT de Lozada. Ahora consulta la tabla `integrations` filtrada por
 * agency_id, así cada org ve sólo lo suyo.
 */
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

function maskCuit(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (digits.length < 3) return null
  return `${digits.slice(0, 2)}-XXXXXXX-${digits.slice(-1)}`
}

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const role = user.role as string
    if (role !== "SUPER_ADMIN" && role !== "ORG_OWNER" && role !== "ADMIN") {
      return NextResponse.json({ error: "No tiene permisos" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const agencyId = searchParams.get("agencyId")

    if (!agencyId) {
      // Sin agencyId no podemos decidir — devolvemos "no configurado" para
      // que la UI muestre el formulario vacío en vez de un estado estancado.
      return NextResponse.json({
        cuitConfigured: false,
        passwordConfigured: false,
        cuitMasked: null,
      })
    }

    const supabase = await createServerClient()
    // RLS sobre `integrations` filtra por user_org_ids(), así que si la
    // agency es de otra org, esta query no devuelve nada.
    const { data: integration } = await (supabase.from("integrations") as any)
      .select("config, status")
      .eq("agency_id", agencyId)
      .eq("integration_type", "afip")
      .eq("status", "active")
      .maybeSingle()

    const config = (integration as any)?.config as any
    const cuit = typeof config?.cuit === "string" ? config.cuit : null
    const hasCert = !!(config?.cert || config?.cert_id)

    return NextResponse.json({
      cuitConfigured: !!cuit,
      passwordConfigured: hasCert, // tras el setup hay cert/key guardados
      cuitMasked: cuit ? maskCuit(cuit) : null,
    })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    return NextResponse.json({
      cuitConfigured: false,
      passwordConfigured: false,
      cuitMasked: null,
    })
  }
}
