import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación para configuración de operaciones
const operationSettingsSchema = z.object({
  custom_statuses: z.array(z.object({
    value: z.string(),
    label: z.string(),
    color: z.string(),
    order: z.number().optional(),
  })).optional(),
  workflows: z.record(z.any()).optional(),
  auto_alerts: z.array(z.object({
    type: z.string(),
    enabled: z.boolean(),
    days_before: z.number().optional(),
    channels: z.array(z.string()).optional(),
  })).optional(),
  document_templates: z.array(z.any()).optional(),
  custom_product_types: z.array(z.object({
    value: z.string(),
    label: z.string(),
  })).optional(),
  custom_operation_types: z.array(z.object({
    value: z.string(),
    label: z.string(),
  })).optional(),
  default_status: z.string().optional(),
  require_destination: z.boolean().optional(),
  require_departure_date: z.boolean().optional(),
  require_operator: z.boolean().optional(),
  require_customer: z.boolean().optional(),
  alert_payment_due_days: z.number().optional(),
  alert_operator_payment_days: z.number().optional(),
  alert_upcoming_trip_days: z.number().optional(),
  checkin_enabled: z.boolean().optional(),
  checkin_default_hours: z.number().int().positive().max(168).optional(),
  checkin_airline_lead_times: z.array(z.object({
    airline: z.string().min(1),
    hours: z.number().int().positive().max(168),
  })).optional(),
  auto_generate_quotation: z.boolean().optional(),
  auto_generate_invoice: z.boolean().optional(),
  require_documents_before_confirmation: z.boolean().optional(),
  auto_create_ledger_entry: z.boolean().optional(),
  auto_create_iva_entry: z.boolean().optional(),
  auto_create_operator_payment: z.boolean().optional(),
})

// GET - Obtener configuración de operaciones
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permiso de acceso
    if (!canAccessModule(user.role as any, "operations")) {
      return NextResponse.json(
        { error: "No tiene permiso para ver la configuración de operaciones" },
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

    // P0 2026-05-11: derivar org_id desde la agencia para satisfacer RLS
    // tenant_isolation (mig 136). Sin esto, INSERT a operation_settings falla
    // con WITH CHECK violation para tenants nuevos.
    const { data: agencyRow } = await supabase
      .from("agencies")
      .select("org_id")
      .eq("id", agencyIds[0])
      .maybeSingle()
    const orgId = (agencyRow as any)?.org_id as string | null | undefined

    // Obtener configuración existente
    const { data: existing, error } = await supabase
      .from("operation_settings")
      .select("*")
      .eq("agency_id", agencyIds[0])
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      console.error("Error fetching operation settings:", error)
      return NextResponse.json(
        { error: "Error al obtener configuración" },
        { status: 500 }
      )
    }

    // Si no existe, crear configuración por defecto
    if (!existing) {
      const defaultSettings = {
        agency_id: agencyIds[0],
        org_id: orgId ?? null,
        custom_statuses: [],
        workflows: {},
        auto_alerts: [
          {
            type: "payment_due",
            enabled: true,
            days_before: 30,
            channels: ["email", "whatsapp"],
          },
          {
            type: "operator_payment",
            enabled: true,
            days_before: 30,
            channels: ["email"],
          },
          {
            type: "upcoming_trip",
            enabled: true,
            days_before: 7,
            channels: ["email", "whatsapp"],
          },
        ],
        document_templates: [],
        default_status: "RESERVED",
        require_destination: true,
        require_departure_date: true,
        require_operator: false,
        require_customer: false,
        alert_payment_due_days: 30,
        alert_operator_payment_days: 30,
        alert_upcoming_trip_days: 7,
        checkin_enabled: true,
        checkin_default_hours: 48,
        checkin_airline_lead_times: [],
        auto_generate_quotation: false,
        auto_generate_invoice: false,
        require_documents_before_confirmation: false,
        auto_create_ledger_entry: true,
        auto_create_iva_entry: true,
        auto_create_operator_payment: true,
        created_by: user.id,
      }

      const { data: newData, error: insertError } = await (supabase.from("operation_settings") as any)
        .insert(defaultSettings)
        .select()
        .single()

      if (insertError) {
        console.error("Error creating default operation settings:", insertError)
        return NextResponse.json(
          { error: "Error al crear configuración por defecto", detail: insertError.message, code: insertError.code },
          { status: 500 }
        )
      }

      return NextResponse.json(newData)
    }

    return NextResponse.json(existing)
  } catch (error: any) {
    console.error("Error in GET /api/operations/settings:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener configuración" },
      { status: 500 }
    )
  }
}

// PUT - Actualizar configuración de operaciones
export async function PUT(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permiso de acceso (solo ADMIN y SUPER_ADMIN)
    if (!canAccessModule(user.role as any, "operations") || 
        (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json(
        { error: "No tiene permiso para editar la configuración de operaciones" },
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
    
    // Validar datos
    const validatedData = operationSettingsSchema.parse(body)

    // Verificar si existe configuración
    const { data: existing } = await supabase
      .from("operation_settings")
      .select("id")
      .eq("agency_id", agencyIds[0])
      .single()

    // Asegurar que los valores de integración contable siempre estén en true
    const updateData = {
      ...validatedData,
      auto_create_ledger_entry: true,
      auto_create_iva_entry: true,
      auto_create_operator_payment: true,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }

    let result

    if (existing) {
      // Actualizar existente
      const existingData = existing as any
      const { data, error } = await (supabase.from("operation_settings") as any)
        .update(updateData)
        .eq("id", existingData.id)
        .select()
        .single()

      if (error) {
        console.error("Error updating operation settings:", error)
        return NextResponse.json(
          { error: "Error al actualizar configuración" },
          { status: 500 }
        )
      }

      result = data
    } else {
      // P0 2026-05-11: derivar org_id desde agencia para RLS tenant_isolation
      const { data: agencyRow } = await supabase
        .from("agencies")
        .select("org_id")
        .eq("id", agencyIds[0])
        .maybeSingle()
      const orgId = (agencyRow as any)?.org_id as string | null | undefined

      // Crear nueva
      const { data, error } = await (supabase.from("operation_settings") as any)
        .insert({
          agency_id: agencyIds[0],
          org_id: orgId ?? null,
          ...updateData,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) {
        console.error("Error creating operation settings:", error)
        return NextResponse.json(
          { error: "Error al crear configuración" },
          { status: 500 }
        )
      }

      result = data
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error in PUT /api/operations/settings:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al actualizar configuración" },
      { status: 500 }
    )
  }
}
