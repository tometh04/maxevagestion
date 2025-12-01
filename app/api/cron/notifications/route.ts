import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { runAllNotificationGenerators } from "@/lib/notifications/notification-generator"

/**
 * Endpoint CRON para generar notificaciones automáticas
 * Debe ser llamado diariamente (por ejemplo a las 8:00 AM)
 * 
 * Configurar en Vercel:
 * - vercel.json: { "crons": [{ "path": "/api/cron/notifications", "schedule": "0 8 * * *" }] }
 * 
 * O en un servicio externo como:
 * - cron-job.org
 * - EasyCron
 */
export async function GET(request: Request) {
  try {
    // Verificar autorización (opcional - usar un token secreto)
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const supabase = await createServerClient()
    
    console.log("🕐 Iniciando generación de notificaciones...")
    const startTime = Date.now()
    
    const { results, totalGenerated } = await runAllNotificationGenerators(supabase)
    
    const duration = Date.now() - startTime
    console.log(`✅ Generación completada en ${duration}ms`)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      totalGenerated,
      details: {
        paymentDue: results.paymentDue.generated,
        paymentOverdue: results.paymentOverdue.generated,
        upcomingTrip: results.upcomingTrip.generated,
        missingDocs: results.missingDocs.generated,
      },
    })
  } catch (error: any) {
    console.error("Error en CRON de notificaciones:", error)
    return NextResponse.json({ 
      error: error.message || "Error al generar notificaciones" 
    }, { status: 500 })
  }
}

// También permitir POST para llamadas manuales
export async function POST(request: Request) {
  return GET(request)
}

