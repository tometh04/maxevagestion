import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"

export const dynamic = 'force-dynamic'

// POST - Probar conexión de integración
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "No tiene permiso para probar integraciones" },
        { status: 403 }
      )
    }

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Obtener integración
    const { data: integration, error: fetchError } = await (supabase.from("integrations") as any)
      .select("*")
      .eq("id", id)
      .in("agency_id", agencyIds)
      .single()

    if (fetchError || !integration) {
      return NextResponse.json(
        { error: "Integración no encontrada" },
        { status: 404 }
      )
    }

    const startTime = Date.now()
    let testResult: { success: boolean; message: string; details?: any } = {
      success: false,
      message: "Tipo de integración no soportado para prueba automática",
    }

    // Probar según el tipo de integración
    switch (integration.integration_type) {
      case 'trello':
        testResult = await testTrelloConnection(integration.config)
        break
      case 'manychat':
        testResult = await testManychatConnection(integration.config)
        break
      case 'whatsapp':
        testResult = await testWhatsAppConnection(integration.config)
        break
      case 'afip':
        testResult = await testAfipConnection(integration.config)
        break
      case 'email':
        testResult = await testEmailConnection(integration.config)
        break
      case 'webhook':
        testResult = await testWebhookConnection(integration.webhook_url)
        break
      default:
        testResult = { 
          success: true, 
          message: "Configuración válida (prueba manual requerida)" 
        }
    }

    const duration = Date.now() - startTime

    // Actualizar estado de la integración
    const newStatus = testResult.success ? 'active' : 'error'
    await (supabase.from("integrations") as any)
      .update({ 
        status: newStatus,
        error_message: testResult.success ? null : testResult.message,
      })
      .eq("id", id)

    // Crear log
    await (supabase.from("integration_logs") as any).insert({
      integration_id: id,
      log_type: testResult.success ? 'success' : 'error',
      action: 'test',
      message: testResult.message,
      details: testResult.details,
      duration_ms: duration,
    })

    return NextResponse.json({ 
      success: testResult.success,
      message: testResult.message,
      details: testResult.details,
      duration: duration,
    })
  } catch (error: any) {
    console.error("Error in POST /api/integrations/[id]/test:", error)
    return NextResponse.json(
      { error: error.message || "Error al probar integración" },
      { status: 500 }
    )
  }
}

// Funciones de prueba para cada tipo de integración
async function testTrelloConnection(config: any): Promise<{ success: boolean; message: string; details?: any }> {
  if (!config.api_key || !config.token) {
    return { success: false, message: "API Key y Token son requeridos" }
  }
  
  try {
    const response = await fetch(
      `https://api.trello.com/1/members/me?key=${config.api_key}&token=${config.token}`
    )
    if (response.ok) {
      const data = await response.json()
      return { 
        success: true, 
        message: `Conexión exitosa - Usuario: ${data.fullName}`,
        details: { username: data.username, fullName: data.fullName }
      }
    }
    return { success: false, message: "Credenciales inválidas" }
  } catch {
    return { success: false, message: "Error de conexión con Trello" }
  }
}

async function testManychatConnection(config: any): Promise<{ success: boolean; message: string; details?: any }> {
  if (!config.api_key) {
    return { success: false, message: "API Key es requerida" }
  }
  
  try {
    const response = await fetch("https://api.manychat.com/fb/page/getInfo", {
      headers: { Authorization: `Bearer ${config.api_key}` }
    })
    if (response.ok) {
      const data = await response.json()
      return { 
        success: true, 
        message: `Conexión exitosa`,
        details: data
      }
    }
    return { success: false, message: "API Key inválida" }
  } catch {
    return { success: false, message: "Error de conexión con Manychat" }
  }
}

async function testWhatsAppConnection(config: any): Promise<{ success: boolean; message: string; details?: any }> {
  if (!config.phone_number_id || !config.access_token) {
    return { success: false, message: "Phone Number ID y Access Token son requeridos" }
  }
  
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${config.phone_number_id}`,
      { headers: { Authorization: `Bearer ${config.access_token}` } }
    )
    if (response.ok) {
      const data = await response.json()
      return { 
        success: true, 
        message: `Conexión exitosa - ${data.display_phone_number || 'WhatsApp configurado'}`,
        details: data
      }
    }
    return { success: false, message: "Credenciales inválidas" }
  } catch {
    return { success: false, message: "Error de conexión con WhatsApp" }
  }
}

async function testAfipConnection(config: any): Promise<{ success: boolean; message: string; details?: any }> {
  if (!config.cuit || !config.api_key) {
    return { success: false, message: "CUIT y API Key son requeridos" }
  }
  
  try {
    // Importar funciones de test de AFIP
    const { testConnection } = await import("@/lib/afip/afip-client")
    const { isAfipConfigValid } = await import("@/lib/afip/afip-config")
    
    // Validar configuración
    if (!isAfipConfigValid(config)) {
      return { 
        success: false, 
        message: "Configuración incompleta. Verifique CUIT, API Key, Punto de Venta y Ambiente." 
      }
    }
    
    // Probar conexión real con AFIP
    const testResult = await testConnection({
      api_key: config.api_key,
      cuit: config.cuit,
      point_of_sale: config.point_of_sale || 1,
      environment: config.environment || 'sandbox',
    })
    
    return {
      success: testResult.success,
      message: testResult.message,
      details: {
        cuit: config.cuit,
        environment: testResult.environment,
        point_of_sale: config.point_of_sale || 1,
      }
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Error al probar conexión con AFIP",
    }
  }
}

async function testEmailConnection(config: any): Promise<{ success: boolean; message: string; details?: any }> {
  if (!config.smtp_host || !config.smtp_user) {
    return { success: false, message: "Host SMTP y Usuario son requeridos" }
  }
  
  // Para email, validamos la configuración básica
  // Una prueba real requeriría enviar un email de prueba
  return { 
    success: true, 
    message: `Configuración SMTP válida`,
    details: { 
      host: config.smtp_host, 
      port: config.smtp_port || 587,
      user: config.smtp_user 
    }
  }
}

async function testWebhookConnection(webhookUrl: string | null): Promise<{ success: boolean; message: string; details?: any }> {
  if (!webhookUrl) {
    return { success: false, message: "URL del webhook es requerida" }
  }
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        type: 'test',
        timestamp: new Date().toISOString(),
        source: 'maxeva_gestion'
      })
    })
    
    return { 
      success: response.ok, 
      message: response.ok ? `Webhook respondió con status ${response.status}` : `Webhook respondió con error ${response.status}`,
      details: { status: response.status }
    }
  } catch {
    return { success: false, message: "Error de conexión con el webhook" }
  }
}
