import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Get all operators with their operations and payments
    const { data: operators, error } = await supabase
      .from("operators")
      .select(
        `
        *,
        operations:operations!operator_id (
          id,
          operator_cost,
          currency,
          status,
          departure_date,
          payments:payments!operation_id (
            id,
            amount,
            currency,
            status,
            direction,
            date_due,
            date_paid
          )
        )
      `,
      )
      .order("name")

    if (error) {
      console.error("Error fetching operators:", error)
      return NextResponse.json({ error: "Error al obtener operadores" }, { status: 500 })
    }

    // Calculate metrics for each operator
    const operatorsWithStats = (operators || []).map((op: any) => {
      const operations = (op.operations || []) as any[]
      const operationsCount = operations.length

      // Calculate total operator_cost
      const totalCost = operations.reduce((sum: number, o: any) => sum + (o.operator_cost || 0), 0)

      // Calculate total paid (only EXPENSE payments that are PAID)
      const paidAmount = operations.reduce((sum: number, o: any) => {
        const payments = (o.payments || []) as any[]
        const paidPayments = payments.filter(
          (p: any) => p.direction === "EXPENSE" && p.status === "PAID",
        )
        return sum + paidPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0)
      }, 0)

      // Calculate balance (total cost - paid)
      const balance = totalCost - paidAmount

      // Find next payment due date (PENDING EXPENSE payments)
      const nextPayment = operations
        .flatMap((o: any) => (o.payments || []) as any[])
        .filter((p: any) => p.direction === "EXPENSE" && p.status === "PENDING")
        .sort((a: any, b: any) => new Date(a.date_due).getTime() - new Date(b.date_due).getTime())[0]

      return {
        id: op.id,
        name: op.name,
        contact_name: op.contact_name,
        contact_email: op.contact_email,
        contact_phone: op.contact_phone,
        credit_limit: op.credit_limit,
        operationsCount,
        totalCost,
        paidAmount,
        balance,
        nextPaymentDate: nextPayment?.date_due || null,
      }
    })

    return NextResponse.json({ operators: operatorsWithStats })
  } catch (error) {
    console.error("Error in GET /api/operators:", error)
    return NextResponse.json({ error: "Error al obtener operadores" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    const { name, contact_name, contact_email, contact_phone, credit_limit } = body

    // Validations
    if (!name) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 })
    }

    // Create operator
    const { data: operator, error: createError } = await supabase
      .from("operators")
      .insert({
        name,
        contact_name: contact_name || null,
        contact_email: contact_email || null,
        contact_phone: contact_phone || null,
        credit_limit: credit_limit || null,
      })
      .select()
      .single()

    if (createError || !operator) {
      console.error("Error creating operator:", createError)
      return NextResponse.json({ error: "Error al crear operador" }, { status: 400 })
    }

    return NextResponse.json({ success: true, operator })
  } catch (error) {
    console.error("Error in POST /api/operators:", error)
    return NextResponse.json({ error: "Error al crear operador" }, { status: 500 })
  }
}

