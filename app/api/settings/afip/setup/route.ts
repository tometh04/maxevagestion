import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { runAfipAutomation } from "@/lib/afip/afip-client"

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // La automatización AFIP puede tardar hasta 2 min

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No tiene permisos" }, { status: 403 })
    }

    const body = await request.json()
    const { agency_id, cuit, password, punto_venta } = body

    if (!agency_id || !cuit || !password) {
      return NextResponse.json({ error: "Faltan campos requeridos (agency_id, cuit, password)" }, { status: 400 })
    }

    // Validar CUIT (11 dígitos)
    const cuitClean = cuit.replace(/\D/g, '')
    if (cuitClean.length !== 11) {
      return NextResponse.json({ error: "El CUIT debe tener 11 dígitos" }, { status: 400 })
    }

    // Validar acceso a la agencia
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    if (!agencyIds.includes(agency_id)) {
      return NextResponse.json({ error: "No tiene acceso a esta agencia" }, { status: 403 })
    }

    console.log("[AFIP Setup] Ejecutando automatización para CUIT:", cuitClean, "agency:", agency_id)

    // Ejecutar automatización AFIP SDK
    const automationResult = await runAfipAutomation(cuitClean, password)

    console.log("[AFIP Setup] Resultado automatización:", JSON.stringify(automationResult))

    const automationStatus = automationResult.success ? 'complete' : 'failed'

    // Upsert config en BD (desactivar anteriores primero)
    await supabase
      .from('afip_config')
      .update({ is_active: false })
      .eq('agency_id', agency_id)

    const { data: config, error: insertError } = await supabase
      .from('afip_config')
      .insert({
        agency_id,
        cuit: cuitClean,
        environment: 'production',
        punto_venta: punto_venta || 1,
        is_active: automationResult.success,
        automation_status: automationStatus,
      })
      .select()
      .single()

    if (insertError) {
      console.error("[AFIP Setup] Error saving config:", insertError)
      return NextResponse.json({ error: "Error al guardar configuración", details: insertError.message }, { status: 500 })
    }

    if (!automationResult.success) {
      return NextResponse.json({
        success: false,
        error: automationResult.error || "Error en la automatización AFIP",
        automation_status: 'failed',
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: "AFIP configurado correctamente",
      config: {
        cuit: cuitClean,
        environment: 'production',
        punto_venta: punto_venta || 1,
        automation_status: 'complete',
      },
    })
  } catch (error: any) {
    // No atrapar NEXT_REDIRECT
    if (error?.digest?.startsWith('NEXT_REDIRECT')) throw error
    console.error("[AFIP Setup] Error:", error)
    return NextResponse.json({ error: error.message || "Error al configurar AFIP" }, { status: 500 })
  }
}
