import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { generatePassportExpiryAlerts } from "@/lib/alerts/passport-expiry"

/**
 * POST /api/alerts/generate-passport-alerts
 * 
 * Genera alertas de pasaportes vencidos o próximos a vencer
 * Solo accesible para SUPER_ADMIN y ADMIN
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Solo admins pueden generar alertas
    if (!["SUPER_ADMIN", "ADMIN"].includes(user.role as string)) {
      return NextResponse.json(
        { error: "No tienes permisos para esta acción" },
        { status: 403 }
      )
    }
    
    console.log("🔄 Generating passport expiry alerts manually...")
    const result = await generatePassportExpiryAlerts()
    
    return NextResponse.json({
      success: true,
      message: `Se generaron ${result.created} alertas de pasaportes (${result.skipped} omitidas)`,
      ...result
    })
  } catch (error: any) {
    console.error("Error generating passport alerts:", error)
    return NextResponse.json(
      { error: error.message || "Error al generar alertas" },
      { status: 500 }
    )
  }
}

