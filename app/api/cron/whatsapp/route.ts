import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { runAllMessageGenerators } from "@/lib/whatsapp/message-generator"

/**
 * CRON job para generar mensajes WhatsApp automáticos
 * Ejecutar diariamente a las 8:00 AM
 */
export async function GET(request: Request) {
  try {
    // Verificar autorización
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const supabase = await createServerClient()
    
    console.log("📱 Iniciando generación de mensajes WhatsApp...")
    const startTime = Date.now()
    
    const { results, total } = await runAllMessageGenerators(supabase)
    
    const duration = Date.now() - startTime
    console.log(`✅ Generación completada en ${duration}ms`)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      totalGenerated: total,
      details: results,
    })
  } catch (error: any) {
    console.error("Error en CRON de WhatsApp:", error)
    return NextResponse.json({ 
      error: error.message || "Error al generar mensajes" 
    }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return GET(request)
}

