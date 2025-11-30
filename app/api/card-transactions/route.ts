import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

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

    // Build query
    let query = supabase
      .from("card_transactions")
      .select(`
        *,
        operations:operation_id(id, destination),
        payments:payment_id(id, amount, status),
        cash_boxes:cash_box_id(id, name),
        agencies:agency_id(id, name)
      `)

    // Apply permissions
    if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
      query = query.in("agency_id", agencyIds)
    }

    // Apply filters
    const status = searchParams.get("status")
    if (status && status !== "ALL") {
      query = query.eq("status", status)
    }

    const agencyId = searchParams.get("agencyId")
    if (agencyId && agencyId !== "ALL") {
      query = query.eq("agency_id", agencyId)
    }

    const operationId = searchParams.get("operationId")
    if (operationId) {
      query = query.eq("operation_id", operationId)
    }

    const cardType = searchParams.get("cardType")
    if (cardType && cardType !== "ALL") {
      query = query.eq("card_type", cardType)
    }

    const dateFrom = searchParams.get("dateFrom")
    if (dateFrom) {
      query = query.gte("transaction_date", dateFrom)
    }

    const dateTo = searchParams.get("dateTo")
    if (dateTo) {
      query = query.lte("transaction_date", dateTo)
    }

    // Add pagination
    const limit = parseInt(searchParams.get("limit") || "100")
    const offset = parseInt(searchParams.get("offset") || "0")

    const { data: transactions, error } = await query
      .order("transaction_date", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("Error fetching card transactions:", error)
      return NextResponse.json({ error: "Error al obtener transacciones" }, { status: 500 })
    }

    return NextResponse.json({ transactions: transactions || [] })
  } catch (error: any) {
    console.error("Error in GET /api/card-transactions:", error)
    return NextResponse.json({ error: error.message || "Error al obtener transacciones" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "cash", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear transacciones" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const {
      operation_id,
      payment_id,
      cash_box_id,
      agency_id,
      transaction_number,
      card_type,
      card_last_four,
      amount,
      currency,
      commission_percentage,
      commission_amount,
      transaction_date,
      settlement_date,
      status,
      processor,
      authorization_code,
      description,
      notes,
    } = body

    // Validate required fields
    if (!agency_id || !card_type || !amount || amount <= 0 || !transaction_date) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Create transaction
    const transactionData: Record<string, any> = {
      operation_id: operation_id || null,
      payment_id: payment_id || null,
      cash_box_id: cash_box_id || null,
      agency_id,
      transaction_number: transaction_number || null,
      card_type,
      card_last_four: card_last_four || null,
      amount,
      currency: currency || "ARS",
      commission_percentage: commission_percentage || 0,
      commission_amount: commission_amount || 0,
      net_amount: amount - (commission_amount || 0), // Will be recalculated by trigger
      transaction_date,
      settlement_date: settlement_date || null,
      status: status || "PENDING",
      processor: processor || null,
      authorization_code: authorization_code || null,
      description: description || null,
      notes: notes || null,
      created_by: user.id,
    }

    const { data: transaction, error } = await (supabase.from("card_transactions") as any)
      .insert(transactionData)
      .select()
      .single()

    if (error) {
      console.error("Error creating card transaction:", error)
      return NextResponse.json({ error: "Error al crear transacción" }, { status: 500 })
    }

    // Create cash movement if cash_box_id provided
    if (cash_box_id && transaction.status === "APPROVED") {
      await (supabase.from("cash_movements") as any).insert({
        cash_box_id,
        operation_id: operation_id || null,
        user_id: user.id,
        type: "INCOME",
        category: "CARD_PAYMENT",
        amount: transaction.net_amount, // Use net amount after commission
        currency: transaction.currency,
        movement_date: transaction.transaction_date,
        notes: `Transacción con tarjeta ${transaction.card_type} - ${transaction.transaction_number || ""}`,
        is_touristic: true,
      })
    }

    return NextResponse.json({ transaction }, { status: 201 })
  } catch (error: any) {
    console.error("Error in POST /api/card-transactions:", error)
    return NextResponse.json({ error: error.message || "Error al crear transacción" }, { status: 500 })
  }
}

