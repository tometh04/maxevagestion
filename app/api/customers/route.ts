import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { applyCustomersFilters, getUserAgencyIds } from "@/lib/permissions-api"
import { checkDuplicateCustomer, sendCustomerNotifications } from "@/lib/customers/customer-service"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Verificar permiso de acceso
    if (!canAccessModule(user.role as any, "customers")) {
      return NextResponse.json({ error: "No tiene permiso para ver clientes" }, { status: 403 })
    }

    // Get user agencies (ya tiene caché interno)
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Build base query — .select() FIRST so applyCustomersFilters can chain .eq() etc.
    const context = searchParams.get("context") || undefined
    let selectQuery = supabase.from("customers").select(`
        *,
        operation_customers(
          operation_id,
          operations:operation_id(
            id,
            sale_amount_total,
            currency,
            status
          )
        )
      `)

    try {
      const applied = await applyCustomersFilters(selectQuery, user, agencyIds, supabase, context)
      selectQuery = applied.query
    } catch (error: any) {
      console.error("Error applying customers filters:", error)
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    // Add pagination with reasonable limits.
    // Default alto para que la DataTable client-side pagine sobre la lista completa
    // (tabla de clientes se usa principalmente para buscar/ordenar, no scroll infinito).
    const requestedLimit = parseInt(searchParams.get("limit") || "2000")
    const limit = Math.min(requestedLimit, 2000)
    const offset = parseInt(searchParams.get("offset") || "0")

    // Apply search filter after select + filters
    const search = searchParams.get("search")

    // Apply search filter AFTER select (or() is only available after select)
    // Split search into words so "Emiliano Mossotti" matches first_name + last_name
    if (search) {
      const words = search.trim().split(/\s+/)
      if (words.length > 1) {
        // Multi-word: each word must match at least one field (AND logic between words)
        for (const word of words) {
          selectQuery = selectQuery.or(
            `first_name.ilike.%${word}%,last_name.ilike.%${word}%,email.ilike.%${word}%,phone.ilike.%${word}%`
          )
        }
      } else {
        selectQuery = selectQuery.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
        )
      }
    }

    // Now add order and range
    const { data: customers, error } = await selectQuery
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("Error fetching customers:", error)
      return NextResponse.json({ error: "Error al obtener clientes" }, { status: 500 })
    }

    // Calculate trips and total spent for each customer
    const customersWithStats = (customers || []).map((customer: any) => {
      const operations = customer.operation_customers || []
      const trips = operations.length
      
      // Calculate total spent (only from CONFIRMED, TRAVELLED, or CLOSED operations)
      const totalSpent = operations
        .filter((oc: any) => {
          const status = oc.operations?.status
          return status === "CONFIRMED" || status === "TRAVELLED" || status === "CLOSED"
        })
        .reduce((sum: number, oc: any) => {
          return sum + (parseFloat(oc.operations?.sale_amount_total || 0))
        }, 0)

      return {
        ...customer,
        trips,
        totalSpent,
      }
    })

    // Get total count for pagination — .select() FIRST for chaining
    let countSelectQuery = supabase
      .from("customers")
      .select("*", { count: "exact", head: true })

    try {
      const appliedCount = await applyCustomersFilters(countSelectQuery, user, agencyIds, supabase)
      countSelectQuery = appliedCount.query
    } catch {
      // Ignore if filtering fails
    }
    
    if (search) {
      const words = search.trim().split(/\s+/)
      if (words.length > 1) {
        for (const word of words) {
          countSelectQuery = countSelectQuery.or(
            `first_name.ilike.%${word}%,last_name.ilike.%${word}%,email.ilike.%${word}%,phone.ilike.%${word}%`
          )
        }
      } else {
        countSelectQuery = countSelectQuery.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
        )
      }
    }
    
    const { count } = await countSelectQuery

    return NextResponse.json({ 
      customers: customersWithStats,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit
      }
    })
  } catch (error) {
    console.error("Error in GET /api/customers:", error)
    return NextResponse.json({ error: "Error al obtener clientes" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Verificar permiso de escritura
    if (!canAccessModule(user.role as any, "customers")) {
      return NextResponse.json({ error: "No tiene permiso para crear clientes" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const {
      first_name,
      last_name,
      phone,
      email,
      instagram_handle,
      document_type,
      document_number,
      procedure_number,
      date_of_birth,
      nationality,
    } = body

    // Validations básicas (email es opcional, solo requerido si la configuración lo indica)
    if (!first_name || !last_name || !phone) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Obtener configuración de clientes
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    if (agencyIds.length === 0) {
      return NextResponse.json({ error: "No tiene agencias asignadas" }, { status: 403 })
    }

    const { data: settings } = await supabase
      .from("customer_settings")
      .select("*")
      .eq("agency_id", agencyIds[0])
      .maybeSingle()

    const settingsData = settings as any

    // Aplicar validaciones de configuración
    // NOTA: Email es completamente opcional - no se valida como requerido
    if (settingsData?.validations) {
      const validations = settingsData.validations
      
      // Solo validar formato de email si está presente, pero nunca requerirlo
      if (validations.email?.format === 'email' && email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
          return NextResponse.json({ error: "Email inválido" }, { status: 400 })
        }
      }
      
      if (validations.phone?.required && !phone) {
        return NextResponse.json({ error: "Teléfono es requerido" }, { status: 400 })
      }
    }

    // Verificar documento requerido
    if (settingsData?.require_document && (!document_type || !document_number)) {
      return NextResponse.json({ 
        error: "Tipo y número de documento son requeridos" 
      }, { status: 400 })
    }

    // Verificar duplicados si está habilitado
    if (settingsData?.duplicate_check_enabled) {
      const checkFields = settingsData.duplicate_check_fields || ['email', 'phone']
      const duplicateCheck = await checkDuplicateCustomer(
        supabase,
        { email, phone, document_number },
        checkFields,
        agencyIds[0]
      )

      if (duplicateCheck.isDuplicate) {
        return NextResponse.json({ 
          error: "Ya existe un cliente con estos datos",
          duplicate: duplicateCheck.duplicateCustomer 
        }, { status: 409 })
      }
    }

    if (!user.org_id) {
      return NextResponse.json({ error: "Tu usuario no tiene organización asociada" }, { status: 400 })
    }

    // Create customer (org-scoped)
    const { data: customer, error: createError } = await (supabase.from("customers") as any)
      .insert({
        org_id: user.org_id,
        first_name,
        last_name,
        phone,
        email: email || null,
        instagram_handle: instagram_handle || null,
        document_type: document_type || null,
        document_number: document_number || null,
        procedure_number: procedure_number || null,
        date_of_birth: date_of_birth || null,
        nationality: nationality || null,
      })
      .select()
      .single()

    if (createError || !customer) {
      console.error("Error creating customer:", createError)
      return NextResponse.json({ error: "Error al crear cliente" }, { status: 400 })
    }

    // Enviar notificaciones si están configuradas
    if (settingsData?.notifications) {
      await sendCustomerNotifications(
        supabase,
        'new_customer',
        {
          id: customer.id,
          first_name: customer.first_name,
          last_name: customer.last_name,
          email: customer.email,
          phone: customer.phone,
        },
        agencyIds[0],
        settingsData.notifications
      )
    }

    return NextResponse.json({ success: true, customer })
  } catch (error) {
    console.error("Error in POST /api/customers:", error)
    return NextResponse.json({ error: "Error al crear cliente" }, { status: 500 })
  }
}

