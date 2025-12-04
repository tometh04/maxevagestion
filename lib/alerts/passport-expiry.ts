/**
 * Sistema de alertas para pasaportes próximos a vencer
 * 
 * Genera alertas cuando:
 * - Un pasaporte vence ANTES del viaje
 * - Un pasaporte vence DENTRO de los 6 meses posteriores al viaje
 * - Un pasaporte ya está vencido
 * 
 * Se basa en los datos escaneados por OCR en el campo scanned_data de documents
 */

import { createServerClient } from "@/lib/supabase/server"

interface PassportExpiryResult {
  created: number
  skipped: number
  errors: string[]
}

/**
 * Genera alertas de pasaportes que vencen antes o cerca del viaje
 */
export async function generatePassportExpiryAlerts(): Promise<PassportExpiryResult> {
  const supabase = await createServerClient()
  const result: PassportExpiryResult = { created: 0, skipped: 0, errors: [] }
  
  const today = new Date()
  const todayStr = today.toISOString().split("T")[0]
  
  // Buscar documentos de tipo PASSPORT con fecha de vencimiento en scanned_data
  // que pertenecen a leads o están asociados a operaciones
  const { data: passportDocs, error: docsError } = await supabase
    .from("documents")
    .select(`
      id,
      type,
      scanned_data,
      lead_id,
      operation_id,
      customer_id,
      leads:lead_id (
        id,
        contact_name,
        destination,
        assigned_seller_id,
        agency_id,
        estimated_checkin_date,
        travel_date
      ),
      operations:operation_id (
        id,
        file_code,
        destination,
        departure_date,
        seller_id,
        agency_id,
        status
      ),
      customers:customer_id (
        id,
        first_name,
        last_name
      )
    `)
    .eq("type", "PASSPORT")
    .not("scanned_data", "is", null)
  
  if (docsError) {
    console.error("Error fetching passport documents:", docsError)
    result.errors.push(`Error al obtener documentos: ${docsError.message}`)
    return result
  }
  
  if (!passportDocs || passportDocs.length === 0) {
    console.log("No passport documents found with scanned data")
    return result
  }
  
  for (const doc of passportDocs as any[]) {
    try {
      // Extraer fecha de vencimiento del scanned_data
      const scannedData = doc.scanned_data
      if (!scannedData || !scannedData.expiration_date) {
        result.skipped++
        continue
      }
      
      const expirationDate = new Date(scannedData.expiration_date)
      const expirationDateStr = scannedData.expiration_date
      
      // Obtener fecha de viaje (de operación o lead)
      let tripDate: Date | null = null
      let tripDateStr: string | null = null
      let entityId: string | null = null
      let entityType: "lead" | "operation" | null = null
      let sellerId: string | null = null
      let destination: string | null = null
      let passengerName: string | null = null
      
      // Priorizar operación si existe
      if (doc.operations && doc.operations.status !== "CANCELLED") {
        tripDate = doc.operations.departure_date ? new Date(doc.operations.departure_date) : null
        tripDateStr = doc.operations.departure_date
        entityId = doc.operations.id
        entityType = "operation"
        sellerId = doc.operations.seller_id
        destination = doc.operations.destination
      } else if (doc.leads) {
        // Usar fecha del lead
        const leadTripDate = doc.leads.travel_date || doc.leads.estimated_checkin_date
        tripDate = leadTripDate ? new Date(leadTripDate) : null
        tripDateStr = leadTripDate
        entityId = doc.leads.id
        entityType = "lead"
        sellerId = doc.leads.assigned_seller_id
        destination = doc.leads.destination
      }
      
      // Obtener nombre del pasajero
      if (doc.customers) {
        passengerName = `${doc.customers.first_name} ${doc.customers.last_name}`
      } else if (scannedData.full_name) {
        passengerName = scannedData.full_name
      } else if (scannedData.first_name && scannedData.last_name) {
        passengerName = `${scannedData.first_name} ${scannedData.last_name}`
      } else if (doc.leads) {
        passengerName = doc.leads.contact_name
      }
      
      if (!entityId || !sellerId) {
        result.skipped++
        continue
      }
      
      // Calcular si necesita alerta
      let needsAlert = false
      let alertType: "EXPIRED" | "EXPIRES_BEFORE_TRIP" | "EXPIRES_WITHIN_6_MONTHS" | null = null
      let alertDescription = ""
      let alertDueDate = todayStr
      
      // 1. Pasaporte ya vencido
      if (expirationDate < today) {
        needsAlert = true
        alertType = "EXPIRED"
        alertDescription = `⚠️ PASAPORTE VENCIDO: ${passengerName || "Pasajero"} - Venció el ${formatDate(expirationDateStr)}. Destino: ${destination || "Sin definir"}`
        alertDueDate = todayStr
      }
      // 2. Pasaporte vence antes del viaje
      else if (tripDate && expirationDate < tripDate) {
        needsAlert = true
        alertType = "EXPIRES_BEFORE_TRIP"
        alertDescription = `🔴 ACTUALIZAR PASAPORTE: ${passengerName || "Pasajero"} - El pasaporte vence el ${formatDate(expirationDateStr)}, ANTES del viaje (${formatDate(tripDateStr!)}). Destino: ${destination || "Sin definir"}`
        alertDueDate = todayStr
      }
      // 3. Pasaporte vence dentro de los 6 meses del viaje
      else if (tripDate) {
        const sixMonthsAfterTrip = new Date(tripDate)
        sixMonthsAfterTrip.setMonth(sixMonthsAfterTrip.getMonth() + 6)
        
        if (expirationDate < sixMonthsAfterTrip) {
          needsAlert = true
          alertType = "EXPIRES_WITHIN_6_MONTHS"
          alertDescription = `🟡 REVISAR PASAPORTE: ${passengerName || "Pasajero"} - El pasaporte vence el ${formatDate(expirationDateStr)}, menos de 6 meses después del viaje. Destino: ${destination || "Sin definir"}`
          // Alertar 30 días antes del viaje
          const thirtyDaysBefore = new Date(tripDate)
          thirtyDaysBefore.setDate(thirtyDaysBefore.getDate() - 30)
          alertDueDate = thirtyDaysBefore > today ? thirtyDaysBefore.toISOString().split("T")[0] : todayStr
        }
      }
      // 4. Sin fecha de viaje pero pasaporte vence en menos de 6 meses (alerta preventiva)
      else {
        const sixMonthsFromNow = new Date(today)
        sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6)
        
        if (expirationDate < sixMonthsFromNow) {
          needsAlert = true
          alertType = "EXPIRES_WITHIN_6_MONTHS"
          alertDescription = `🟡 PASAPORTE POR VENCER: ${passengerName || "Pasajero"} - El pasaporte vence el ${formatDate(expirationDateStr)} (menos de 6 meses). Destino: ${destination || "Sin definir"}`
          alertDueDate = todayStr
        }
      }
      
      if (!needsAlert) {
        result.skipped++
        continue
      }
      
      // Verificar si ya existe una alerta similar
      const existingAlertQuery = supabase
        .from("alerts")
        .select("id")
        .eq("type", "PASSPORT_EXPIRY")
        .eq("status", "PENDING")
      
      if (entityType === "operation") {
        existingAlertQuery.eq("operation_id", entityId)
      } else {
        existingAlertQuery.eq("lead_id", entityId)
      }
      
      // Agregar filtro por documento específico
      existingAlertQuery.ilike("description", `%${passengerName || "Pasajero"}%`)
      
      const { data: existingAlert } = await existingAlertQuery.maybeSingle()
      
      if (existingAlert) {
        result.skipped++
        continue
      }
      
      // Crear alerta
      const alertData: any = {
        type: "PASSPORT_EXPIRY",
        description: alertDescription,
        date_due: alertDueDate,
        status: "PENDING",
        user_id: sellerId,
      }
      
      if (entityType === "operation") {
        alertData.operation_id = entityId
      } else {
        alertData.lead_id = entityId
      }
      
      if (doc.customer_id) {
        alertData.customer_id = doc.customer_id
      }
      
      const { error: insertError } = await supabase.from("alerts").insert(alertData)
      
      if (insertError) {
        result.errors.push(`Error al crear alerta para ${passengerName}: ${insertError.message}`)
        continue
      }
      
      result.created++
      console.log(`✅ Alerta de pasaporte creada: ${alertDescription}`)
      
    } catch (error: any) {
      result.errors.push(`Error procesando documento ${doc.id}: ${error.message}`)
    }
  }
  
  return result
}

