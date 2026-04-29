import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
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

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    // SaaS multi-tenant: cron sin user logueado → RLS bloquea. Bypass con admin.
    const supabase = createAdminClient()

    const startTime = Date.now()

    const { results, total } = await runAllMessageGenerators(supabase as any)
    
    const duration = Date.now() - startTime
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

