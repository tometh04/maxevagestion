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

    // Traer usuarios con sus agencias asignadas, filtrando por org del usuario actual
    let query = supabase
      .from("users")
      .select(`
        *,
        user_agencies(
          agency_id,
          agencies(id, name)
        )
      `)
      .order("created_at", { ascending: false })

    if (user.org_id) {
      query = query.eq("org_id", user.org_id)
    }

    const { data: users, error: usersError } = await query

    if (usersError) {
      console.error("Error fetching users:", usersError)
      // Fallback sin user_agencies
      let simpleQuery = supabase.from("users").select("*").order("created_at", { ascending: false })
      if (user.org_id) simpleQuery = simpleQuery.eq("org_id", user.org_id)
      const { data: usersSimple, error: simpleError } = await simpleQuery

      if (simpleError) {
        return NextResponse.json({ error: "Error al cargar usuarios", details: simpleError.message }, { status: 500 })
      }

      return NextResponse.json({ users: usersSimple || [] })
    }

    return NextResponse.json({ users: users || [] })
  } catch (error) {
    return NextResponse.json({ error: "Error al cargar usuarios" }, { status: 500 })
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
    const { id, role, is_active } = body

    if (!id) {
      return NextResponse.json({ error: "Falta el ID del usuario" }, { status: 400 })
    }

    // Verificar que el usuario target esté en la misma org que el solicitante
    const { data: existingUser } = await supabase
      .from("users")
      .select("role, org_id")
      .eq("id", id)
      .single()

    const target = existingUser as { role: string; org_id: string | null } | null
    if (!target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }
    if (user.org_id && target.org_id !== user.org_id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    // No permitir cambiar el rol de SUPER_ADMIN
    if (target.role === "SUPER_ADMIN" && role && role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "No se puede cambiar el rol de SUPER_ADMIN" }, { status: 400 })
    }

    const updates: { role?: string; is_active?: boolean } = {}
    if (role) updates.role = role
    if (typeof is_active === "boolean") updates.is_active = is_active

    const usersTable = supabase.from("users") as any
    const { data, error } = await usersTable
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Error al actualizar usuario" }, { status: 400 })
    }

    return NextResponse.json({ success: true, user: data })
  } catch (error) {
    return NextResponse.json({ error: "Error al actualizar usuario" }, { status: 500 })
  }
}

