import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { setupAfipAutomatically } from "@/lib/afip/afip-automations"
import { saveAfipConfigForAgency } from "@/lib/afip/afip-helpers"
import { isValidCuit, formatCuit } from "@/lib/afip/afip-config"

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
    const { agency_id, cuit, password, punto_venta, environment = 'production' } = body

    if (!agency_id || !cuit || !password || !punto_venta) {
      return NextResponse.json(
        { error: "Faltan campos requeridos (agency_id, cuit, password, punto_venta)" },
        { status: 400 }
      )
    }

    // Validar CUIT
    const cuitClean = formatCuit(cuit)
    if (!isValidCuit(cuitClean)) {
      return NextResponse.json({ error: "El CUIT debe tener 11 dígitos" }, { status: 400 })
    }

    // Validar punto de venta
    const ptoVtaNum = Number(punto_venta)
    if (!ptoVtaNum || ptoVtaNum < 1 || ptoVtaNum > 9999) {
      return NextResponse.json({ error: "Número de punto de venta inválido (1-9999)" }, { status: 400 })
    }

    // Validar acceso a la agencia
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    if (!agencyIds.includes(agency_id)) {
      return NextResponse.json({ error: "No tiene acceso a esta agencia" }, { status: 403 })
    }

    // Obtener API key del sistema
    const api_key = process.env.AFIP_SDK_API_KEY
    if (!api_key) {
      console.error("[AFIP Setup] AFIP_SDK_API_KEY no configurado en variables de entorno")
      return NextResponse.json(
        { error: "El sistema AFIP no está configurado. Contacte al administrador." },
        { status: 500 }
      )
    }

    console.log("[AFIP Setup] Iniciando automatización para CUIT:", cuitClean, "agency:", agency_id, "env:", environment)

    // Ejecutar automatización AFIP SDK: crea certificado + autoriza web service
    const automationResult = await setupAfipAutomatically(
      api_key,
      cuitClean,
      cuitClean, // username (en AFIP SDK el username para prod es el CUIT)
      password,
      ptoVtaNum,
      environment as 'sandbox' | 'production'
    )

    console.log("[AFIP Setup] Resultado automatización:", JSON.stringify(automationResult))

    if (!automationResult.success) {
      // Guardar config parcial (fallida) para que el admin vea el intento
      await saveAfipConfigForAgency(
        supabase,
        agency_id,
        {
          api_key,
          cuit: cuitClean,
          point_of_sale: ptoVtaNum,
          environment: environment as 'sandbox' | 'production',
        },
        user.id
      ).catch(() => {}) // No fallar si no se puede guardar

      return NextResponse.json({
        success: false,
        error: automationResult.error || "Error en la automatización AFIP",
        steps: automationResult.steps,
      }, { status: 400 })
    }

    // Guardar configuración exitosa en tabla integrations
    const saveResult = await saveAfipConfigForAgency(
      supabase,
      agency_id,
      {
        api_key,
        cuit: cuitClean,
        point_of_sale: ptoVtaNum,
        environment: environment as 'sandbox' | 'production',
        cert_id: automationResult.config?.cert_id,
      },
      user.id
    )

    if (!saveResult.success) {
      console.error("[AFIP Setup] Error guardando config:", saveResult.error)
      return NextResponse.json(
        { error: `AFIP configurado pero error al guardar: ${saveResult.error}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "AFIP configurado correctamente",
      config: {
        cuit: cuitClean,
        environment,
        punto_venta: ptoVtaNum,
        steps: automationResult.steps,
      },
    })
  } catch (error: any) {
    if (error?.digest?.startsWith('NEXT_REDIRECT')) throw error
    console.error("[AFIP Setup] Error:", error)
    return NextResponse.json({ error: error.message || "Error al configurar AFIP" }, { status: 500 })
  }
}
