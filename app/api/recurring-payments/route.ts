import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Verificar permisos
    if (!canPerformAction(user, "accounting", "read")) {
      return NextResponse.json({ error: "No tiene permiso para ver pagos recurrentes" }, { status: 403 })
    }

    const isActive = searchParams.get("isActive")
      ? searchParams.get("isActive") === "true"
      : undefined

    let query = (supabase.from("recurring_payments") as any)
      .select("*")
      .order("created_at", { ascending: false })

    // Filtrar por agencia del usuario
    if (user.agency_id) {
      query = query.eq("agency_id", user.agency_id)
    }

    if (isActive !== undefined) {
      query = query.eq("is_active", isActive)
    }

    const { data, error } = await query

    if (error) {
      console.error("Error fetching recurring payments:", error)
      // Si la tabla no existe (código 42P01) o error de schema cache
      if (error.code === "42P01" || error.message?.includes("schema cache") || error.message?.includes("does not exist")) {
        return NextResponse.json({ 
          payments: [],
          tableNotFound: true,
          message: "La tabla recurring_payments no existe. Ejecuta la migración SQL en Supabase."
        })
      }
      // Devolver array vacío para otros errores de tabla
      return NextResponse.json({ 
        payments: [],
        tableNotFound: true,
        message: "Error de base de datos. Verifica que la tabla recurring_payments exista."
      })
    }

    return NextResponse.json({ payments: data || [] })
  } catch (error: any) {
    console.error("Error in GET /api/recurring-payments:", error)
    // No devolver 500, devolver payments vacío con mensaje
    return NextResponse.json({ 
      payments: [],
      tableNotFound: true,
      message: "La tabla recurring_payments no existe. Ejecuta la migración SQL."
    })
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
      provider_name,
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
    if (!provider_name || provider_name.length < 3) {
      return NextResponse.json(
        { error: "El proveedor debe tener al menos 3 caracteres" },
        { status: 400 }
      )
    }

    if (!amount || !currency || !frequency || !start_date || !description) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: amount, currency, frequency, start_date, description" },
        { status: 400 }
      )
    }

    // Calcular next_due_date basado en start_date
    const nextDueDate = start_date

    const { data, error } = await (supabase.from("recurring_payments") as any)
      .insert({
        provider_name,
        amount: parseFloat(amount),
        currency,
        frequency,
        start_date,
        end_date: end_date || null,
        next_due_date: nextDueDate,
        is_active: true,
        description,
        notes: notes || null,
        invoice_number: invoice_number || null,
        reference: reference || null,
        agency_id: user.agency_id,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (error) {
      console.error("Error creating recurring payment:", error)
      
      // Si la tabla no existe
      if (error.code === "42P01") {
        return NextResponse.json({ 
          error: "La tabla recurring_payments no existe. Ejecuta la migración SQL en Supabase.",
          hint: "Ve a Supabase → SQL Editor → Ejecuta: supabase/migrations/041_fix_recurring_payments.sql"
        }, { status: 500 })
      }
      
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // También guardar el proveedor en la tabla de proveedores para autocompletado
    await (supabase.from("recurring_payment_providers") as any)
      .upsert(
        { name: provider_name, agency_id: user.agency_id },
        { onConflict: "name,agency_id", ignoreDuplicates: true }
      )

    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (error: any) {
    console.error("Error in POST /api/recurring-payments:", error)
    return NextResponse.json({ error: error.message || "Error al crear pago recurrente" }, { status: 500 })
  }
}
