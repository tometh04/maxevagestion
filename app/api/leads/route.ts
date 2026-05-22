import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  getOrCreateDefaultAccount,
} from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate, getExchangeRateWithFallback } from "@/lib/accounting/exchange-rates"
import {
  mapDepositMethodToLedgerMethod,
  getAccountTypeForDeposit,
} from "@/lib/accounting/deposit-utils"
import { applyLeadsFilters, canPerformAction, getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"
import { resolveListNameForRegion } from "@/lib/manychat/seed-lists"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // Cross-tenant fix (2026-05-18): no confiar en RLS; scopear explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    const perms = await resolveUserPermissions(supabase as any, user.id, (user as any).org_id, user.role, agencyIds)

    // Build query - NO incluir operations aquí, se cargan después manualmente (scopeado por org)
    let query = (supabase.from("leads") as any).select(`
      *,
      agencies(name),
      users:assigned_seller_id(name, email)
    `).eq("org_id", (user as any).org_id)

    // Apply permissions-based filtering
    try {
      query = applyLeadsFilters(query, user, agencyIds, perms)
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

    const source = searchParams.get("source")
    if (source && source !== "ALL") {
      query = query.eq("source", source)
    }

    // Filtro de archivados: por defecto excluir archivados; con ?archived=true traer solo archivados
    const archivedParam = searchParams.get("archived")
    if (archivedParam === "true") {
      query = (query as any).not("archived_at", "is", null)
    } else {
      query = (query as any).is("archived_at", null)
    }

    // Add pagination: usar page en vez de offset para mejor UX
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const requestedLimit = parseInt(searchParams.get("limit") || "50")
    // Límite máximo amplio para soportar listados completos
    const limit = Math.min(requestedLimit, 1000)
    const offset = (page - 1) * limit

    const result = await query
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1)
    
    let leads: any[] = result.data || []
    const error = result.error

    if (error) {
      console.error("Error fetching leads:", error)
      return NextResponse.json({ error: "Error al obtener leads" }, { status: 500 })
    }

    // FIX bug "cards desaparecen del CRM" (sellers Micaela, Ramiro):
    // El paginado de la query principal ordena por updated_at DESC y trae top N.
    // Si un seller tiene muchos leads viejos asignados, quedan fuera del top N
    // y se le "esconden" en el kanban. Para SELLER, hacemos un fetch adicional
    // de TODOS sus leads asignados (sin límite) y los mergeamos sin duplicar por id.
    // ADMIN/SUPER_ADMIN/CONTABLE/VIEWER no tocan esta lógica.
    if (user.role === "SELLER" && agencyIds.length > 0) {
      const existingIds = new Set(leads.map((l: any) => l.id))
      const { data: ownLeads } = await (supabase.from("leads") as any).select(`
        *,
        agencies(name),
        users:assigned_seller_id(name, email)
      `)
        .eq("assigned_seller_id", user.id)
        .eq("org_id", (user as any).org_id)
        .in("agency_id", agencyIds)
        .is("archived_at", null)

      if (ownLeads) {
        const missing = (ownLeads as any[]).filter((l) => !existingIds.has(l.id))
        if (missing.length > 0) {
          leads = [...leads, ...missing]
        }
      }
    }

    // OPTIMIZADO: Solo cargar operaciones y clientes si hay leads WON (evitar consultas innecesarias)
    const wonLeads = (leads || []).filter((l: any) => l.status === "WON")
    
    if (wonLeads.length > 0) {
      const wonLeadIds = wonLeads.map((l: any) => l.id)

      // Cargar operaciones y clientes en paralelo para mejor rendimiento (scopeado por org)
      const [operationsResult, customersResult] = await Promise.all([
        // Operaciones
        (supabase.from("operations") as any)
          .select("id, file_code, destination, status, created_at, departure_date, sale_amount_total, lead_id")
          .in("lead_id", wonLeadIds)
          .eq("org_id", (user as any).org_id),
        // Clientes (solo si hay operaciones)
        Promise.resolve({ data: null, error: null }) // Se cargará después si hay operaciones
      ])
      
      const allOperationsForWonLeads = operationsResult.data || []
      
      if (allOperationsForWonLeads.length > 0) {
        // Crear mapa de operaciones por lead_id
        const operationsByLeadId = new Map<string, any[]>()
        for (const op of allOperationsForWonLeads as any[]) {
          const leadId = op.lead_id as string
          if (leadId) {
            if (!operationsByLeadId.has(leadId)) {
              operationsByLeadId.set(leadId, [])
            }
            operationsByLeadId.get(leadId)!.push({
              id: op.id,
              file_code: op.file_code,
              destination: op.destination,
              status: op.status,
              created_at: op.created_at,
              departure_date: op.departure_date,
              sale_amount_total: op.sale_amount_total,
            })
          }
        }
        
        // Obtener clientes solo si hay operaciones
        const operationIds = Array.from(operationsByLeadId.values()).flat().map((op: any) => op.id)
        if (operationIds.length > 0) {
          const { data: opCustomers } = await (supabase.from("operation_customers") as any)
            .select(`
              operation_id,
              customers:customer_id (id, first_name, last_name)
            `)
            .in("operation_id", operationIds)
            .eq("role", "MAIN")
            .eq("org_id", (user as any).org_id)

          // Asociar clientes a cada lead
          const customersByOperation = new Map<string, any[]>()
          for (const oc of (opCustomers || []) as any[]) {
            if (!customersByOperation.has(oc.operation_id)) {
              customersByOperation.set(oc.operation_id, [])
            }
            if (oc.customers) {
              customersByOperation.get(oc.operation_id)!.push(oc.customers)
            }
          }

          // Asignar operaciones y clientes a cada lead WON
          leads = leads.map((lead: any) => {
            if (lead.status === "WON") {
              const ops = operationsByLeadId.get(lead.id) || []
              const customers: any[] = []
              for (const op of ops) {
                const opCustomersArr = customersByOperation.get(op.id) || []
                customers.push(...opCustomersArr)
              }
              return { ...lead, operations: ops, customers }
            }
            return lead
          })
        } else {
          // Solo asignar operaciones sin clientes
          leads = leads.map((lead: any) => {
            if (lead.status === "WON") {
              const ops = operationsByLeadId.get(lead.id) || []
              return { ...lead, operations: ops }
            }
            return lead
          })
        }
      }
    }

    // OPTIMIZADO: Obtener count en paralelo con los datos (si es necesario)
    // Para mejor rendimiento, solo obtener count si realmente se necesita
    let countQuery = (supabase.from("leads") as any)
      .select("*", { count: "exact", head: true })
      .eq("org_id", (user as any).org_id)
    
    try {
      countQuery = applyLeadsFilters(countQuery, user, agencyIds)
    } catch {
      // Ignore if filtering fails
    }
    
    // Aplicar mismos filtros al count
    if (status && status !== "ALL") {
      countQuery = countQuery.eq("status", status)
    }
    if (sellerId && sellerId !== "ALL") {
      countQuery = countQuery.eq("assigned_seller_id", sellerId)
    }
    if (agencyId && agencyId !== "ALL") {
      countQuery = countQuery.eq("agency_id", agencyId)
    }

    // Obtener count
    const { count } = await countQuery
    const totalPages = count ? Math.ceil(count / limit) : 0

    return NextResponse.json({ 
      leads: leads || [], 
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages
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

    // Cross-tenant fix (2026-05-18): no confiar en RLS; scopear explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const agencyIdsForPerms = await getUserAgencyIds(supabase, user.id, user.role as any)
    const perms = await resolveUserPermissions(supabase as any, user.id, (user as any).org_id, user.role, agencyIdsForPerms)

    if (!canPerformAction(user, "leads", "write", perms)) {
      return NextResponse.json({ error: "No tiene permiso para crear leads" }, { status: 403 })
    }
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
      list_name,
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

    // Cross-tenant fix: validar que agency_id pertenece al org del user (defense-in-depth)
    const { data: agencyCheck } = await (supabase.from("agencies") as any)
      .select("id")
      .eq("id", agency_id)
      .eq("org_id", (user as any).org_id)
      .single()
    if (!agencyCheck) {
      return NextResponse.json({ error: "Agencia inválida o no pertenece a tu organización" }, { status: 403 })
    }

    // Auto-asignar list_name según la región si no se proporcionó explícitamente.
    // Antes había un mapping hardcoded (regionToListName) con nombres
    // "Leads - X" Lozada-style — eso rompía cuando un tenant renombraba sus
    // listas o tenía otro set. Ahora consultamos las listas reales de la
    // agencia (manychat_list_order) y matcheamos por sinónimos de la región.
    let resolvedListName: string
    if (list_name) {
      resolvedListName = list_name
    } else {
      const fromTenant = await resolveListNameForRegion(agency_id, region, supabase)
      resolvedListName = fromTenant ?? "Leads - Otros"
    }

    const leadData: Record<string, any> = {
      agency_id,
      org_id: (user as any).org_id,
      source: source || "Other",
      status: status || "NEW",
      region,
      destination,
      contact_name,
      contact_phone,
      contact_email: contact_email || null,
      contact_instagram: contact_instagram || null,
      assigned_seller_id: assigned_seller_id || (user.role === "SELLER" ? user.id : null),
      list_name: resolvedListName,
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
          const rateResult = await getExchangeRateWithFallback(supabase, rateDate, "leads-create")
          exchangeRate = rateResult.rate
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
