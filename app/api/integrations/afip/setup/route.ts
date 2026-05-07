/**
 * Endpoint para configurar AFIP automáticamente
 * Recibe CUIT, Clave Fiscal y Punto de Venta, y configura todo automáticamente
 */

import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"
import { setupAfipAutomatically } from "@/lib/afip/afip-automations"
import { saveAfipConfigForAgency, getAfipConfigForAgency } from "@/lib/afip/afip-helpers"
import { formatCuit, isValidCuit } from "@/lib/afip/afip-config"
import { testConnection, getLastVoucherNumber } from "@/lib/afip/afip-client"
import { logSecurityEvent } from "@/lib/security/audit"

export const dynamic = 'force-dynamic'

// Schema de validación
const setupAfipSchema = z.object({
  agency_id: z.string().uuid("ID de agencia inválido"),
  cuit: z.string().min(1, "CUIT es requerido"),
  // Usuario de ARCA (puede ser el CUIT o un usuario específico)
  username: z.string().min(1, "Usuario de ARCA es requerido"),
  // Password/Clave Fiscal
  password: z.string().min(1, "Clave Fiscal/Password es requerida"),
  point_of_sale: z.number().int().positive("Punto de venta debe ser un número positivo"),
  environment: z.enum(['sandbox', 'production']).default('sandbox'),
  // API Key de AFIP SDK (opcional, puede venir de env vars globales)
  api_key: z.string().optional(),
})

// POST - Configurar AFIP automáticamente
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "No tiene permiso para configurar integraciones" },
        { status: 403 }
      )
    }

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    const body = await request.json()
    const validatedData = setupAfipSchema.parse(body)

    // Verificar que la agencia pertenece al usuario
    if (!agencyIds.includes(validatedData.agency_id)) {
      return NextResponse.json(
        { error: "No tiene acceso a esta agencia" },
        { status: 403 }
      )
    }

    // Validar formato de CUIT
    const formattedCuit = formatCuit(validatedData.cuit)
    if (!isValidCuit(formattedCuit)) {
      return NextResponse.json(
        { error: "CUIT inválido. Debe tener 11 dígitos." },
        { status: 400 }
      )
    }

    // Obtener API Key (de body o env vars)
    const apiKey = validatedData.api_key || process.env.AFIP_SDK_API_KEY
    
    if (!apiKey) {
      return NextResponse.json(
        { error: "API Key de AFIP SDK es requerida. Configure AFIP_SDK_API_KEY en variables de entorno o envíela en el request." },
        { status: 400 }
      )
    }

    // Configurar AFIP automáticamente
    const setupResult = await setupAfipAutomatically(
      apiKey,
      formattedCuit,
      validatedData.username,
      validatedData.password,
      validatedData.point_of_sale,
      validatedData.environment
    )

    if (!setupResult.success || !setupResult.config) {
      return NextResponse.json(
        {
          success: false,
          error: setupResult.error || "Error al configurar AFIP",
          steps: setupResult.steps,
        },
        { status: 400 }
      )
    }

    // Guardar configuración en la base de datos
    const saveResult = await saveAfipConfigForAgency(
      supabase,
      validatedData.agency_id,
      setupResult.config,
      user.id
    )

    if (!saveResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: saveResult.error || "Error al guardar configuración",
        },
        { status: 500 }
      )
    }

    // Test post-setup 2026-05-06: tras guardar la config validamos
    // contra AFIP que (1) cert+key se autentican OK y (2) el punto de
    // venta está autorizado. Esto evita que el user descubra recién al
    // emitir la primera factura que el setup quedó mal.
    //
    // No emitimos factura ni tocamos el padrón — solo
    //   GetServiceTA(wsfe) + FECompUltimoAutorizado para el PV+cbteTipo=6.
    // Ambas operaciones son read-only contra AFIP.
    const verification = await runPostSetupVerification(
      supabase,
      validatedData.agency_id,
      validatedData.point_of_sale
    )

    // Crear log con resultado de la verificación
    await (supabase.from("integration_logs") as any).insert({
      integration_id: saveResult.integrationId,
      log_type: verification.success ? 'success' : 'warning',
      action: 'setup',
      message: verification.success
        ? `AFIP configurado y verificado para CUIT ${formattedCuit}`
        : `AFIP configurado pero verificación falló: ${verification.error}`,
      details: {
        cuit: formattedCuit,
        environment: validatedData.environment,
        point_of_sale: validatedData.point_of_sale,
        verification,
      },
    })

    // Audit log: setup AFIP. Crítico para "yo no cambié mi config" o
    // "quién cambió el CUIT". NO logueamos password ni cert. Solo qué
    // CUIT, qué PV, qué agency, qué environment, y si verificó OK.
    logSecurityEvent({
      eventType: "afip_integration_setup",
      severity: "INFO",
      actorUserId: user.id,
      actorOrgId: user.org_id ?? null,
      targetEntity: "integration",
      targetEntityId: saveResult.integrationId ?? null,
      details: {
        agency_id: validatedData.agency_id,
        cuit: formattedCuit,
        environment: validatedData.environment,
        point_of_sale: validatedData.point_of_sale,
        verified: verification.success,
        verification_error: verification.success ? null : verification.error,
      },
    })

    return NextResponse.json({
      success: true,
      verified: verification.success,
      verification_warning: verification.success ? null : verification.error,
      message: verification.success
        ? "AFIP configurado y verificado. Ya podés emitir facturas."
        : `AFIP configurado pero la verificación tiró: ${verification.error}. Podés intentar emitir igualmente, o revisá el punto de venta.`,
      integration_id: saveResult.integrationId,
      config: {
        cuit: formattedCuit,
        environment: validatedData.environment,
        point_of_sale: validatedData.point_of_sale,
      },
    })
  } catch (error: any) {
    console.error("Error in POST /api/integrations/afip/setup:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al configurar AFIP" },
      { status: 500 }
    )
  }
}

