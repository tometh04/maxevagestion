import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { generateAllRecurringPayments } from "@/lib/accounting/recurring-payments"

/**
 * Endpoint para cron jobs - Generar pagos recurrentes
 * Protegido con CRON_SECRET token
 * Debe ejecutarse diariamente a las 00:00
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

    const supabase = await createServerClient()
    
    // Usar un usuario del sistema o el primer SUPER_ADMIN
    const { data: adminUser } = await supabase
      .from("users")
      .select("id")
      .eq("role", "SUPER_ADMIN")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    const userId = (adminUser as { id: string } | null)?.id || "system"

    const result = await generateAllRecurringPayments(supabase, userId)

    return NextResponse.json({
      success: true,
      generated: result.generated,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("Error in cron /api/cron/recurring-payments:", error)
    return NextResponse.json(
      { error: error.message || "Error al generar pagos recurrentes" },
      { status: 500 }
    )
  }
}

