import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const customerId = searchParams.get("customerId")
    const leadId = searchParams.get("leadId")
    const operationId = searchParams.get("operationId")

    let query = (supabase.from("communications") as any).select("*").order("date", { ascending: false })

    if (customerId) {
      query = query.eq("customer_id", customerId)
    } else if (leadId) {
      query = query.eq("lead_id", leadId)
    } else if (operationId) {
      query = query.eq("operation_id", operationId)
    } else {
      return NextResponse.json({ error: "customerId, leadId o operationId es requerido" }, { status: 400 })
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ communications: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    // Whitelist de campos permitidos (prevenir field injection)
    const { customer_id, lead_id, operation_id, type, channel, subject, content, date, notes } = body

    const { data, error } = await (supabase.from("communications") as any)
      .insert({
        customer_id: customer_id || null,
        lead_id: lead_id || null,
        operation_id: operation_id || null,
        type: type || "NOTE",
        channel: channel || null,
        subject: subject || null,
        content: content || null,
        date: date || new Date().toISOString(),
        notes: notes || null,
        user_id: user.id,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ communication: data }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

