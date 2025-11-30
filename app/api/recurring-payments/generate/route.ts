import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { generateAllRecurringPayments } from "@/lib/accounting/recurring-payments"

/**
 * Endpoint para generar todos los pagos recurrentes que deben generarse hoy
 * Este endpoint debe ser llamado diariamente por un cron job
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos
    if (!canPerformAction(user, "accounting", "write")) {
      return NextResponse.json({ error: "No tiene permiso para generar pagos recurrentes" }, { status: 403 })
    }

    const result = await generateAllRecurringPayments(supabase, user.id)

    return NextResponse.json({
      success: true,
      generated: result.generated,
      errors: result.errors,
    })
  } catch (error: any) {
    console.error("Error in POST /api/recurring-payments/generate:", error)
    return NextResponse.json({ error: error.message || "Error al generar pagos recurrentes" }, { status: 500 })
  }
}

