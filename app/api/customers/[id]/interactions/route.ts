import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación
const createInteractionSchema = z.object({
  interaction_type: z.enum([
    'call', 'email', 'whatsapp', 'meeting', 'video_call', 
    'social_media', 'note', 'task', 'quote_sent', 'quote_approved',
    'payment', 'complaint', 'feedback', 'other'
  ]),
  direction: z.enum(['inbound', 'outbound', 'internal']).optional(),
  subject: z.string().optional(),
  content: z.string().optional(),
  outcome: z.enum([
    'successful', 'no_answer', 'callback', 'interested',
    'not_interested', 'completed', 'pending', 'cancelled'
  ]).optional(),
  operation_id: z.string().uuid().optional().nullable(),
  follow_up_date: z.string().optional().nullable(),
  follow_up_notes: z.string().optional(),
  duration_minutes: z.number().optional(),
  tags: z.array(z.string()).optional(),
})

// GET - Obtener interacciones de un cliente
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Verificar que el cliente existe y pertenece a las agencias
    const { data: customer, error: customerError } = await (supabase.from("customers") as any)
      .select("id")
      .eq("id", customerId)
      .in("agency_id", agencyIds)
      .single()

    if (customerError || !customer) {
      return NextResponse.json(
        { error: "Cliente no encontrado" },
        { status: 404 }
      )
    }

    // Parámetros de filtro
    const interactionType = searchParams.get("type")
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    // Query base - simplificada
    let query = (supabase.from("customer_interactions") as any)
      .select(`*`)
      .eq("customer_id", customerId)
      .in("agency_id", agencyIds)
      .order("created_at", { ascending: false })

    // Filtros
    if (interactionType) {
      query = query.eq("interaction_type", interactionType)
    }

    // Paginación
    query = query.range(offset, offset + limit - 1)

    const { data: interactions, error } = await query

    if (error) {
      console.error("Error fetching interactions:", error)
      return NextResponse.json(
        { error: "Error al obtener interacciones" },
        { status: 500 }
      )
    }

    // Estadísticas rápidas
    const { data: stats } = await (supabase.from("customer_interactions") as any)
      .select("interaction_type")
      .eq("customer_id", customerId)
      .in("agency_id", agencyIds)

    const statsByType: Record<string, number> = {}
    ;(stats || []).forEach((s: any) => {
      statsByType[s.interaction_type] = (statsByType[s.interaction_type] || 0) + 1
    })

    return NextResponse.json({ 
      interactions, 
      stats: {
        total: stats?.length || 0,
        byType: statsByType,
      }
    })
  } catch (error: any) {
    console.error("Error in GET /api/customers/[id]/interactions:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener interacciones" },
      { status: 500 }
    )
  }
}

// POST - Crear nueva interacción
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    if (agencyIds.length === 0) {
      return NextResponse.json(
        { error: "No tiene agencias asignadas" },
        { status: 403 }
      )
    }

    // Verificar que el cliente existe y pertenece a las agencias
    const { data: customer, error: customerError } = await (supabase.from("customers") as any)
      .select("id, agency_id")
      .eq("id", customerId)
      .in("agency_id", agencyIds)
      .single()

    if (customerError || !customer) {
      return NextResponse.json(
        { error: "Cliente no encontrado" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const validatedData = createInteractionSchema.parse(body)

    // Crear interacción
    const { data: interaction, error } = await (supabase.from("customer_interactions") as any)
      .insert({
        agency_id: customer.agency_id,
        customer_id: customerId,
        ...validatedData,
        created_by: user.id,
      })
      .select(`*`)
      .single()

    if (error) {
      console.error("Error creating interaction:", error)
      return NextResponse.json(
        { error: "Error al crear interacción" },
        { status: 500 }
      )
    }

    return NextResponse.json({ interaction })
  } catch (error: any) {
    console.error("Error in POST /api/customers/[id]/interactions:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al crear interacción" },
      { status: 500 }
    )
  }
}
