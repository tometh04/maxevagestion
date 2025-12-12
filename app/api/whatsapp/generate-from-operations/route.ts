import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { generateMessagesFromAlerts } from "@/lib/whatsapp/alert-messages"

/**
 * Genera mensajes de WhatsApp para todas las operaciones existentes
 * Crea alertas primero (si no existen) y luego genera los mensajes
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permiso
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No tiene permiso para esta operación" }, { status: 403 })
    }

    console.log("🔄 Iniciando generación de mensajes desde operaciones existentes...")

    // Obtener todas las operaciones con sus clientes
    const { data: operations, error: opError } = await supabase
      .from("operations")
      .select(`
        id,
        departure_date,
        return_date,
        checkin_date,
        checkout_date,
        destination,
        seller_id,
        agency_id,
        operation_customers(
          role,
          customer_id,
          customers:customer_id (
            id,
            first_name,
            last_name,
            date_of_birth,
            phone
          )
        )
      `)
      .order("created_at", { ascending: false })

    if (opError || !operations) {
      console.error("Error obteniendo operaciones:", opError)
      return NextResponse.json({ error: "Error al obtener operaciones" }, { status: 500 })
    }

    console.log(`📊 Procesando ${operations.length} operaciones...`)

    let operationsProcessed = 0
    let messagesGenerated = 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Procesar cada operación
    for (const op of operations) {
      const operation = op as any // Type assertion para evitar errores de TypeScript
      try {
        const alertsToCreate: any[] = []

        // 1. Alerta de CHECK-IN
        const checkInDate = operation.checkin_date || operation.departure_date
        if (checkInDate) {
          const checkInDateObj = new Date(checkInDate + 'T12:00:00')
          const checkInAlertDate = new Date(checkInDateObj)
          checkInAlertDate.setDate(checkInAlertDate.getDate() - 3)

          if (checkInAlertDate >= today) {
            // Verificar si ya existe la alerta
            const { data: existingAlert } = await supabase
              .from("alerts")
              .select("id")
              .eq("operation_id", operation.id)
              .eq("type", "UPCOMING_TRIP")
              .ilike("description", `%Check-in próximo%`)
              .maybeSingle()

            if (!existingAlert) {
              alertsToCreate.push({
                operation_id: operation.id,
                user_id: operation.seller_id,
                type: "UPCOMING_TRIP",
                description: `✈️ Check-in próximo: ${operation.destination} - ${operation.checkin_date ? `Check-in ${operation.checkin_date}` : `Salida ${operation.departure_date}`}`,
                date_due: checkInAlertDate.toISOString().split("T")[0],
                status: "PENDING",
              })
            }
          }
        }

        // 2. Alerta de CHECK-OUT
        const checkOutDate = operation.checkout_date || operation.return_date
        if (checkOutDate) {
          const checkOutDateObj = new Date(checkOutDate + 'T12:00:00')
          const checkOutAlertDate = new Date(checkOutDateObj)
          checkOutAlertDate.setDate(checkOutAlertDate.getDate() - 1)

          if (checkOutAlertDate >= today) {
            // Verificar si ya existe la alerta
            const { data: existingAlert } = await supabase
              .from("alerts")
              .select("id")
              .eq("operation_id", operation.id)
              .eq("type", "UPCOMING_TRIP")
              .ilike("description", `%Check-out próximo%`)
              .maybeSingle()

            if (!existingAlert) {
              alertsToCreate.push({
                operation_id: operation.id,
                user_id: operation.seller_id,
                type: "UPCOMING_TRIP",
                description: `🏨 Check-out próximo: ${operation.destination} - ${operation.checkout_date ? `Check-out ${operation.checkout_date}` : `Regreso ${operation.return_date}`}`,
                date_due: checkOutAlertDate.toISOString().split("T")[0],
                status: "PENDING",
              })
            }
          }
        }

        // 3. Alertas de CUMPLEAÑOS
        const customers = (operation.operation_customers || []) as any[]
        for (const oc of customers) {
          const customer = oc.customers
          if (customer?.date_of_birth) {
            const birthDate = new Date(customer.date_of_birth + 'T12:00:00')
            const thisYearBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate())
            
            // Si ya pasó este año, usar el próximo
            if (thisYearBirthday < today) {
              thisYearBirthday.setFullYear(thisYearBirthday.getFullYear() + 1)
            }

            // Alerta 7 días antes del cumpleaños
            const birthdayAlertDate = new Date(thisYearBirthday)
            birthdayAlertDate.setDate(birthdayAlertDate.getDate() - 7)

            // Solo si es dentro de los próximos 60 días
            const sixtyDaysFromNow = new Date(today)
            sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60)

            if (birthdayAlertDate >= today && birthdayAlertDate <= sixtyDaysFromNow) {
              // Verificar si ya existe la alerta
              const { data: existingAlert } = await supabase
                .from("alerts")
                .select("id")
                .eq("operation_id", operation.id)
                .eq("customer_id", customer.id)
                .eq("type", "GENERIC")
                .ilike("description", `%Cumpleaños próximo%`)
                .maybeSingle()

              if (!existingAlert) {
                alertsToCreate.push({
                  operation_id: operation.id,
                  customer_id: customer.id,
                  user_id: operation.seller_id,
                  type: "GENERIC",
                  description: `🎂 Cumpleaños próximo: ${customer.first_name} ${customer.last_name} - ${birthDate.getDate()}/${birthDate.getMonth() + 1}`,
                  date_due: birthdayAlertDate.toISOString().split("T")[0],
                  status: "PENDING",
                })
              }
            }
          }
        }

        // Insertar alertas si hay nuevas
        if (alertsToCreate.length > 0) {
          const { data: createdAlerts, error: insertError } = await (supabase
            .from("alerts") as any)
            .insert(alertsToCreate)
            .select()

          if (insertError) {
            console.error(`Error creando alertas para operación ${operation.id}:`, insertError)
            continue
          }

          // Generar mensajes desde las alertas creadas
          if (createdAlerts && createdAlerts.length > 0) {
            const msgsGenerated = await generateMessagesFromAlerts(supabase, createdAlerts)
            messagesGenerated += msgsGenerated
          }
        }

        operationsProcessed++
      } catch (error) {
        console.error(`Error procesando operación ${operation.id}:`, error)
        continue
      }
    }

    console.log(`✅ Procesadas ${operationsProcessed} operaciones, generados ${messagesGenerated} mensajes`)

    return NextResponse.json({
      success: true,
      operationsProcessed,
      messagesGenerated,
      message: `Se procesaron ${operationsProcessed} operaciones y se generaron ${messagesGenerated} mensajes nuevos`,
    })
  } catch (error: any) {
    console.error("Error en generate-from-operations:", error)
    return NextResponse.json({ error: error.message || "Error al generar mensajes" }, { status: 500 })
  }
}

