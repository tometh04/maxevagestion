/**
 * API Route: Generar todas las alertas
 * 
 * Endpoint para generar manualmente todas las alertas del sistema
 * Útil para ejecutar periódicamente o cuando se necesite refrescar alertas
 */

import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { generateAllAlerts } from "@/lib/alerts/generate"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Solo ADMIN y SUPER_ADMIN pueden generar alertas manualmente
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "No tiene permiso para generar alertas" },
        { status: 403 }
      )
    }

    // Generar todas las alertas
    await generateAllAlerts()

    return NextResponse.json({
      success: true,
      message: "Alertas generadas exitosamente",
    })
  } catch (error: any) {
    console.error("Error generating alerts:", error)
    return NextResponse.json(
      { error: error.message || "Error al generar alertas" },
      { status: 500 }
    )
  }
}

