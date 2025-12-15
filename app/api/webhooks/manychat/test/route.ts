import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { syncManychatLeadToLead, ManychatLeadData } from "@/lib/manychat/sync"

/**
 * POST /api/webhooks/manychat/test
 * 
 * Endpoint de prueba para simular un webhook de Manychat
 * Útil para probar la integración sin necesidad de configurar Manychat
 * 
 * Body esperado (ejemplo):
 * {
 *   "ig": "test_user",
 *   "name": "Test User",
 *   "whatsapp": "+5491123456789",
 *   "destino": "Bayahibe",
 *   "region": "CARIBE",
 *   "phase": "initial",
 *   "agency": "rosario"
 * }
 */
export async function POST(request: Request) {
  try {
    // 1. Parsear body
    const body = await request.json()
    
    // 2. Validar campos requeridos
    if (!body.ig && !body.name) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: 'ig' o 'name' es necesario" },
        { status: 400 }
      )
    }
    
    // 3. Preparar datos de Manychat (con valores por defecto para testing)
    const manychatData: ManychatLeadData = {
      ig: body.ig || "test_user",
      name: body.name || body.ig || "Test User",
      bucket: body.bucket || "",
      region: body.region || "OTROS",
      whatsapp: body.whatsapp || "",
      destino: body.destino || "Sin destino",
      fechas: body.fechas || "",
      personas: body.personas || "",
      menores: body.menores || "",
      presupuesto: body.presupuesto || "",
      servicio: body.servicio || "",
      evento: body.evento || "",
      phase: body.phase || "initial",
      agency: body.agency || "rosario",
      manychat_user_id: body.manychat_user_id || `test_${Date.now()}`,
      flow_id: body.flow_id || "test_flow",
      page_id: body.page_id || "test_page",
      timestamp: body.timestamp || new Date().toISOString(),
    }
    
    // 4. Sincronizar lead
    const supabase = await createServerClient()
    const result = await syncManychatLeadToLead(manychatData, supabase)
    
    // 5. Retornar respuesta
    return NextResponse.json({
      success: true,
      created: result.created,
      leadId: result.leadId,
      message: result.created ? "Lead de prueba creado correctamente" : "Lead de prueba actualizado correctamente",
      data: manychatData,
    }, { status: result.created ? 201 : 200 })
    
  } catch (error: any) {
    console.error("❌ Error processing Manychat test webhook:", error)
    
    return NextResponse.json(
      { error: error.message || "Error al procesar webhook de prueba de Manychat" },
      { status: 500 }
    )
  }
}

// GET: Mostrar información sobre cómo usar el endpoint de prueba
export async function GET() {
  return NextResponse.json({
    message: "Endpoint de prueba para Manychat",
    usage: {
      method: "POST",
      url: "/api/webhooks/manychat/test",
      body: {
        ig: "test_user",
        name: "Test User",
        whatsapp: "+5491123456789",
        destino: "Bayahibe",
        region: "CARIBE",
        phase: "initial",
        agency: "rosario"
      }
    },
    example: {
      curl: `curl -X POST https://your-domain.com/api/webhooks/manychat/test \\
  -H "Content-Type: application/json" \\
  -d '{
    "ig": "test_user",
    "name": "Test User",
    "whatsapp": "+5491123456789",
    "destino": "Bayahibe",
    "region": "CARIBE",
    "phase": "initial",
    "agency": "rosario"
  }'`
    }
  })
}