/**
 * Verifica que la config de AFIP recién guardada efectivamente funcione
 * contra el WSFE de producción/sandbox.
 *
 * Hace 2 chequeos read-only:
 *   1. testConnection: GetServiceTA('wsfe') — autentica con cert+key,
 *      retorna el TA. Si falla, hay problema con cert/key (típico:
 *      cert vencido, CUIT no autorizado en IVA, clave fiscal cambiada).
 *   2. getLastVoucherNumber(pv, cbteTipo=6): consulta el último Factura B
 *      autorizado para ese punto de venta. Si AFIP no reconoce el PV o
 *      no autorizó WSFE para ese PV, esto explota con un error específico.
 *
 * Devuelve { success: true } solo si ambos pasan. Si falla cualquiera,
 * devuelve { success: false, error } con el mensaje literal de AFIP para
 * que el user lo pueda accionar (típico: "punto de venta inexistente",
 * "el cuit no está autorizado a usar este servicio").
 */
async function runPostSetupVerification(
  supabase: any,
  agencyId: string,
  pointOfSale: number
): Promise<{ success: boolean; error?: string; details?: any }> {
  try {
    const config = await getAfipConfigForAgency(supabase, agencyId)
    if (!config) {
      return { success: false, error: "Config no se guardó correctamente (no se pudo recargar)" }
    }

    // Step 1: cert+key autentican con AFIP
    const tConn = await testConnection(config)
    if (!tConn.success) {
      return {
        success: false,
        error: tConn.message || "No se pudo autenticar con AFIP",
        details: { step: "testConnection" },
      }
    }

    // Step 2: el PV está autorizado para emitir Factura B (cbteTipo 6) vía WSFE
    const lastB = await getLastVoucherNumber(config, pointOfSale, 6)
    if (!lastB.success) {
      return {
        success: false,
        error: lastB.error || "El punto de venta no está autorizado para Factura B en WSFE",
        details: { step: "getLastVoucherNumber", pto_vta: pointOfSale, cbte_tipo: 6 },
      }
    }

    return {
      success: true,
      details: {
        last_voucher_b: lastB.data?.CbteNro ?? 0,
        environment: config.environment,
        pto_vta: pointOfSale,
      },
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Error inesperado en la verificación",
    }
  }
}
