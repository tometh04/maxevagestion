import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { syncManychatLeadToLead, ManychatLeadData } from "@/lib/manychat/sync"

/**
 * POST /api/webhooks/manychat
 * 
 * Endpoint para recibir webhooks de Manychat y crear/actualizar leads
 * 
 * Autenticación: API key en header X-API-Key
 * 
 * Payload esperado (ejemplo):
 * {
 *   "ig": "laurisariii",
 *   "name": "Lali Central",
 *   "bucket": "Campaña X",
 *   "region": "CARIBE",
 *   "whatsapp": "+5491123456789",
 *   "destino": "Bayahibe",
 *   "fechas": "2025-08-15",
 *   "personas": "2",
 *   "menores": "0",
 *   "presupuesto": "50000",
 *   "servicio": "Paquete",
 *   "evento": "",
 *   "phase": "initial",
 *   "agency": "rosario"
 * }
 */
export async function POST(request: Request) {
  try {
    // 1. Validar autenticación (API key)
    const apiKey = request.headers.get("X-API-Key")
    const expectedApiKey = process.env.MANYCHAT_WEBHOOK_API_KEY
    
    if (!expectedApiKey) {
      console.error("❌ MANYCHAT_WEBHOOK_API_KEY no está configurada en variables de entorno")
      return NextResponse.json(
        { error: "Configuración del servidor incompleta" },
        { status: 500 }
      )
    }
    
    if (!apiKey || apiKey !== expectedApiKey) {
      console.error("❌ API key inválida o faltante")
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 }
      )
    }
    
    // 2. Parsear body
    const body = await request.json()
    
    // 3. Validar campos requeridos
    if (!body.ig && !body.name) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: 'ig' o 'name' es necesario" },
        { status: 400 }
      )
    }
    
    // 4. Preparar datos de Manychat
    const manychatData: ManychatLeadData = {
      ig: body.ig,
      name: body.name,
      bucket: body.bucket,
      region: body.region,
      whatsapp: body.whatsapp,
      destino: body.destino,
      fechas: body.fechas,
      personas: body.personas,
      menores: body.menores,
      presupuesto: body.presupuesto,
      servicio: body.servicio,
      evento: body.evento,
      phase: body.phase,
      agency: body.agency,
      manychat_user_id: body.manychat_user_id,
      flow_id: body.flow_id,
      page_id: body.page_id,
      timestamp: body.timestamp || new Date().toISOString(),
    }
    
    // 5. Sincronizar lead
    const supabase = await createServerClient()
    const result = await syncManychatLeadToLead(manychatData, supabase)
    
    // 6. Retornar respuesta
    return NextResponse.json({
      success: true,
      created: result.created,
      leadId: result.leadId,
      message: result.created ? "Lead creado correctamente" : "Lead actualizado correctamente",
    }, { status: result.created ? 201 : 200 })
    
  } catch (error: any) {
    console.error("❌ Error processing Manychat webhook:", error)
    
    // Retornar error apropiado
    if (error.message?.includes("agencia")) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: error.message || "Error al procesar webhook de Manychat" },
      { status: 500 }
    )
  }
}

// GET: Health check (opcional, para verificar que el endpoint está activo)
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Manychat webhook endpoint is active",
    timestamp: new Date().toISOString(),
  })
}

