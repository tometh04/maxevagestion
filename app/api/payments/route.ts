import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    const {
      operation_id,
      payer_type,
      direction,
      method,
      amount,
      currency,
      date_paid,
      date_due,
      status,
      notes,
    } = body

    if (!operation_id || !payer_type || !direction || !amount || !currency) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    const paymentData = {
      operation_id,
      payer_type,
      direction,
      method: method || null,
      amount,
      currency,
      date_paid: date_paid || null,
      date_due: date_due || date_paid,
      status: status || "PAID",
      notes: notes || null,
    }

    const { data: payment, error } = await (supabase.from("payments") as any)
      .insert(paymentData)
      .select()
      .single()

    if (error) {
      console.error("Error creating payment:", error)
      return NextResponse.json({ error: "Error al crear pago" }, { status: 500 })
    }

    return NextResponse.json({ payment })
  } catch (error) {
    console.error("Error in POST /api/payments:", error)
    return NextResponse.json({ error: "Error al registrar pago" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    
    const operationId = searchParams.get("operationId")

    let query = supabase.from("payments").select("*")
    
    if (operationId) {
      query = query.eq("operation_id", operationId)
    }

    const { data: payments, error } = await query.order("date_paid", { ascending: false })

    if (error) {
      console.error("Error fetching payments:", error)
      return NextResponse.json({ error: "Error al obtener pagos" }, { status: 500 })
    }

    return NextResponse.json({ payments })
  } catch (error) {
    console.error("Error in GET /api/payments:", error)
    return NextResponse.json({ error: "Error al obtener pagos" }, { status: 500 })
  }
}
