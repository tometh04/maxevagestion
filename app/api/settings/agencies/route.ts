import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET() {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    let query = supabase.from("agencies").select("*").order("name")
    // Multi-tenant: solo agencias de la org del user
    if (user.org_id) query = query.eq("org_id", user.org_id)

    const { data: agencies } = await query

    return NextResponse.json({ agencies: agencies || [] })
  } catch (error) {
    return NextResponse.json({ error: "Error al cargar agencias" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }
    if (!user.org_id) {
      return NextResponse.json({ error: "Tu usuario no tiene organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const body = await request.json()
    const { id, name, city, timezone } = body

    if (!name || !city || !timezone) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    if (id) {
      // Verificar que la agencia pertenece a la org del user antes de actualizar
      const { data: existing } = await supabase
        .from("agencies")
        .select("id, org_id")
        .eq("id", id)
        .maybeSingle()
      if (!existing || (existing as any).org_id !== user.org_id) {
        return NextResponse.json({ error: "Agencia no encontrada" }, { status: 404 })
      }

      const agenciesTable = supabase.from("agencies") as any
      const { data, error } = await agenciesTable
        .update({ name, city, timezone })
        .eq("id", id)
        .eq("org_id", user.org_id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: "Error al actualizar agencia" }, { status: 400 })
      }

      return NextResponse.json({ success: true, agency: data })
    } else {
      // Crear agencia NUEVA en la org del user
      const agenciesTable = supabase.from("agencies") as any
      const { data, error } = await agenciesTable
        .insert({ name, city, timezone, org_id: user.org_id })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: "Error al crear agencia" }, { status: 400 })
      }

      return NextResponse.json({ success: true, agency: data })
    }
  } catch (error) {
    return NextResponse.json({ error: "Error al guardar agencia" }, { status: 500 })
  }
}

