import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { applyCustomersFilters, getUserAgencyIds } from "@/lib/permissions-api"

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

    // Build base query
    let query = supabase.from("customers")

    // Apply role-based filters FIRST (before select)
    try {
      query = await applyCustomersFilters(query, user, agencyIds, supabase)
      console.log(`[Customers API] User ${user.id} (${user.role}) - Applied filters`)
    } catch (error: any) {
      console.error("Error applying customers filters:", error)
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    // Apply search filter
    const search = searchParams.get("search")
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
      )
    }

    // Add pagination with reasonable limits
    const requestedLimit = parseInt(searchParams.get("limit") || "100")
    const limit = Math.min(requestedLimit, 200) // Máximo 200 para mejor rendimiento
    const offset = parseInt(searchParams.get("offset") || "0")
    
    // Now add select with relations, order and range
    const { data: customers, error } = await query
      .select(`
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
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("Error fetching customers:", error)
      return NextResponse.json({ error: "Error al obtener clientes" }, { status: 500 })
    }

    console.log(`[Customers API] Found ${customers?.length || 0} customers`)

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

    // Get total count for pagination
    let countQuery = supabase.from("customers")
    
    try {
      countQuery = await applyCustomersFilters(countQuery, user, agencyIds, supabase)
    } catch {
      // Ignore if filtering fails
    }
    
    if (search) {
      countQuery = countQuery.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
      )
    }
    
    const { count } = await countQuery
      .select("*", { count: "exact", head: true })

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
      date_of_birth,
      nationality,
    } = body

    // Validations
    if (!first_name || !last_name || !phone || !email) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Create customer
    const { data: customer, error: createError } = await (supabase.from("customers") as any)
      .insert({
        first_name,
        last_name,
        phone,
        email,
        instagram_handle: instagram_handle || null,
        document_type: document_type || null,
        document_number: document_number || null,
        date_of_birth: date_of_birth || null,
        nationality: nationality || null,
      })
      .select()
      .single()

    if (createError || !customer) {
      console.error("Error creating customer:", createError)
      return NextResponse.json({ error: "Error al crear cliente" }, { status: 400 })
    }

    return NextResponse.json({ success: true, customer })
  } catch (error) {
    console.error("Error in POST /api/customers:", error)
    return NextResponse.json({ error: "Error al crear cliente" }, { status: 500 })
  }
}

