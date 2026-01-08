import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación para actualizar
const updateSegmentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  rules: z.array(z.any()).optional(),
  rules_logic: z.enum(['AND', 'OR']).optional(),
  auto_update: z.boolean().optional(),
  priority: z.number().optional(),
  is_active: z.boolean().optional(),
})

// GET - Obtener segmento con sus miembros
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Obtener segmento - simplificada
    const { data: segment, error } = await (supabase.from("customer_segments") as any)
      .select(`*`)
      .eq("id", id)
      .in("agency_id", agencyIds)
      .single()

    if (error || !segment) {
      return NextResponse.json(
        { error: "Segmento no encontrado" },
        { status: 404 }
      )
    }

    // Obtener miembros del segmento
    const { data: members } = await (supabase.from("customer_segment_members") as any)
      .select(`
        *,
        customer:customers (id, first_name, last_name, email, phone)
      `)
      .eq("segment_id", id)
      .neq("membership_type", "excluded")

    return NextResponse.json({ 
      segment,
      members: members || [],
    })
  } catch (error: any) {
    console.error("Error in GET /api/customers/segments/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener segmento" },
      { status: 500 }
    )
  }
}

// PUT - Actualizar segmento
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Verificar que el segmento existe
    const { data: existing, error: fetchError } = await (supabase.from("customer_segments") as any)
      .select("id")
      .eq("id", id)
      .in("agency_id", agencyIds)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Segmento no encontrado" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const validatedData = updateSegmentSchema.parse(body)

    // Actualizar segmento
    const { data: segment, error } = await (supabase.from("customer_segments") as any)
      .update(validatedData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating segment:", error)
      return NextResponse.json(
        { error: "Error al actualizar segmento" },
        { status: 500 }
      )
    }

    return NextResponse.json({ segment })
  } catch (error: any) {
    console.error("Error in PUT /api/customers/segments/[id]:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al actualizar segmento" },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar segmento (soft delete)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Soft delete
    const { error } = await (supabase.from("customer_segments") as any)
      .update({ is_active: false })
      .eq("id", id)
      .in("agency_id", agencyIds)

    if (error) {
      console.error("Error deleting segment:", error)
      return NextResponse.json(
        { error: "Error al eliminar segmento" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/customers/segments/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al eliminar segmento" },
      { status: 500 }
    )
  }
}
