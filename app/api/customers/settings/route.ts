import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación para customer_settings
const customerSettingsSchema = z.object({
  custom_fields: z.array(z.object({
    name: z.string(),
    type: z.enum(['text', 'number', 'date', 'email', 'phone', 'select', 'textarea']),
    label: z.string(),
    required: z.boolean().default(false),
    options: z.array(z.string()).optional(), // Para tipo 'select'
    default_value: z.string().optional(),
  })).optional(),
  validations: z.object({
    email: z.object({
      required: z.boolean().optional(),
      format: z.enum(['email']).optional(),
    }).optional(),
    phone: z.object({
      required: z.boolean().optional(),
      format: z.enum(['phone']).optional(),
    }).optional(),
  }).optional(),
  notifications: z.array(z.object({
    event: z.enum(['new_customer', 'customer_updated', 'customer_deleted', 'customer_operation_created']),
    enabled: z.boolean(),
    channels: z.array(z.enum(['email', 'whatsapp', 'system'])),
  })).optional(),
  integrations: z.object({
    operations: z.object({
      auto_link: z.boolean().optional(),
    }).optional(),
    leads: z.object({
      auto_convert: z.boolean().optional(),
    }).optional(),
  }).optional(),
  auto_assign_lead: z.boolean().optional(),
  require_document: z.boolean().optional(),
  duplicate_check_enabled: z.boolean().optional(),
  duplicate_check_fields: z.array(z.string()).optional(),
})

// GET - Obtener configuración de clientes
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permiso de acceso
    if (!canAccessModule(user.role as any, "customers")) {
      return NextResponse.json(
        { error: "No tiene permiso para ver la configuración de clientes" },
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

    // Obtener configuración (usar la primera agencia si hay múltiples)
    const { data, error } = await supabase
      .from("customer_settings")
      .select("*")
      .eq("agency_id", agencyIds[0])
      .single()

    if (error) {
      // Si no existe, crear una configuración por defecto
      if (error.code === 'PGRST116') {
        const defaultSettings = {
          agency_id: agencyIds[0],
          custom_fields: [],
          validations: {
            email: { required: true, format: 'email' },
            phone: { required: true, format: 'phone' },
          },
          notifications: [],
          integrations: {
            operations: { auto_link: true },
            leads: { auto_convert: false },
          },
          auto_assign_lead: false,
          require_document: false,
          duplicate_check_enabled: true,
          duplicate_check_fields: ['email', 'phone'],
          created_by: user.id,
        }

        const { data: newData, error: insertError } = await (supabase.from("customer_settings") as any)
          .insert(defaultSettings)
          .select()
          .single()

        if (insertError) {
          console.error("Error creating default customer settings:", insertError)
          return NextResponse.json(
            { error: "Error al crear configuración por defecto" },
            { status: 500 }
          )
        }

        return NextResponse.json(newData)
      }

      console.error("Error fetching customer settings:", error)
      return NextResponse.json(
        { error: "Error al obtener configuración" },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error("Error in GET /api/customers/settings:", error)
    return NextResponse.json(
      { error: error.message || "Error interno del servidor" },
      { status: 500 }
    )
  }
}

// PUT - Actualizar configuración de clientes
export async function PUT(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permiso de acceso (solo ADMIN y SUPER_ADMIN)
    if (!canAccessModule(user.role as any, "customers") || 
        (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json(
        { error: "No tiene permiso para editar la configuración de clientes" },
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
    const validatedData = customerSettingsSchema.parse(body)

    // Verificar si existe configuración
    const { data: existing } = await supabase
      .from("customer_settings")
      .select("id")
      .eq("agency_id", agencyIds[0])
      .single()

    const updateData = {
      ...validatedData,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }

    let result

    if (existing) {
      // Actualizar existente
      const existingData = existing as any
      const { data, error } = await (supabase.from("customer_settings") as any)
        .update(updateData)
        .eq("id", existingData.id)
        .select()
        .single()

      if (error) {
        console.error("Error updating customer settings:", error)
        return NextResponse.json(
          { error: "Error al actualizar configuración" },
          { status: 500 }
        )
      }

      result = data
    } else {
      // Crear nueva
      const { data, error } = await (supabase.from("customer_settings") as any)
        .insert({
          agency_id: agencyIds[0],
          ...updateData,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) {
        console.error("Error creating customer settings:", error)
        return NextResponse.json(
          { error: "Error al crear configuración" },
          { status: 500 }
        )
      }

      result = data
    }

    return NextResponse.json(result)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Error in PUT /api/customers/settings:", error)
    return NextResponse.json(
      { error: error.message || "Error interno del servidor" },
      { status: 500 }
    )
  }
}

