import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { setupAfipAutomatically } from "@/lib/afip/afip-automations"
import { saveAfipConfigForAgency } from "@/lib/afip/afip-helpers"

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
    const { agency_id, cuit, password, punto_venta, environment } = body

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

    const apiKey = process.env.AFIP_SDK_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "AFIP SDK no configurado en el servidor" }, { status: 500 })
    }

    const env = (environment === 'sandbox' ? 'sandbox' : 'production') as 'sandbox' | 'production'
    const ptoVenta = parseInt(String(punto_venta || '1'), 10) || 1

    console.log("[AFIP Setup] Ejecutando automatización para CUIT:", cuitClean, "agency:", agency_id, "env:", env)

    const automationResult = await setupAfipAutomatically(apiKey, cuitClean, cuitClean, password, ptoVenta, env)

    console.log("[AFIP Setup] Resultado:", JSON.stringify(automationResult))

    if (!automationResult.success) {
      return NextResponse.json({
        success: false,
        error: automationResult.error || "Error en la automatización AFIP",
        steps: automationResult.steps,
      }, { status: 400 })
    }

    // Guardar en tabla integrations (no en afip_config)
    const saveResult = await saveAfipConfigForAgency(supabase, agency_id, {
      api_key: apiKey,
      cuit: cuitClean,
      point_of_sale: ptoVenta,
      environment: env,
      cert_id: automationResult.config?.cert_id,
    }, user.id)

    if (!saveResult.success) {
      console.error("[AFIP Setup] Error guardando config:", saveResult.error)
      return NextResponse.json({ error: "Error al guardar configuración", details: saveResult.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "AFIP configurado correctamente",
      config: {
        cuit: cuitClean,
        environment: env,
        punto_venta: ptoVenta,
        automation_status: 'complete',
      },
    })
  } catch (error: any) {
    if (error?.digest?.startsWith('NEXT_REDIRECT')) throw error
    console.error("[AFIP Setup] Error:", error)
    return NextResponse.json({ error: error.message || "Error al configurar AFIP" }, { status: 500 })
  }
}
