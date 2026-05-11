import { NextResponse } from "next/server"
import { generatePaymentReminders } from "@/lib/alerts/payment-reminders"
import { checkCronAuth } from "@/lib/cron/auth"

/**
 * Endpoint para cron jobs - Generar recordatorios de pagos
 * Protegido con CRON_SECRET token
 * Debe ejecutarse diariamente a las 08:00
 */
export async function POST(request: Request) {
  try {
    const auth = checkCronAuth(request, "payment-reminders")
    if (!auth.authorized) {
      return NextResponse.json({ error: "Unauthorized", reason: auth.reason }, { status: 401 })
    }

    const result = await generatePaymentReminders()

    return NextResponse.json({
      success: true,
      created: result.created,
      customerReminders: result.customerReminders,
      operatorReminders: result.operatorReminders,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("Error in cron /api/cron/payment-reminders:", error)
    return NextResponse.json(
      { error: error.message || "Error al generar recordatorios de pagos" },
      { status: 500 }
    )
  }
}

