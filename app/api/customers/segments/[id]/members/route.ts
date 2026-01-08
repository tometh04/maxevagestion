import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación
const addMemberSchema = z.object({
  customer_id: z.string().uuid(),
  membership_type: z.enum(['manual', 'excluded']).default('manual'),
})

// POST - Agregar cliente al segmento
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: segmentId } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Verificar que el segmento existe
    const { data: segment, error: segmentError } = await (supabase.from("customer_segments") as any)
      .select("id, segment_type")
      .eq("id", segmentId)
      .in("agency_id", agencyIds)
      .single()

    if (segmentError || !segment) {
      return NextResponse.json(
        { error: "Segmento no encontrado" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const validatedData = addMemberSchema.parse(body)

    // Verificar que el cliente existe y pertenece a la agencia
    const { data: customer, error: customerError } = await (supabase.from("customers") as any)
      .select("id")
      .eq("id", validatedData.customer_id)
      .in("agency_id", agencyIds)
      .single()

    if (customerError || !customer) {
      return NextResponse.json(
        { error: "Cliente no encontrado" },
        { status: 404 }
      )
    }

    // Verificar si ya es miembro
    const { data: existingMember } = await (supabase.from("customer_segment_members") as any)
      .select("id, membership_type")
      .eq("segment_id", segmentId)
      .eq("customer_id", validatedData.customer_id)
      .single()

    if (existingMember) {
      // Actualizar tipo de membresía
      const { data: member, error } = await (supabase.from("customer_segment_members") as any)
        .update({
          membership_type: validatedData.membership_type,
          added_by: user.id,
          added_at: new Date().toISOString(),
        })
        .eq("id", existingMember.id)
        .select()
        .single()

      if (error) {
        throw error
      }

      return NextResponse.json({ member, updated: true })
    }

    // Crear nueva membresía
    const { data: member, error } = await (supabase.from("customer_segment_members") as any)
      .insert({
        segment_id: segmentId,
        customer_id: validatedData.customer_id,
        membership_type: validatedData.membership_type,
        added_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("Error adding member:", error)
      return NextResponse.json(
        { error: "Error al agregar cliente al segmento" },
        { status: 500 }
      )
    }

    return NextResponse.json({ member, created: true })
  } catch (error: any) {
    console.error("Error in POST /api/customers/segments/[id]/members:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al agregar cliente" },
      { status: 500 }
    )
  }
}

// DELETE - Remover cliente del segmento
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: segmentId } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    
    const customerId = searchParams.get("customerId")
    
    if (!customerId) {
      return NextResponse.json(
        { error: "Se requiere customerId" },
        { status: 400 }
      )
    }

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Verificar que el segmento existe
    const { data: segment } = await (supabase.from("customer_segments") as any)
      .select("id")
      .eq("id", segmentId)
      .in("agency_id", agencyIds)
      .single()

    if (!segment) {
      return NextResponse.json(
        { error: "Segmento no encontrado" },
        { status: 404 }
      )
    }

    // Eliminar membresía
    const { error } = await (supabase.from("customer_segment_members") as any)
      .delete()
      .eq("segment_id", segmentId)
      .eq("customer_id", customerId)

    if (error) {
      console.error("Error removing member:", error)
      return NextResponse.json(
        { error: "Error al remover cliente del segmento" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/customers/segments/[id]/members:", error)
    return NextResponse.json(
      { error: error.message || "Error al remover cliente" },
      { status: 500 }
    )
  }
}
