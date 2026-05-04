/**
 * PATCH /api/settings/afip/update-punto-venta
 *
 * Actualiza solo el `point_of_sale` de la integración AFIP existente, sin tocar
 * cert/key/CUIT. Pensado para el caso del Bug #18: el setup persiste PV=1 por
 * default y al detectar los puntos WSFE habilitados (FEParamGetPtosVenta) la UI
 * llama a este endpoint para alinear el PV persistido con el detectado.
 */
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"

export const dynamic = "force-dynamic"

export async function PATCH(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No tiene permisos" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { agency_id, punto_venta } = body

    if (!agency_id) {
      return NextResponse.json({ error: "agency_id requerido" }, { status: 400 })
    }
    const ptoVtaNum = Number(punto_venta)
    if (!Number.isFinite(ptoVtaNum) || ptoVtaNum < 1 || ptoVtaNum > 9999) {
      return NextResponse.json(
        { error: "Número de punto de venta inválido (1-9999)" },
        { status: 400 }
      )
    }

    // Validar acceso a la agencia
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    if (!agencyIds.includes(agency_id)) {
      return NextResponse.json({ error: "No tiene acceso a esta agencia" }, { status: 403 })
    }

    // Buscar integración AFIP existente
    const { data: existing } = await (supabase
      .from("integrations") as any)
      .select("id, config")
      .eq("agency_id", agency_id)
      .eq("integration_type", "afip")
      .maybeSingle()

    if (!existing) {
      return NextResponse.json(
        { error: "Esta agencia no tiene AFIP configurado todavía" },
        { status: 404 }
      )
    }

    const newConfig = {
      ...(existing.config || {}),
      point_of_sale: ptoVtaNum,
    }

    const { error: updateError } = await (supabase
      .from("integrations") as any)
      .update({
        config: newConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)

    if (updateError) {
      console.error("[AFIP update-punto-venta] Error:", updateError)
      return NextResponse.json(
        { error: `Error al actualizar PV: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      punto_venta: ptoVtaNum,
    })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    console.error("[AFIP update-punto-venta] Error:", error)
    return NextResponse.json(
      { error: error.message || "Error al actualizar punto de venta" },
      { status: 500 }
    )
  }
}
