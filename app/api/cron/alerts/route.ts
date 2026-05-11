import { NextResponse } from "next/server"
import { generateAllAlerts, type AlertGenerationSettings } from "@/lib/alerts/generate"
import { createAdminClient } from "@/lib/supabase/server"
import { checkCronAuth } from "@/lib/cron/auth"

/**
 * Endpoint para cron jobs - Generar todas las alertas
 * Protegido con CRON_SECRET token
 * Se ejecuta diariamente a las 09:00 Argentina
 *
 * Lee la configuración de alertas desde operation_settings
 * para usar los días configurados por el usuario
 */
export async function POST(request: Request) {
  try {
    const auth = checkCronAuth(request, "alerts")
    if (!auth.authorized) {
      return NextResponse.json({ error: "Unauthorized", reason: auth.reason }, { status: 401 })
    }

    // Leer configuración de alertas desde operation_settings
    let alertSettings: AlertGenerationSettings | undefined

    try {
      // SaaS multi-tenant: cron sin user logueado → RLS bloquea. Bypass con admin.
      const supabase = createAdminClient()

      // Obtener la primera agencia con settings (normalmente hay una sola)
      const { data: settings } = await (supabase as any)
        .from("operation_settings")
        .select("auto_alerts, alert_payment_due_days, alert_operator_payment_days, alert_upcoming_trip_days")
        .limit(1)
        .maybeSingle()

      if (settings) {
        const autoAlerts = (settings.auto_alerts || []) as Array<{
          type: string
          enabled: boolean
          days_before?: number
        }>

        // Buscar cada tipo de alerta en la config
        const paymentDue = autoAlerts.find((a) => a.type === "payment_due")
        const operatorPayment = autoAlerts.find((a) => a.type === "operator_payment")
        const upcomingTrip = autoAlerts.find((a) => a.type === "upcoming_trip")

        alertSettings = {
          paymentDueDays: paymentDue?.days_before ?? settings.alert_payment_due_days ?? 30,
          paymentDueEnabled: paymentDue?.enabled ?? true,
          operatorPaymentDays: operatorPayment?.days_before ?? settings.alert_operator_payment_days ?? 30,
          operatorPaymentEnabled: operatorPayment?.enabled ?? true,
          upcomingTripDays: upcomingTrip?.days_before ?? settings.alert_upcoming_trip_days ?? 7,
          upcomingTripEnabled: upcomingTrip?.enabled ?? true,
        }

      }
    } catch (settingsError) {
      console.error("Error loading alert settings, using defaults:", settingsError)
    }

    await generateAllAlerts(alertSettings)

    return NextResponse.json({
      success: true,
      message: "Alertas generadas exitosamente",
      settings: alertSettings || "defaults",
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
