import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  getOrCreateDefaultAccount,
} from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"
import {
  mapDepositMethodToLedgerMethod,
  getAccountTypeForDeposit,
} from "@/lib/accounting/deposit-utils"
import { applyLeadsFilters, canPerformAction } from "@/lib/permissions-api"

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

    // Build query - incluir operaciones y clientes relacionados
    let query = supabase.from("leads").select(`
      *,
      agencies(name),
      users:assigned_seller_id(name, email),
      operations(id, destination, status)
    `)

    // Apply permissions-based filtering
    try {
      query = applyLeadsFilters(query, user, agencyIds)
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
      query = query.eq("assigned_seller_id", sellerId)
    }

    const agencyId = searchParams.get("agencyId")
    if (agencyId && agencyId !== "ALL") {
      query = query.eq("agency_id", agencyId)
    }

    const trelloListId = searchParams.get("trelloListId")
    if (trelloListId && trelloListId !== "ALL") {
      query = query.eq("trello_list_id", trelloListId)
    }

    // Add pagination with reasonable limits
    const requestedLimit = parseInt(searchParams.get("limit") || "100")
    // Aumentar límite para poder cargar todos los leads (máximo 10000 para evitar problemas de memoria)
    const limit = Math.min(requestedLimit, 10000)
    const offset = parseInt(searchParams.get("offset") || "0")
    
    const result = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)
    
    let leads: any[] = result.data || []
    const error = result.error

    if (error) {
      console.error("Error fetching leads:", error)
      return NextResponse.json({ error: "Error al obtener leads" }, { status: 500 })
    }

    // Para leads convertidos (WON), obtener los clientes asociados a través de las operaciones
    const wonLeadsWithOperations = leads.filter((l: any) => l.status === "WON" && l.operations?.length > 0)
    if (wonLeadsWithOperations.length > 0) {
      const operationIds = wonLeadsWithOperations.flatMap((l: any) => l.operations.map((op: any) => op.id))
      
      if (operationIds.length > 0) {
        const { data: opCustomers } = await (supabase.from("operation_customers") as any)
          .select(`
            operation_id,
            customers:customer_id (id, first_name, last_name)
          `)
          .in("operation_id", operationIds)
          .eq("role", "MAIN")

        // Asociar clientes a cada lead
        const customersByOperation = new Map()
        for (const oc of (opCustomers || [])) {
          if (!customersByOperation.has(oc.operation_id)) {
            customersByOperation.set(oc.operation_id, [])
          }
          if (oc.customers) {
            customersByOperation.get(oc.operation_id).push(oc.customers)
          }
        }

        leads = leads.map((lead: any) => {
          if (lead.operations?.length > 0) {
            const customers: any[] = []
            for (const op of lead.operations) {
              const opCustomersArr = customersByOperation.get(op.id) || []
              customers.push(...opCustomersArr)
            }
            return { ...lead, customers }
          }
          return lead
        })
      }
    }

    // Get total count for pagination
    let countQuery = supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
    
    try {
      countQuery = applyLeadsFilters(countQuery, user, agencyIds)
    } catch {
      // Ignore if filtering fails
    }
    
    const { count } = await countQuery

    return NextResponse.json({ 
      leads: leads || [], 
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit
      }
    })
  } catch (error) {
    console.error("Error in GET /api/leads:", error)
    return NextResponse.json({ error: "Error al obtener leads" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Verificar permiso de escritura
    if (!canPerformAction(user, "leads", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear leads" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const {
      agency_id,
      source,
      status,
      region,
      destination,
      contact_name,
      contact_phone,
      contact_email,
      contact_instagram,
      assigned_seller_id,
      notes,
      quoted_price,
      has_deposit,
      deposit_amount,
      deposit_currency,
      deposit_method,
      deposit_date,
    } = body

    // Validate required fields
    if (!agency_id || !region || !destination || !contact_name || !contact_phone) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Check permissions
    if (user.role === "SELLER") {
      // Sellers can only create leads for their own agency
      const { data: userAgencies } = await supabase
        .from("user_agencies")
        .select("agency_id")
        .eq("user_id", user.id)

      const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

      if (!agencyIds.includes(agency_id)) {
        return NextResponse.json({ error: "No tienes permiso para crear leads en esta agencia" }, { status: 403 })
      }

      // Sellers can only assign to themselves
      if (assigned_seller_id && assigned_seller_id !== user.id) {
        return NextResponse.json({ error: "No puedes asignar leads a otros vendedores" }, { status: 403 })
      }
    }

    const leadData: Record<string, any> = {
      agency_id,
      source: source || "Other",
      status: status || "NEW",
      region,
      destination,
      contact_name,
      contact_phone,
      contact_email: contact_email || null,
      contact_instagram: contact_instagram || null,
      assigned_seller_id: assigned_seller_id || (user.role === "SELLER" ? user.id : null),
      notes: notes || null,
      quoted_price: quoted_price || null,
      has_deposit: has_deposit || false,
      deposit_amount: deposit_amount || null,
      deposit_currency: deposit_currency || null,
      deposit_method: deposit_method || null,
      deposit_date: deposit_date || null,
    }

    const { data: lead, error } = await (supabase.from("leads") as any).insert(leadData).select().single()

    if (error) {
      console.error("Error creating lead:", error)
      return NextResponse.json({ error: "Error al crear lead" }, { status: 500 })
    }

    // If deposit was received, create a ledger_movement
    if (has_deposit && deposit_amount && deposit_currency && deposit_date) {
      try {
        // Determinar tipo de cuenta según método de pago y moneda
        const accountType = getAccountTypeForDeposit(
          deposit_method,
          deposit_currency as "ARS" | "USD"
        )
        const defaultAccountId = await getOrCreateDefaultAccount(
          accountType,
          deposit_currency as "ARS" | "USD",
          user.id,
          supabase
        )
        
        // Calcular ARS equivalent usando la tabla de exchange rates
        let exchangeRate: number | null = null
        if (deposit_currency === "USD") {
          const rateDate = deposit_date ? new Date(deposit_date) : new Date()
          exchangeRate = await getExchangeRate(supabase, rateDate)
          
          // Si no hay tasa para esa fecha, usar la más reciente disponible
          if (!exchangeRate) {
            exchangeRate = await getLatestExchangeRate(supabase)
          }
          
          // Fallback: si aún no hay tasa, usar 1000 como último recurso
          if (!exchangeRate) {
            console.warn(`No exchange rate found for ${rateDate.toISOString()}, using fallback 1000`)
            exchangeRate = 1000
          }
        }
        
        const amountArsEquivalent = calculateARSEquivalent(
          deposit_amount,
          deposit_currency as "ARS" | "USD",
          exchangeRate
        )

        await createLedgerMovement(
          {
            lead_id: lead.id,
            type: "INCOME",
            concept: `Depósito recibido de lead: ${contact_name}`,
            currency: deposit_currency,
            amount_original: deposit_amount,
            exchange_rate: exchangeRate,
            amount_ars_equivalent: amountArsEquivalent,
            method: mapDepositMethodToLedgerMethod(deposit_method),
            account_id: defaultAccountId,
            seller_id: assigned_seller_id || (user.role === "SELLER" ? user.id : null),
            receipt_number: null,
            notes: `Depósito recibido el ${deposit_date}. Método: ${deposit_method || "No especificado"}`,
            created_by: user.id,
          },
          supabase
        )
        console.log(`✅ Created ledger movement for deposit of ${deposit_amount} ${deposit_currency} for lead ${lead.id}`)
      } catch (error) {
        console.error("Error creating ledger movement for deposit:", error)
        // No lanzamos error para no romper la creación del lead
      }
    }

    return NextResponse.json({ lead })
  } catch (error) {
    console.error("Error in POST /api/leads:", error)
    return NextResponse.json({ error: "Error al crear lead" }, { status: 500 })
  }
}
