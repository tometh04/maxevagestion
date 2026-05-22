import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { buildSellerMessageScopeFilter, getSellerOperationIds } from "@/lib/whatsapp/message-access"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const requestedCustomerId = searchParams.get("customerId")
    const requestedChannel = searchParams.get("channel")
    const effectiveChannel = requestedChannel || (requestedCustomerId ? "WHATSAPP" : "ALL")
    const safeLimit = Math.min(parseInt(searchParams.get("limit") || "2000"), 2000)

    // Bug fix 2026-05-15 (P0 cross-tenant): SUPER_ADMIN bypaseaba el
    // filtro de agencias → leakeaba mensajes de otros tenants. Scopear
    // siempre por la org del user.
    const userOrgId = (user as any).org_id as string | null
    if (!userOrgId) {
      return NextResponse.json({ messages: [], counts: { PENDING: 0, SENT: 0, SKIPPED: 0 } })
    }

    // Obtener agencias de la org del user (no via user_agencies que solo
    // tiene los explicit links — para SUPER_ADMIN/CONTABLE traer todas las
    // de la org)
    const { data: orgAgencies } = await supabase
      .from("agencies")
      .select("id")
      .eq("org_id", userOrgId)
    const orgAgencyIds = (orgAgencies || []).map((a: any) => a.id)

    const sellerOperationIds =
      user.role === "SELLER" ? await getSellerOperationIds(supabase, user.id) : []

    // Query mensajes
    let query = (supabase.from("whatsapp_messages") as any)
      .select(`
        *,
        message_templates:template_id (name, emoji_prefix, category),
        customers:customer_id (first_name, last_name, email),
        operations:operation_id (destination, departure_date, file_code, seller_id)
      `)
      .order("scheduled_for", { ascending: true })

    if (user.role === "SELLER") {
      query = query.or(buildSellerMessageScopeFilter(user.id, sellerOperationIds))
    } else if (orgAgencyIds.length > 0) {
      query = query.in("agency_id", orgAgencyIds)
    } else {
      return NextResponse.json({
        messages: [],
        counts: { PENDING: 0, SENT: 0, SKIPPED: 0 },
      })
    }

    // Filtros
    const status = searchParams.get("status")
    if (status && status !== "ALL") {
      query = query.eq("status", status)
    } else {
      // Por defecto mostrar pendientes primero
      query = query.in("status", ["PENDING", "SENT", "SKIPPED"])
    }

    if (effectiveChannel !== "ALL") {
      query = query.eq("channel", effectiveChannel)
    }

    query = query.limit(safeLimit)

    const { data: rawMessages, error } = await query

    if (error) {
      console.error("Error fetching messages:", error)
      return NextResponse.json({ error: "Error al obtener mensajes" }, { status: 500 })
    }

    let messages = (rawMessages || []) as Array<any>

    if (requestedCustomerId) {
      const { data: operationCustomers } = await supabase
        .from("operation_customers")
        .select("operation_id")
        .eq("customer_id", requestedCustomerId)

      const operationIds = (operationCustomers || []).map((oc: any) => oc.operation_id).filter(Boolean)
      messages = messages.filter((message) => {
        if (message.customer_id === requestedCustomerId) {
          return true
        }

        return Boolean(message.operation_id && operationIds.includes(message.operation_id))
      })
    }

    // Contar por estado
    let countsQuery = (supabase.from("whatsapp_messages") as any)
      .select("status, customer_id, operation_id")

    if (user.role === "SELLER") {
      countsQuery = countsQuery.or(buildSellerMessageScopeFilter(user.id, sellerOperationIds))
    } else if (orgAgencyIds.length > 0) {
      countsQuery = countsQuery.in("agency_id", orgAgencyIds)
    } else {
      return NextResponse.json({
        messages,
        counts: { PENDING: 0, SENT: 0, SKIPPED: 0 },
      })
    }

    if (effectiveChannel !== "ALL") {
      countsQuery = countsQuery.eq("channel", effectiveChannel)
    }

    const { data: rawCounts } = await countsQuery

    let counts = (rawCounts || []) as Array<any>
    if (requestedCustomerId) {
      const { data: operationCustomers } = await supabase
        .from("operation_customers")
        .select("operation_id")
        .eq("customer_id", requestedCustomerId)

      const operationIds = (operationCustomers || []).map((oc: any) => oc.operation_id).filter(Boolean)
      counts = counts.filter((message) => {
        if (message.customer_id === requestedCustomerId) {
          return true
        }

        return Boolean(message.operation_id && operationIds.includes(message.operation_id))
      })
    }

    const countByStatus = {
      PENDING: 0,
      SENT: 0,
      SKIPPED: 0,
    }
    for (const m of counts) {
      if (countByStatus[m.status as keyof typeof countByStatus] !== undefined) {
        countByStatus[m.status as keyof typeof countByStatus]++
      }
    }

    return NextResponse.json({ 
      messages: messages || [],
      counts: countByStatus,
    })
  } catch (error: any) {
    console.error("Error in GET /api/whatsapp/messages:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    const { 
      template_id, 
      customer_id, 
      phone, 
      customer_name, 
      message, 
      operation_id,
      payment_id,
      quotation_id,
      agency_id,
      scheduled_for,
      status,
    } = body

    if (!customer_id || !phone || !message) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Generar link de WhatsApp
    const encodedMessage = encodeURIComponent(message)
    const cleanPhone = phone.replace(/\D/g, "")
    const whatsapp_link = `https://wa.me/${cleanPhone}?text=${encodedMessage}`

    const { data: newMessage, error } = await (supabase.from("whatsapp_messages") as any)
      .insert({
        template_id,
        customer_id,
        phone,
        customer_name,
        message,
        whatsapp_link,
        operation_id,
        payment_id,
        quotation_id,
        agency_id,
        scheduled_for: scheduled_for || new Date().toISOString(),
        status: ["PENDING", "SENT", "SKIPPED"].includes(status) ? status : "PENDING",
        channel: "WHATSAPP",
        message_kind: "STANDARD",
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating message:", error)
      return NextResponse.json({ error: "Error al crear mensaje" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: newMessage })
  } catch (error: any) {
    console.error("Error in POST /api/whatsapp/messages:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

