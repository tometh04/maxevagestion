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
    const { data: agencies } = await supabase.from("agencies").select("*").order("name")

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

    const supabase = await createServerClient()
    const body = await request.json()
    const { id, name, city, timezone } = body

    if (!name || !city || !timezone) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    if (id) {
      // Update existing agency
      const agenciesTable = supabase.from("agencies") as any
      const { data, error } = await agenciesTable
        .update({ name, city, timezone })
        .eq("id", id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: "Error al actualizar agencia" }, { status: 400 })
      }

      return NextResponse.json({ success: true, agency: data })
    } else {
      // Create new agency
      const agenciesTable = supabase.from("agencies") as any
      const { data, error } = await agenciesTable
        .insert({ name, city, timezone })
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

