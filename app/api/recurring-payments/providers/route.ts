import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

// GET - Obtener lista de proveedores
export async function GET() {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    const { data, error } = await (supabase.from("recurring_payment_providers") as any)
      .select("name")
      .eq("agency_id", user.agency_id)
      .order("name")

    if (error) {
      // Si la tabla no existe, devolver array vacío
      if (error.code === "42P01") {
        return NextResponse.json({ providers: [] })
      }
      throw error
    }

    const providers = (data || []).map((p: any) => p.name)
    return NextResponse.json({ providers })
  } catch (error: any) {
    console.error("Error fetching providers:", error)
    return NextResponse.json({ providers: [] })
  }
}

// POST - Crear nuevo proveedor
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    const { name } = body

    if (!name || name.length < 3) {
      return NextResponse.json(
        { error: "El nombre del proveedor debe tener al menos 3 caracteres" },
        { status: 400 }
      )
    }

    const { data, error } = await (supabase.from("recurring_payment_providers") as any)
      .upsert(
        { name, agency_id: user.agency_id },
        { onConflict: "name,agency_id" }
      )
      .select()

    if (error) {
      console.error("Error creating provider:", error)
      return NextResponse.json(
        { error: "Error al crear proveedor" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, provider: name })
  } catch (error: any) {
    console.error("Error creating provider:", error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

