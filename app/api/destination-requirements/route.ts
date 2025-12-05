import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

// GET - Obtener todos los requisitos o filtrar por destino
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    
    const { searchParams } = new URL(request.url)
    const destinationCode = searchParams.get("destination")
    const activeOnly = searchParams.get("active") !== "false"

    let query = (supabase.from("destination_requirements") as any)
      .select("*")
      .order("destination_name", { ascending: true })
      .order("requirement_type", { ascending: true })

    if (destinationCode) {
      query = query.eq("destination_code", destinationCode.toUpperCase())
    }

    if (activeOnly) {
      query = query.eq("is_active", true)
    }

    const { data, error } = await query

    if (error) {
      console.error("Error fetching requirements:", error)
      return NextResponse.json({ error: "Error al obtener requisitos" }, { status: 500 })
    }

    return NextResponse.json({ requirements: data || [] })
  } catch (error: any) {
    console.error("Error in GET /api/destination-requirements:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Crear nuevo requisito
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    if (!canPerformAction(user, "settings", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear requisitos" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const {
      destination_code,
      destination_name,
      requirement_type,
      requirement_name,
      is_required,
      description,
      url,
      days_before_trip,
      valid_from,
      valid_to,
    } = body

    if (!destination_code || !destination_name || !requirement_type || !requirement_name) {
      return NextResponse.json({ 
        error: "Campos requeridos: destination_code, destination_name, requirement_type, requirement_name" 
      }, { status: 400 })
    }

    const { data, error } = await (supabase.from("destination_requirements") as any)
      .insert({
        destination_code: destination_code.toUpperCase(),
        destination_name,
        requirement_type,
        requirement_name,
        is_required: is_required ?? true,
        description,
        url,
        days_before_trip: days_before_trip ?? 30,
        valid_from,
        valid_to,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating requirement:", error)
      return NextResponse.json({ error: "Error al crear requisito" }, { status: 500 })
    }

    return NextResponse.json({ requirement: data })
  } catch (error: any) {
    console.error("Error in POST /api/destination-requirements:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

