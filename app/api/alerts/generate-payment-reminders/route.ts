import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { generatePaymentReminders } from "@/lib/alerts/payment-reminders"

/**
 * Endpoint para generar recordatorios de pagos automáticamente
 * Este endpoint debe ser llamado diariamente por un cron job
 * Genera alertas para pagos que vencen en 7 días, 3 días, hoy, o están vencidos
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos
    if (!canPerformAction(user, "alerts", "write")) {
      return NextResponse.json({ error: "No tiene permiso para generar recordatorios" }, { status: 403 })
    }

    const result = await generatePaymentReminders()

    return NextResponse.json({
      success: true,
      created: result.created,
      customerReminders: result.customerReminders,
      operatorReminders: result.operatorReminders,
      errors: result.errors,
    })
  } catch (error: any) {
    console.error("Error in POST /api/alerts/generate-payment-reminders:", error)
    return NextResponse.json({ error: error.message || "Error al generar recordatorios de pagos" }, { status: 500 })
  }
}

