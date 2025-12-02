import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { addDays, addWeeks, addMonths, addYears } from "date-fns"

// Calcular la siguiente fecha de vencimiento según frecuencia
function calculateNextDueDate(currentDate: string, frequency: string): string {
  const date = new Date(currentDate)
  
  switch (frequency) {
    case "WEEKLY":
      return addWeeks(date, 1).toISOString().split("T")[0]
    case "BIWEEKLY":
      return addWeeks(date, 2).toISOString().split("T")[0]
    case "MONTHLY":
      return addMonths(date, 1).toISOString().split("T")[0]
    case "QUARTERLY":
      return addMonths(date, 3).toISOString().split("T")[0]
    case "YEARLY":
      return addYears(date, 1).toISOString().split("T")[0]
    default:
      return addMonths(date, 1).toISOString().split("T")[0]
  }
}

// POST - Generar pagos recurrentes vencidos
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    const today = new Date().toISOString().split("T")[0]
    
    // 1. Buscar pagos recurrentes activos donde next_due_date <= hoy
    const { data: duePayments, error: fetchError } = await (supabase
      .from("recurring_payments") as any)
      .select("*")
      .eq("is_active", true)
      .lte("next_due_date", today)

    if (fetchError) {
      console.error("Error fetching due payments:", fetchError)
      return NextResponse.json({ 
        error: "Error al buscar pagos vencidos",
        details: fetchError.message 
      }, { status: 500 })
    }

    if (!duePayments || duePayments.length === 0) {
      return NextResponse.json({ 
        message: "No hay pagos recurrentes vencidos",
        generated: 0 
      })
    }

    let generatedCount = 0
    let alertsCreated = 0
    const errors: string[] = []

    for (const payment of duePayments) {
      try {
        // 2. Crear alerta para este pago
        const alertDescription = `Pago recurrente: ${payment.provider_name} - ${payment.currency} ${payment.amount.toLocaleString()}`
        
        // Verificar si ya existe una alerta para este pago (evitar duplicados)
        const { data: existingAlert } = await (supabase
          .from("alerts") as any)
          .select("id")
          .eq("type", "RECURRING_PAYMENT")
          .eq("description", alertDescription)
          .eq("status", "PENDING")
          .maybeSingle()

        if (!existingAlert) {
          // Crear nueva alerta
          const { error: alertError } = await (supabase
            .from("alerts") as any)
            .insert({
              type: "RECURRING_PAYMENT",
              description: alertDescription,
              date_due: payment.next_due_date,
              status: "PENDING",
              priority: "HIGH",
              metadata: {
                recurring_payment_id: payment.id,
                provider_name: payment.provider_name,
                amount: payment.amount,
                currency: payment.currency,
                frequency: payment.frequency,
              }
            })

          if (alertError) {
            console.error("Error creating alert:", alertError)
            // Continuar aunque falle la alerta
          } else {
            alertsCreated++
          }
        }

        // 3. Calcular próxima fecha de vencimiento
        const nextDueDate = calculateNextDueDate(payment.next_due_date, payment.frequency)

        // 4. Verificar si el pago debe terminar
        let shouldDeactivate = false
        if (payment.end_date && new Date(nextDueDate) > new Date(payment.end_date)) {
          shouldDeactivate = true
        }

        // 5. Actualizar el pago recurrente
        const updateData: any = {
          last_generated_date: today,
          next_due_date: nextDueDate,
          updated_at: new Date().toISOString(),
        }

        if (shouldDeactivate) {
          updateData.is_active = false
        }

        const { error: updateError } = await (supabase
          .from("recurring_payments") as any)
          .update(updateData)
          .eq("id", payment.id)

        if (updateError) {
          errors.push(`Error actualizando ${payment.provider_name}: ${updateError.message}`)
          continue
        }

        generatedCount++
      } catch (err: any) {
        errors.push(`Error procesando ${payment.provider_name}: ${err.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Se procesaron ${generatedCount} pagos recurrentes`,
      generated: generatedCount,
      alertsCreated,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error("Error in generate recurring payments:", error)
    return NextResponse.json({ 
      error: error.message || "Error al generar pagos recurrentes" 
    }, { status: 500 })
  }
}

// GET - Para CRON jobs (Vercel Cron)
export async function GET(request: Request) {
  // Verificar que viene de Vercel Cron o tiene auth header
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  // Si hay CRON_SECRET configurado, verificar
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Ejecutar la misma lógica que POST pero sin autenticación de usuario
  try {
    const supabase = await createServerClient()
    const today = new Date().toISOString().split("T")[0]
    
    const { data: duePayments, error: fetchError } = await (supabase
      .from("recurring_payments") as any)
      .select("*")
      .eq("is_active", true)
      .lte("next_due_date", today)

    if (fetchError || !duePayments || duePayments.length === 0) {
      return NextResponse.json({ 
        message: "No hay pagos recurrentes vencidos",
        generated: 0 
      })
    }

    let generatedCount = 0

    for (const payment of duePayments) {
      try {
        const alertDescription = `Pago recurrente: ${payment.provider_name} - ${payment.currency} ${payment.amount.toLocaleString()}`
        
        const { data: existingAlert } = await (supabase
          .from("alerts") as any)
          .select("id")
          .eq("type", "RECURRING_PAYMENT")
          .eq("description", alertDescription)
          .eq("status", "PENDING")
          .maybeSingle()

        if (!existingAlert) {
          await (supabase.from("alerts") as any).insert({
            type: "RECURRING_PAYMENT",
            description: alertDescription,
            date_due: payment.next_due_date,
            status: "PENDING",
            priority: "HIGH",
            metadata: {
              recurring_payment_id: payment.id,
              provider_name: payment.provider_name,
              amount: payment.amount,
              currency: payment.currency,
            }
          })
        }

        const nextDueDate = calculateNextDueDate(payment.next_due_date, payment.frequency)
        
        const updateData: any = {
          last_generated_date: today,
          next_due_date: nextDueDate,
          updated_at: new Date().toISOString(),
        }

        if (payment.end_date && new Date(nextDueDate) > new Date(payment.end_date)) {
          updateData.is_active = false
        }

        await (supabase.from("recurring_payments") as any)
          .update(updateData)
          .eq("id", payment.id)

        generatedCount++
      } catch (err) {
        console.error("Error processing payment:", err)
      }
    }

    return NextResponse.json({
      success: true,
      generated: generatedCount,
    })
  } catch (error: any) {
    console.error("Error in CRON generate:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
