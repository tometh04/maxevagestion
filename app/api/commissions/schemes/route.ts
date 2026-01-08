import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación
const createSchemeSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  commission_type: z.enum(['percentage', 'fixed', 'tiered', 'hybrid']),
  base_percentage: z.number().min(0).max(100).optional().default(0),
  base_amount: z.number().min(0).optional().default(0),
  applies_to: z.enum(['revenue', 'margin', 'net_margin']).default('revenue'),
  tiers: z.array(z.object({
    min: z.number(),
    max: z.number().nullable(),
    percentage: z.number(),
  })).optional().default([]),
  min_threshold: z.number().optional().default(0),
  max_cap: z.number().optional().nullable(),
  is_default: z.boolean().optional().default(false),
})

// GET - Obtener esquemas de comisión
export async function GET() {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Query - simplificada
    const { data: schemes, error } = await (supabase.from("commission_schemes") as any)
      .select(`*`)
      .in("agency_id", agencyIds)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true })

    if (error) {
      console.error("Error fetching schemes:", error)
      return NextResponse.json(
        { error: "Error al obtener esquemas" },
        { status: 500 }
      )
    }

    return NextResponse.json({ schemes })
  } catch (error: any) {
    console.error("Error in GET /api/commissions/schemes:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener esquemas" },
      { status: 500 }
    )
  }
}

// POST - Crear esquema de comisión
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "No tiene permiso para crear esquemas" },
        { status: 403 }
      )
    }

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    
    if (agencyIds.length === 0) {
      return NextResponse.json(
        { error: "No tiene agencias asignadas" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = createSchemeSchema.parse(body)

    // Si es default, quitar default de otros
    if (validatedData.is_default) {
      await (supabase.from("commission_schemes") as any)
        .update({ is_default: false })
        .eq("agency_id", agencyIds[0])
    }

    // Crear esquema
    const { data: scheme, error } = await (supabase.from("commission_schemes") as any)
      .insert({
        agency_id: agencyIds[0],
        ...validatedData,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating scheme:", error)
      return NextResponse.json(
        { error: "Error al crear esquema" },
        { status: 500 }
      )
    }

    return NextResponse.json({ scheme })
  } catch (error: any) {
    console.error("Error in POST /api/commissions/schemes:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al crear esquema" },
      { status: 500 }
    )
  }
}
