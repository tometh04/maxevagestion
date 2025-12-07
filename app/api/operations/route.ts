import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { generateFileCode } from "@/lib/accounting/file-code"
import { transferLeadToOperation, getOrCreateDefaultAccount } from "@/lib/accounting/ledger"
import { createSaleIVA, createPurchaseIVA } from "@/lib/accounting/iva"
import { createOperatorPayment, calculateDueDate } from "@/lib/accounting/operator-payments"
import { canPerformAction } from "@/lib/permissions-api"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Verificar permiso de escritura
    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear operaciones" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const {
      lead_id,
      agency_id,
      seller_id,
      seller_secondary_id,
      operator_id,
      type,
      product_type,
      origin,
      destination,
      operation_date,
      departure_date,
      return_date,
      checkin_date,
      checkout_date,
      adults,
      children,
      infants,
      passengers,
      status,
      sale_amount_total,
      operator_cost,
      currency,
      sale_currency,
      operator_cost_currency,
      commission_percentage, // Porcentaje de comisión del vendedor
    } = body

    // Validate required fields
    if (!agency_id || !seller_id || !type || !destination || !departure_date || sale_amount_total === undefined || operator_cost === undefined) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Check permissions
    if (user.role === "SELLER" && seller_id !== user.id) {
      return NextResponse.json({ error: "No puedes crear operaciones para otros vendedores" }, { status: 403 })
    }

    // Calculate margin
    const marginAmount = sale_amount_total - operator_cost
    const marginPercentage = sale_amount_total > 0 ? (marginAmount / sale_amount_total) * 100 : 0

    // Infer product_type from type if not provided
    const inferredProductType = product_type || (type === 'FLIGHT' ? 'AEREO' : type === 'HOTEL' ? 'HOTEL' : type === 'PACKAGE' ? 'PAQUETE' : type === 'CRUISE' ? 'CRUCERO' : 'OTRO')

    // Use sale_currency and operator_cost_currency, fallback to currency
    const finalSaleCurrency = sale_currency || currency || "ARS"
    const finalOperatorCostCurrency = operator_cost_currency || currency || "ARS"

    const operationData: Record<string, any> = {
      agency_id,
      lead_id: lead_id || null,
      seller_id,
      seller_secondary_id: seller_secondary_id || null,
      operator_id: operator_id || null,
      type,
      product_type: inferredProductType,
      origin: origin || null,
      destination,
      operation_date: operation_date || new Date().toISOString().split("T")[0], // Fecha de operación (hoy por defecto)
      departure_date,
      return_date: return_date || null,
      checkin_date: checkin_date || null,
      checkout_date: checkout_date || null,
      adults: adults || 1,
      children: children || 0,
      infants: infants || 0,
      passengers: passengers ? JSON.stringify(passengers) : null,
      status: status || "PRE_RESERVATION",
      sale_amount_total,
      operator_cost,
      currency: currency || "ARS", // Mantener para compatibilidad
      sale_currency: finalSaleCurrency,
      operator_cost_currency: finalOperatorCostCurrency,
      margin_amount: marginAmount,
      margin_percentage: marginPercentage,
    }

    const { data: operation, error: operationError } = await (supabase.from("operations") as any)
      .insert(operationData)
      .select()
      .single()

    if (operationError) {
      console.error("Error creating operation:", operationError)
      return NextResponse.json({ error: "Error al crear operación" }, { status: 500 })
    }

    // Auto-generate file_code after operation is created (so we can use the real ID)
    const op = operation as any
    const fileCode = generateFileCode(op.created_at, op.id)
    await (supabase.from("operations") as any)
      .update({ file_code: fileCode })
      .eq("id", op.id)
    
    // Update operation object with file_code
    op.file_code = fileCode

    // Auto-generate IVA records
    try {
      if (sale_amount_total > 0) {
        await createSaleIVA(
          supabase,
          op.id,
          sale_amount_total,
          finalSaleCurrency,
          departure_date
        )
        console.log(`✅ Created sale IVA record for operation ${operation.id}`)
      }

      if (operator_cost > 0 && operator_id) {
        await createPurchaseIVA(
          supabase,
          op.id,
          operator_id,
          operator_cost,
          finalOperatorCostCurrency,
          departure_date
        )
        console.log(`✅ Created purchase IVA record for operation ${operation.id}`)
      }
    } catch (error) {
      console.error("Error creating IVA records:", error)
      // No lanzamos error para no romper la creación de la operación
    }

    // Auto-generate operator payment
    if (operator_id && operator_cost > 0) {
      try {
        const dueDate = calculateDueDate(
          inferredProductType,
          departure_date, // purchase_date (usar departure_date como aproximación)
          checkin_date || undefined,
          departure_date
        )

        await createOperatorPayment(
          supabase,
          op.id,
          operator_id,
          operator_cost,
          finalOperatorCostCurrency,
          dueDate,
          `Pago automático generado para operación ${operation.id}`
        )
        console.log(`✅ Created operator payment for operation ${operation.id}, due: ${dueDate}`)
      } catch (error) {
        console.error("Error creating operator payment:", error)
        // No lanzamos error para no romper la creación de la operación
      }
    }

    // NOTA: Los pagos se registran manualmente cuando el cliente paga
    // No se generan automáticamente para evitar confusión

    // Update lead status to WON if lead_id exists
    if (lead_id) {
      // Obtener datos del lead
      const { data: leadData } = await (supabase.from("leads") as any)
        .select("contact_name, contact_phone, contact_email, contact_instagram")
        .eq("id", lead_id)
        .single()
      
      if (leadData) {
        // Buscar si ya existe un cliente con ese email o teléfono
        let customerId: string | null = null
        
        if (leadData.contact_email) {
          const { data: existingByEmail } = await (supabase.from("customers") as any)
            .select("id")
            .eq("email", leadData.contact_email)
            .single()
          
          if (existingByEmail) {
            customerId = existingByEmail.id
          }
        }
        
        if (!customerId && leadData.contact_phone) {
          const { data: existingByPhone } = await (supabase.from("customers") as any)
            .select("id")
            .eq("phone", leadData.contact_phone)
            .single()
          
          if (existingByPhone) {
            customerId = existingByPhone.id
          }
        }
        
        // Si no existe, crear el cliente
        if (!customerId) {
          // Separar nombre en first_name y last_name
          const nameParts = (leadData.contact_name || "").trim().split(" ")
          const firstName = nameParts[0] || "Sin nombre"
          const lastName = nameParts.slice(1).join(" ") || "-"
          
          const { data: newCustomer, error: customerError } = await (supabase.from("customers") as any)
            .insert({
              first_name: firstName,
              last_name: lastName,
              phone: leadData.contact_phone || "",
              email: leadData.contact_email || "",
              instagram_handle: leadData.contact_instagram || null,
            })
            .select()
            .single()
          
          if (!customerError && newCustomer) {
            customerId = newCustomer.id
            console.log(`✅ Created customer ${customerId} from lead ${lead_id}`)
          }
        }
        
        // Asociar cliente a la operación
        if (customerId) {
          await (supabase.from("operation_customers") as any)
            .insert({
              operation_id: operation.id,
              customer_id: customerId,
              role: "MAIN"
            })
          console.log(`✅ Associated customer ${customerId} with operation ${operation.id}`)
        }
      }
      
      // Actualizar lead a WON
      await (supabase.from("leads") as any).update({ status: "WON" }).eq("id", lead_id)
      
      // Transfer all ledger_movements from lead to operation
      try {
        const result = await transferLeadToOperation(lead_id, operation.id, supabase)
        console.log(`✅ Transferred ${result.transferred} ledger movements from lead ${lead_id} to operation ${operation.id}`)
      } catch (error) {
        console.error("Error transferring ledger movements:", error)
        // No lanzamos error para no romper la creación de la operación
        // pero lo registramos para debugging
      }
    }

    // Generar alertas de requisitos por destino
    try {
      await generateDestinationRequirementAlerts(supabase, operation.id, destination, departure_date, seller_id)
    } catch (error) {
      console.error("Error generating destination requirement alerts:", error)
      // No lanzamos error para no romper la creación de la operación
    }

    // Generar alertas automáticas (check-in, check-out, cumpleaños)
    try {
      await generateOperationAlerts(supabase, operation.id, {
        departure_date,
        return_date,
        destination,
        seller_id,
      })
    } catch (error) {
      console.error("Error generating operation alerts:", error)
      // No lanzamos error para no romper la creación de la operación
    }

    // Crear registro de comisión del vendedor si se especificó porcentaje
    if (commission_percentage && commission_percentage > 0 && marginAmount > 0) {
      try {
        const commissionAmount = (marginAmount * commission_percentage) / 100
        await (supabase.from("commission_records") as any).insert({
          operation_id: operation.id,
          seller_id: seller_id,
          agency_id: agency_id,
          amount: Math.round(commissionAmount * 100) / 100,
          percentage: commission_percentage,
          status: "PENDING",
          date_calculated: new Date().toISOString(),
        })
        console.log(`✅ Created commission record for operation ${operation.id}: ${commission_percentage}% = ${commissionAmount}`)
      } catch (error) {
        console.error("Error creating commission record:", error)
        // No lanzamos error para no romper la creación de la operación
      }
    }

    // Invalidar caché del dashboard (los KPIs cambian al crear una operación)
    revalidateTag(CACHE_TAGS.DASHBOARD)

    return NextResponse.json({ operation })
  } catch (error) {
    console.error("Error in POST /api/operations:", error)
    return NextResponse.json({ error: "Error al crear operación" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Get user agencies
    const { data: userAgencies } = await supabase
      .from("user_agencies")
      .select("agency_id")
      .eq("user_id", user.id)

    const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

    // Build query - Optimizado: cargar todas las relaciones en una sola query
    let query = supabase
      .from("operations")
      .select(`
        *,
        sellers:seller_id(id, name, email),
        operators:operator_id(id, name),
        agencies:agency_id(id, name, city),
        leads:lead_id(id, contact_name, destination, trello_url, status)
      `)

    // Apply permissions-based filtering
    const { applyOperationsFilters } = await import("@/lib/permissions-api")
    try {
      query = applyOperationsFilters(query, user, agencyIds)
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    // Apply filters
    const status = searchParams.get("status")
    if (status && status !== "ALL") {
      query = query.eq("status", status)
    }

    const sellerId = searchParams.get("sellerId")
    if (sellerId && sellerId !== "ALL") {
      query = query.eq("seller_id", sellerId)
    }

    const agencyId = searchParams.get("agencyId")
    if (agencyId && agencyId !== "ALL") {
      query = query.eq("agency_id", agencyId)
    }

    const dateFrom = searchParams.get("dateFrom")
    if (dateFrom) {
      query = query.gte("departure_date", dateFrom)
    }

    const dateTo = searchParams.get("dateTo")
    if (dateTo) {
      query = query.lte("departure_date", dateTo)
    }

    // Add pagination: usar page en vez de offset para mejor UX
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const requestedLimit = parseInt(searchParams.get("limit") || "50")
    const limit = Math.min(requestedLimit, 200) // Máximo 200 para mejor rendimiento
    const offset = (page - 1) * limit
    
    // Get total count first (con todos los filtros aplicados)
    let countQuery = supabase
      .from("operations")
      .select("*", { count: "exact", head: true })
    
    try {
      countQuery = applyOperationsFilters(countQuery, user, agencyIds)
    } catch {
      // Ignore if filtering fails
    }
    
    // Aplicar mismos filtros al count
    if (status && status !== "ALL") {
      countQuery = countQuery.eq("status", status)
    }
    if (sellerId && sellerId !== "ALL") {
      countQuery = countQuery.eq("seller_id", sellerId)
    }
    if (agencyId && agencyId !== "ALL") {
      countQuery = countQuery.eq("agency_id", agencyId)
    }
    if (dateFrom) {
      countQuery = countQuery.gte("departure_date", dateFrom)
    }
    if (dateTo) {
      countQuery = countQuery.lte("departure_date", dateTo)
    }
    
    const { count } = await countQuery
    
    // Ahora obtener los datos con paginación
    // El count ya lo obtuvimos antes, solo necesitamos los datos
    const { data: operations, error } = await query
      .select("*, sellers:seller_id(name), operators:operator_id(name), agencies:agency_id(name), leads:lead_id(contact_name, destination, trello_url)")
      .order("operation_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("Error fetching operations:", error)
      return NextResponse.json({ error: "Error al obtener operaciones" }, { status: 500 })
    }

    const totalPages = count ? Math.ceil(count / limit) : 0

    return NextResponse.json({ 
      operations: operations || [],
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages
      }
    })
  } catch (error) {
    console.error("Error in GET /api/operations:", error)
    return NextResponse.json({ error: "Error al obtener operaciones" }, { status: 500 })
  }
}

// Mapeo de destinos a códigos de país
const destinationMappings: Record<string, string[]> = {
  "BR": ["brasil", "brazil", "rio", "rio de janeiro", "sao paulo", "são paulo", "florianopolis", "florianópolis", "salvador", "fortaleza", "recife", "buzios", "búzios", "arraial", "porto seguro", "maceió", "maceio", "natal", "foz de iguazu", "foz do iguaçu"],
  "CO": ["colombia", "cartagena", "bogota", "bogotá", "medellin", "medellín", "cali", "san andres", "san andrés", "santa marta"],
  "US": ["estados unidos", "usa", "united states", "miami", "new york", "nueva york", "los angeles", "las vegas", "orlando", "disney", "california", "florida", "texas", "chicago", "boston", "washington", "san francisco", "hawaii", "hawai"],
  "EU": ["europa", "europe", "españa", "spain", "italia", "italy", "francia", "france", "alemania", "germany", "portugal", "grecia", "greece", "holanda", "netherlands", "belgica", "bélgica", "austria", "suiza", "switzerland", "roma", "paris", "barcelona", "madrid", "amsterdam", "berlin", "viena", "vienna", "praga", "prague", "budapest", "atenas", "athens", "lisboa", "lisbon", "venecia", "venice", "florencia", "florence", "milan", "milán"],
  "MX": ["mexico", "méxico", "cancun", "cancún", "riviera maya", "playa del carmen", "los cabos", "cabo san lucas", "puerto vallarta", "ciudad de mexico", "cdmx", "tulum", "cozumel"],
  "CU": ["cuba", "habana", "la habana", "havana", "varadero", "santiago de cuba"],
  "DO": ["republica dominicana", "república dominicana", "dominicana", "punta cana", "santo domingo", "puerto plata", "bayahibe", "la romana", "samana", "samaná"],
  "TH": ["tailandia", "thailand", "bangkok", "phuket", "krabi", "chiang mai", "koh samui", "pattaya"],
  "AU": ["australia", "sydney", "melbourne", "brisbane", "perth", "gold coast", "cairns"],
  "EG": ["egipto", "egypt", "cairo", "el cairo", "luxor", "aswan", "hurghada", "sharm el sheikh"],
}

/**
 * Genera alertas automáticas basadas en los requisitos del destino
 */
async function generateDestinationRequirementAlerts(
  supabase: any,
  operationId: string,
  destination: string,
  departureDate: string,
  sellerId: string
) {
  const destLower = destination.toLowerCase()
  
  // Encontrar códigos de país que matchean con el destino
  const matchingCodes: string[] = []
  for (const [code, keywords] of Object.entries(destinationMappings)) {
    for (const keyword of keywords) {
      if (destLower.includes(keyword) || keyword.includes(destLower)) {
        if (!matchingCodes.includes(code)) {
          matchingCodes.push(code)
        }
        break
      }
    }
  }

  if (matchingCodes.length === 0) {
    console.log(`ℹ️ No se encontraron requisitos para destino: ${destination}`)
    return
  }

  // Buscar requisitos activos y obligatorios para esos destinos
  const { data: requirements, error } = await (supabase.from("destination_requirements") as any)
    .select("*")
    .in("destination_code", matchingCodes)
    .eq("is_active", true)
    .eq("is_required", true)

  if (error || !requirements || requirements.length === 0) {
    console.log(`ℹ️ No hay requisitos obligatorios para: ${matchingCodes.join(", ")}`)
    return
  }

  // Calcular fecha de alerta basada en days_before_trip
  const departure = new Date(departureDate + "T12:00:00")
  const alertsToCreate: any[] = []

  for (const req of requirements) {
    const alertDate = new Date(departure)
    alertDate.setDate(alertDate.getDate() - req.days_before_trip)
    
    // Solo crear alerta si la fecha de alerta es en el futuro
    if (alertDate > new Date()) {
      alertsToCreate.push({
        operation_id: operationId,
        user_id: sellerId,
        type: "DESTINATION_REQUIREMENT",
        description: `${req.requirement_name} (${req.destination_name}) - ${req.description || "Verificar antes del viaje"}`,
        date_due: alertDate.toISOString(),
        status: "PENDING",
      })
    }
  }

  if (alertsToCreate.length > 0) {
    const { error: insertError } = await (supabase.from("alerts") as any).insert(alertsToCreate)
    if (insertError) {
      console.error("Error creando alertas de requisitos:", insertError)
    } else {
      console.log(`✅ Creadas ${alertsToCreate.length} alertas de requisitos para operación ${operationId}`)
    }
  }
}

/**
 * Genera alertas automáticas para una operación (check-in, check-out)
 */
async function generateOperationAlerts(
  supabase: any,
  operationId: string,
  data: {
    departure_date: string
    return_date?: string | null
    destination: string
    seller_id: string
  }
) {
  const { departure_date, return_date, destination, seller_id } = data
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const alertsToCreate: any[] = []

  // 1. ALERTA DE CHECK-IN (3 días antes de la salida)
  if (departure_date) {
    const departureDate = new Date(departure_date + 'T12:00:00')
    const checkInAlertDate = new Date(departureDate)
    checkInAlertDate.setDate(checkInAlertDate.getDate() - 3)

    if (checkInAlertDate >= today) {
      alertsToCreate.push({
        operation_id: operationId,
        user_id: seller_id,
        type: "UPCOMING_TRIP",
        description: `✈️ Check-in próximo: ${destination} - Salida ${departure_date}`,
        date_due: checkInAlertDate.toISOString().split("T")[0],
        status: "PENDING",
      })
    }
  }

  // 2. ALERTA DE CHECK-OUT (día antes del regreso)
  if (return_date) {
    const returnDate = new Date(return_date + 'T12:00:00')
    const checkOutAlertDate = new Date(returnDate)
    checkOutAlertDate.setDate(checkOutAlertDate.getDate() - 1)

    if (checkOutAlertDate >= today) {
      alertsToCreate.push({
        operation_id: operationId,
        user_id: seller_id,
        type: "UPCOMING_TRIP",
        description: `🏨 Check-out próximo: ${destination} - Regreso ${return_date}`,
        date_due: checkOutAlertDate.toISOString().split("T")[0],
        status: "PENDING",
      })
    }
  }

  // Insertar alertas
  if (alertsToCreate.length > 0) {
    const { error: insertError } = await (supabase.from("alerts") as any).insert(alertsToCreate)
    if (insertError) {
      console.error("Error creando alertas de operación:", insertError)
    } else {
      console.log(`✅ Creadas ${alertsToCreate.length} alertas de check-in/check-out para operación ${operationId}`)
    }
  }
}
