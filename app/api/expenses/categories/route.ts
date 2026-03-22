import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * GET /api/expenses/categories
 * Returns all active expense categories (shared between recurring and variable)
 */
export async function GET() {
  try {
    const { user } = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const supabase = await createServerClient()
    const { data: categories, error } = await (supabase.from("recurring_payment_categories") as any)
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true })

    if (error) {
      console.error("Error fetching expense categories:", error)
      return NextResponse.json({ error: "Error al obtener categorías" }, { status: 500 })
    }

    return NextResponse.json({ categories: categories || [] })
  } catch (error: any) {
    console.error("Error in GET /api/expenses/categories:", error)
    return NextResponse.json({ error: error.message || "Error al obtener categorías" }, { status: 500 })
  }
}
