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
import { saveAfipConfigForAgency } from "@/lib/afip/afip-helpers"
import { formatCuit, isValidCuit } from "@/lib/afip/afip-config"

export const dynamic = 'force-dynamic'

// Schema de validación
const setupAfipSchema = z.object({
  agency_id: z.string().uuid("ID de agencia inválido"),
  cuit: z.string().min(1, "CUIT es requerido"),
  clave_fiscal: z.string().min(1, "Clave Fiscal es requerida"),
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
      validatedData.clave_fiscal,
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

    // Crear log
    await supabase.from("integration_logs").insert({
      integration_id: saveResult.integrationId,
      log_type: 'success',
      action: 'setup',
      message: `AFIP configurado automáticamente para CUIT ${formattedCuit}`,
      details: {
        cuit: formattedCuit,
        environment: validatedData.environment,
        point_of_sale: validatedData.point_of_sale,
      },
    })

    return NextResponse.json({
      success: true,
      message: "AFIP configurado correctamente",
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
