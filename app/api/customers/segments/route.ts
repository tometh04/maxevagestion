import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación para reglas
const ruleSchema = z.object({
  field: z.string(),
  operator: z.enum(['=', '!=', '>', '<', '>=', '<=', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_null', 'is_not_null']),
  value: z.any(),
})

// Schema de validación para crear segmento
const createSegmentSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  color: z.string().optional().default('#6366f1'),
  icon: z.string().optional().default('users'),
  segment_type: z.enum(['manual', 'automatic', 'hybrid']).default('manual'),
  rules: z.array(ruleSchema).optional().default([]),
  rules_logic: z.enum(['AND', 'OR']).optional().default('AND'),
  auto_update: z.boolean().optional().default(true),
  priority: z.number().optional().default(0),
})

// GET - Obtener segmentos
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Query
    const { data: segments, error } = await (supabase.from("customer_segments") as any)
      .select(`
        *,
        created_by_user:users!customer_segments_created_by_fkey (id, first_name, last_name)
      `)
      .in("agency_id", agencyIds)
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .order("name", { ascending: true })

    if (error) {
      console.error("Error fetching segments:", error)
      return NextResponse.json(
        { error: "Error al obtener segmentos" },
        { status: 500 }
      )
    }

    // Obtener conteo de clientes por segmento
    const segmentIds = segments.map((s: any) => s.id)
    const { data: memberCounts } = await (supabase.from("customer_segment_members") as any)
      .select("segment_id")
      .in("segment_id", segmentIds)
      .neq("membership_type", "excluded")

    const countBySegment: Record<string, number> = {}
    ;(memberCounts || []).forEach((m: any) => {
      countBySegment[m.segment_id] = (countBySegment[m.segment_id] || 0) + 1
    })

    const segmentsWithCount = segments.map((s: any) => ({
      ...s,
      customer_count: countBySegment[s.id] || 0,
    }))

    return NextResponse.json({ segments: segmentsWithCount })
  } catch (error: any) {
    console.error("Error in GET /api/customers/segments:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener segmentos" },
      { status: 500 }
    )
  }
}

// POST - Crear segmento
export async function POST(request: Request) {
  try {
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

    const body = await request.json()
    const validatedData = createSegmentSchema.parse(body)

    // Crear segmento
    const { data: segment, error } = await (supabase.from("customer_segments") as any)
      .insert({
        agency_id: agencyIds[0],
        ...validatedData,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating segment:", error)
      return NextResponse.json(
        { error: "Error al crear segmento" },
        { status: 500 }
      )
    }

    // Si es automático, calcular membresía inicial
    if (validatedData.segment_type === 'automatic' && validatedData.rules.length > 0) {
      await calculateSegmentMembers(supabase, segment.id, agencyIds[0], validatedData.rules, validatedData.rules_logic)
    }

    return NextResponse.json({ segment })
  } catch (error: any) {
    console.error("Error in POST /api/customers/segments:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al crear segmento" },
      { status: 500 }
    )
  }
}

// Función auxiliar para calcular membresía de segmento automático
async function calculateSegmentMembers(
  supabase: any,
  segmentId: string,
  agencyId: string,
  rules: Array<{ field: string; operator: string; value: any }>,
  logic: string
) {
  try {
    // Obtener todos los clientes de la agencia
    const { data: customers } = await supabase
      .from("customers")
      .select("id, first_name, last_name, email, phone, created_at, total_spent, operations_count")
      .eq("agency_id", agencyId)

    if (!customers) return

    // Evaluar reglas para cada cliente
    const matchingCustomers: string[] = []

    for (const customer of customers) {
      const matches = rules.map(rule => evaluateRule(customer, rule))
      const isMatch = logic === 'AND' 
        ? matches.every(m => m) 
        : matches.some(m => m)

      if (isMatch) {
        matchingCustomers.push(customer.id)
      }
    }

    // Eliminar membresías automáticas existentes
    await supabase
      .from("customer_segment_members")
      .delete()
      .eq("segment_id", segmentId)
      .eq("membership_type", "automatic")

    // Insertar nuevas membresías
    if (matchingCustomers.length > 0) {
      const memberships = matchingCustomers.map(customerId => ({
        segment_id: segmentId,
        customer_id: customerId,
        membership_type: 'automatic',
      }))

      await supabase.from("customer_segment_members").insert(memberships)
    }

    // Actualizar estadísticas del segmento
    await supabase
      .from("customer_segments")
      .update({
        customer_count: matchingCustomers.length,
        last_calculated_at: new Date().toISOString(),
      })
      .eq("id", segmentId)

  } catch (error) {
    console.error("Error calculating segment members:", error)
  }
}

// Evaluar una regla contra un cliente
function evaluateRule(
  customer: Record<string, any>,
  rule: { field: string; operator: string; value: any }
): boolean {
  const fieldValue = customer[rule.field]
  const ruleValue = rule.value

  switch (rule.operator) {
    case '=':
      return fieldValue == ruleValue
    case '!=':
      return fieldValue != ruleValue
    case '>':
      return Number(fieldValue) > Number(ruleValue)
    case '<':
      return Number(fieldValue) < Number(ruleValue)
    case '>=':
      return Number(fieldValue) >= Number(ruleValue)
    case '<=':
      return Number(fieldValue) <= Number(ruleValue)
    case 'contains':
      return String(fieldValue || '').toLowerCase().includes(String(ruleValue).toLowerCase())
    case 'not_contains':
      return !String(fieldValue || '').toLowerCase().includes(String(ruleValue).toLowerCase())
    case 'starts_with':
      return String(fieldValue || '').toLowerCase().startsWith(String(ruleValue).toLowerCase())
    case 'ends_with':
      return String(fieldValue || '').toLowerCase().endsWith(String(ruleValue).toLowerCase())
    case 'is_null':
      return fieldValue == null || fieldValue === ''
    case 'is_not_null':
      return fieldValue != null && fieldValue !== ''
    default:
      return false
  }
}
