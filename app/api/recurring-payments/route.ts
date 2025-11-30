import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import {
  getRecurringPayments,
  createRecurringPayment,
} from "@/lib/accounting/recurring-payments"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Verificar permisos
    if (!canPerformAction(user, "accounting", "read")) {
      return NextResponse.json({ error: "No tiene permiso para ver pagos recurrentes" }, { status: 403 })
    }

    const operatorId = searchParams.get("operatorId") || undefined
    const isActive = searchParams.get("isActive")
      ? searchParams.get("isActive") === "true"
      : undefined

    const payments = await getRecurringPayments(supabase, {
      operatorId,
      isActive,
    })

    return NextResponse.json({ payments })
  } catch (error: any) {
    console.error("Error in GET /api/recurring-payments:", error)
    return NextResponse.json({ error: error.message || "Error al obtener pagos recurrentes" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos
    if (!canPerformAction(user, "accounting", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear pagos recurrentes" }, { status: 403 })
    }

    const body = await request.json()
    const {
      operator_id,
      amount,
      currency,
      frequency,
      start_date,
      end_date,
      description,
      notes,
      invoice_number,
      reference,
    } = body

    // Validar campos requeridos
    if (!operator_id || !amount || !currency || !frequency || !start_date || !description) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: operator_id, amount, currency, frequency, start_date, description" },
        { status: 400 }
      )
    }

    const result = await createRecurringPayment(supabase, {
      operator_id,
      amount: parseFloat(amount),
      currency: currency as "ARS" | "USD",
      frequency: frequency as "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY",
      start_date,
      end_date: end_date || null,
      description,
      notes: notes || null,
      invoice_number: invoice_number || null,
      reference: reference || null,
      created_by: user.id,
    })

    return NextResponse.json({ id: result.id }, { status: 201 })
  } catch (error: any) {
    console.error("Error in POST /api/recurring-payments:", error)
    return NextResponse.json({ error: error.message || "Error al crear pago recurrente" }, { status: 500 })
  }
}

