import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()
    
    const { operationId } = body

    if (!operationId) {
      return NextResponse.json({ error: "operationId es requerido" }, { status: 400 })
    }

    // Obtener la operación con sus clientes
    const { data: operation, error: opError } = await supabase
      .from("operations")
      .select(`
        *,
        operation_customers(
          customer_id,
          customers(id, first_name, last_name, date_of_birth)
        )
      `)
      .eq("id", operationId)
      .single()

    if (opError || !operation) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    const alertsToCreate: any[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 1. ALERTA DE CHECK-IN (3 días antes de la salida)
    if (operation.departure_date) {
      const departureDate = new Date(operation.departure_date + 'T12:00:00')
      const checkInAlertDate = new Date(departureDate)
      checkInAlertDate.setDate(checkInAlertDate.getDate() - 3)

      if (checkInAlertDate >= today) {
        alertsToCreate.push({
          operation_id: operationId,
          user_id: operation.seller_id,
          type: "UPCOMING_TRIP",
          description: `Check-in próximo: ${operation.destination} - Salida ${operation.departure_date}`,
          date_due: checkInAlertDate.toISOString().split("T")[0],
          status: "PENDING",
        })
      }
    }

    // 2. ALERTA DE CHECK-OUT (día antes del regreso)
    if (operation.return_date) {
      const returnDate = new Date(operation.return_date + 'T12:00:00')
      const checkOutAlertDate = new Date(returnDate)
      checkOutAlertDate.setDate(checkOutAlertDate.getDate() - 1)

      if (checkOutAlertDate >= today) {
        alertsToCreate.push({
          operation_id: operationId,
          user_id: operation.seller_id,
          type: "UPCOMING_TRIP",
          description: `Check-out próximo: ${operation.destination} - Regreso ${operation.return_date}`,
          date_due: checkOutAlertDate.toISOString().split("T")[0],
          status: "PENDING",
        })
      }
    }

    // 3. ALERTAS DE CUMPLEAÑOS DE CLIENTES (si el cumple es durante el viaje o próximo)
    const customers = (operation as any).operation_customers || []
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
          alertsToCreate.push({
            operation_id: operationId,
            user_id: operation.seller_id,
            type: "GENERIC",
            description: `🎂 Cumpleaños próximo: ${customer.first_name} ${customer.last_name} - ${birthDate.getDate()}/${birthDate.getMonth() + 1}`,
            date_due: birthdayAlertDate.toISOString().split("T")[0],
            status: "PENDING",
          })
        }
      }
    }

    // 4. ALERTA DE DOCUMENTOS (verificar pasaportes vencidos)
    const { data: documents } = await supabase
      .from("documents")
      .select("*")
      .eq("operation_id", operationId)
      .in("type", ["PASSPORT", "DNI"])

    if (documents) {
      for (const doc of documents) {
        const scannedData = doc.scanned_data as any
        if (scannedData?.expiration_date) {
          const expirationDate = new Date(scannedData.expiration_date + 'T12:00:00')
          const departureDate = operation.departure_date ? new Date(operation.departure_date + 'T12:00:00') : today

          // Si el documento vence antes del viaje o dentro de 6 meses del viaje
          const sixMonthsAfterTrip = new Date(departureDate)
          sixMonthsAfterTrip.setMonth(sixMonthsAfterTrip.getMonth() + 6)

          if (expirationDate <= sixMonthsAfterTrip) {
            const alertDate = new Date(today)
            alertDate.setDate(alertDate.getDate() + 1) // Mañana

            alertsToCreate.push({
              operation_id: operationId,
              user_id: operation.seller_id,
              type: "PASSPORT_EXPIRY",
              description: `⚠️ Documento ${doc.type} vence el ${scannedData.expiration_date}`,
              date_due: alertDate.toISOString().split("T")[0],
              status: "PENDING",
            })
          }
        }
      }
    }

    // Insertar alertas
    if (alertsToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from("alerts")
        .insert(alertsToCreate)

      if (insertError) {
        console.error("Error inserting alerts:", insertError)
        return NextResponse.json({ error: "Error al crear alertas" }, { status: 500 })
      }
    }

    console.log(`✅ Generadas ${alertsToCreate.length} alertas para operación ${operationId}`)

    return NextResponse.json({ 
      success: true, 
      alertsCreated: alertsToCreate.length,
      alerts: alertsToCreate.map(a => ({ type: a.type, description: a.description }))
    })
  } catch (error) {
    console.error("Error in POST /api/alerts/generate-operation-alerts:", error)
    return NextResponse.json({ error: "Error al generar alertas" }, { status: 500 })
  }
}