/**
 * Formatea una fecha a DD/MM/YYYY
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    })
  } catch {
    return dateStr
  }
}

/**
 * Verifica si un pasaporte está vencido o próximo a vencer
 * Útil para mostrar badges en la UI
 */
export function checkPassportStatus(expirationDate: string, tripDate?: string): {
  status: "OK" | "WARNING" | "DANGER" | "EXPIRED"
  message: string
} {
  const today = new Date()
  const expDate = new Date(expirationDate)
  
  // Ya vencido
  if (expDate < today) {
    return {
      status: "EXPIRED",
      message: "Pasaporte vencido"
    }
  }
  
  if (tripDate) {
    const trip = new Date(tripDate)
    
    // Vence antes del viaje
    if (expDate < trip) {
      return {
        status: "DANGER",
        message: "Vence antes del viaje"
      }
    }
    
    // Vence dentro de los 6 meses del viaje
    const sixMonthsAfterTrip = new Date(trip)
    sixMonthsAfterTrip.setMonth(sixMonthsAfterTrip.getMonth() + 6)
    
    if (expDate < sixMonthsAfterTrip) {
      return {
        status: "WARNING",
        message: "Vence cerca del viaje"
      }
    }
  } else {
    // Sin fecha de viaje, verificar si vence en menos de 6 meses
    const sixMonthsFromNow = new Date(today)
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6)
    
    if (expDate < sixMonthsFromNow) {
      return {
        status: "WARNING",
        message: "Vence en menos de 6 meses"
      }
    }
  }
  
  return {
    status: "OK",
    message: "Vigente"
  }
}

