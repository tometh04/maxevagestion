import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { runAllNotificationGenerators } from "@/lib/notifications/notification-generator"
import { checkCronAuth } from "@/lib/cron/auth"

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
    const auth = checkCronAuth(request, "notifications")
    if (!auth.authorized) {
      return NextResponse.json({ error: "No autorizado", reason: auth.reason }, { status: 401 })
    }

    // SaaS multi-tenant: cron sin user logueado → RLS bloquea. Bypass con admin.
    const supabase = createAdminClient()

    const startTime = Date.now()

    const { results, totalGenerated } = await runAllNotificationGenerators(supabase as any)
    
    const duration = Date.now() - startTime
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

