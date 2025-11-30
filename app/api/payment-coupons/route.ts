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
    let query = (supabase.from("payment_coupons") as any)
      .select(`
        *,
        operations:operation_id(id, destination, status),
        payments:payment_id(id, amount, status),
        customers:customer_id(id, first_name, last_name),
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

    const customerId = searchParams.get("customerId")
    if (customerId) {
      query = query.eq("customer_id", customerId)
    }

    const overdueOnly = searchParams.get("overdueOnly")
    if (overdueOnly === "true") {
      query = query.eq("status", "OVERDUE")
    }

    // Add pagination
    const limit = parseInt(searchParams.get("limit") || "100")
    const offset = parseInt(searchParams.get("offset") || "0")

    const { data: coupons, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("Error fetching payment coupons:", error)
      return NextResponse.json({ error: "Error al obtener cupones" }, { status: 500 })
    }

    return NextResponse.json({ coupons: coupons || [] })
  } catch (error: any) {
    console.error("Error in GET /api/payment-coupons:", error)
    return NextResponse.json({ error: error.message || "Error al obtener cupones" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "cash", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear cupones" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const {
      operation_id,
      payment_id,
      customer_id,
      agency_id,
      coupon_type,
      amount,
      currency,
      issue_date,
      due_date,
      description,
      notes,
      customer_name,
      customer_phone,
      customer_email,
    } = body

    // Validate required fields
    if (!agency_id || !amount || amount <= 0 || !due_date) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Generate coupon number
    let couponNumber: string
    const { data: numberResult, error: numberError } = await supabase.rpc("generate_coupon_number")

    if (numberError || !numberResult) {
      console.error("Error generating coupon number:", numberError)
      // Fallback: generate manually
      const year = new Date().getFullYear()
      const { count } = await supabase
        .from("payment_coupons")
        .select("*", { count: "exact", head: true })
        .like("coupon_number", `CUP-${year}-%`)
      const sequenceNum = (count || 0) + 1
      couponNumber = `CUP-${year}-${String(sequenceNum).padStart(4, "0")}`
    } else {
      couponNumber = numberResult as string
    }

    // Get customer info if customer_id provided
    let finalCustomerName = customer_name
    let finalCustomerPhone = customer_phone
    let finalCustomerEmail = customer_email

    if (customer_id && !customer_name) {
      const { data: customer } = await (supabase.from("customers") as any)
        .select("first_name, last_name, phone, email")
        .eq("id", customer_id)
        .single()

      if (customer) {
        finalCustomerName = `${customer.first_name} ${customer.last_name}`
        finalCustomerPhone = customer.phone
        finalCustomerEmail = customer.email
      }
    }

    if (!finalCustomerName) {
      return NextResponse.json({ error: "Debe proporcionar nombre del cliente" }, { status: 400 })
    }

    // Create coupon
    const couponData: Record<string, any> = {
      operation_id: operation_id || null,
      payment_id: payment_id || null,
      customer_id: customer_id || null,
      agency_id,
      coupon_number: couponNumber,
      coupon_type: coupon_type || "PAYMENT",
      amount,
      currency: currency || "ARS",
      issue_date: issue_date || new Date().toISOString().split("T")[0],
      due_date,
      status: "PENDING",
      customer_name: finalCustomerName,
      customer_phone: finalCustomerPhone || null,
      customer_email: finalCustomerEmail || null,
      description: description || null,
      notes: notes || null,
      created_by: user.id,
    }

    const { data: coupon, error } = await (supabase.from("payment_coupons") as any)
      .insert(couponData)
      .select()
      .single()

    if (error) {
      console.error("Error creating payment coupon:", error)
      return NextResponse.json({ error: "Error al crear cupón" }, { status: 500 })
    }

    return NextResponse.json({ coupon }, { status: 201 })
  } catch (error: any) {
    console.error("Error in POST /api/payment-coupons:", error)
    return NextResponse.json({ error: error.message || "Error al crear cupón" }, { status: 500 })
  }
}

