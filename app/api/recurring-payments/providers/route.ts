import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

// GET - Obtener lista de proveedores
export async function GET() {
  try {
    await getCurrentUser() // Solo verificar autenticación
    const supabase = await createServerClient()

    // Obtener todos los proveedores (sin filtro por agencia)
    const { data, error } = await (supabase.from("recurring_payment_providers") as any)
      .select("name")
      .order("name")

    if (error) {
      // Si la tabla no existe, devolver array vacío
      console.error("Error fetching providers:", error)
      return NextResponse.json({ providers: [] })
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
    await getCurrentUser() // Solo verificar autenticación
    const supabase = await createServerClient()
    const body = await request.json()

    const { name } = body

    if (!name || name.length < 3) {
      return NextResponse.json(
        { error: "El nombre del proveedor debe tener al menos 3 caracteres" },
        { status: 400 }
      )
    }

    // Insertar sin agency_id (proveedores globales)
    const { error } = await (supabase.from("recurring_payment_providers") as any)
      .upsert(
        { name },
        { onConflict: "name" }
      )

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
