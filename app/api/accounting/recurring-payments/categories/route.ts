import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * GET /api/accounting/recurring-payments/categories
 * Obtener todas las categorías de gastos recurrentes
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    // Obtener todas las categorías activas
    const { data: categories, error } = await (supabase.from("recurring_payment_categories") as any)
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true })

    if (error) {
      console.error("Error fetching recurring payment categories:", error)
      return NextResponse.json({ error: "Error al obtener categorías" }, { status: 500 })
    }

    return NextResponse.json({ categories: categories || [] })
  } catch (error: any) {
    console.error("Error in GET /api/accounting/recurring-payments/categories:", error)
    return NextResponse.json({ error: error.message || "Error al obtener categorías" }, { status: 500 })
  }
}

/**
 * POST /api/accounting/recurring-payments/categories
 * Crear una nueva categoría (solo SUPER_ADMIN)
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos
    if (!user || user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "No tiene permiso para crear categorías" }, { status: 403 })
    }

    const body = await request.json()
    const { name, description, color } = body

    // Validar campos requeridos
    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: "El nombre debe tener al menos 2 caracteres" }, { status: 400 })
    }

    // Validar color (formato hex)
    const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
    const finalColor = color || "#3b82f6"
    if (!colorRegex.test(finalColor)) {
      return NextResponse.json({ error: "El color debe estar en formato hex (#RRGGBB)" }, { status: 400 })
    }

    // Crear categoría
    const { data: category, error } = await (supabase.from("recurring_payment_categories") as any)
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        color: finalColor,
        is_active: true,
      })
      .select("*")
      .single()

    if (error) {
      console.error("Error creating recurring payment category:", error)
      if (error.code === "23505") {
        // Unique constraint violation
        return NextResponse.json({ error: "Ya existe una categoría con ese nombre" }, { status: 400 })
      }
      return NextResponse.json({ error: "Error al crear categoría" }, { status: 500 })
    }

    return NextResponse.json({ category })
  } catch (error: any) {
    console.error("Error in POST /api/accounting/recurring-payments/categories:", error)
    return NextResponse.json({ error: error.message || "Error al crear categoría" }, { status: 500 })
  }
}
