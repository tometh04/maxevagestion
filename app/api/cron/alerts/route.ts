import { NextResponse } from "next/server"
import { generateAllAlerts } from "@/lib/alerts/generate"

/**
 * Endpoint para cron jobs - Generar todas las alertas
 * Protegido con CRON_SECRET token
 * Debe ejecutarse diariamente a las 09:00
 */
export async function POST(request: Request) {
  try {
    // Verificar token de autorización
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET || "change-me-in-production"
    
    if (authHeader !== `Bearer ${cronSecret}`) {
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

