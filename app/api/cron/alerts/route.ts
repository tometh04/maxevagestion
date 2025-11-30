import { NextResponse } from "next/server"
import { generateAllAlerts } from "@/lib/alerts/generate"

/**
 * Endpoint para cron jobs - Generar todas las alertas
 * Protegido con CRON_SECRET token
 * Debe ejecutarse diariamente a las 09:00
 */
export async function POST(request: Request) {
  try {
    // Verificar autorización: Vercel Cron envía un header especial o usar CRON_SECRET
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    const vercelCronSecret = request.headers.get("x-vercel-cron-secret")
    
    // Permitir si viene de Vercel Cron o si tiene el token correcto
    const isVercelCron = vercelCronSecret === process.env.CRON_SECRET
    const hasValidToken = authHeader === `Bearer ${cronSecret}`
    
    if (!isVercelCron && !hasValidToken && cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await generateAllAlerts()

    return NextResponse.json({
      success: true,
      message: "Alertas generadas exitosamente",
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("Error in cron /api/cron/alerts:", error)
    return NextResponse.json(
      { error: error.message || "Error al generar alertas" },
      { status: 500 }
    )
  }
}

