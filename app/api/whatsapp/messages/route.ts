import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Obtener agencias del usuario
    const { data: userAgencies } = await supabase
      .from("user_agencies")
      .select("agency_id")
      .eq("user_id", user.id)

    const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

    // Query mensajes
    let query = (supabase.from("whatsapp_messages") as any)
      .select(`
        *,
        message_templates:template_id (name, emoji_prefix, category),
        customers:customer_id (first_name, last_name, email),
        operations:operation_id (destination, departure_date)
      `)
      .order("scheduled_for", { ascending: true })

    // Filtrar por agencia
    if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
      query = query.in("agency_id", agencyIds)
    }

    // Filtros
    const status = searchParams.get("status")
    if (status && status !== "ALL") {
      query = query.eq("status", status)
    } else {
      // Por defecto mostrar pendientes primero
      query = query.in("status", ["PENDING", "SENT", "SKIPPED"])
    }

    const customerId = searchParams.get("customerId")
    if (customerId) {
      query = query.eq("customer_id", customerId)
    }

    const limit = parseInt(searchParams.get("limit") || "50")
    query = query.limit(limit)

    const { data: messages, error } = await query

    if (error) {
      console.error("Error fetching messages:", error)
      return NextResponse.json({ error: "Error al obtener mensajes" }, { status: 500 })
    }

    // Contar por estado
    const { data: counts } = await (supabase.from("whatsapp_messages") as any)
      .select("status")
      .in("agency_id", agencyIds.length > 0 ? agencyIds : ["00000000-0000-0000-0000-000000000000"])

    const countByStatus = {
      PENDING: 0,
      SENT: 0,
      SKIPPED: 0,
    }
    for (const m of counts || []) {
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
        status: "PENDING",
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

