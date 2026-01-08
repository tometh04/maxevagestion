import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación para configuración financiera
const financialSettingsSchema = z.object({
  primary_currency: z.enum(['ARS', 'USD']).optional(),
  enabled_currencies: z.array(z.string()).optional(),
  exchange_rate_config: z.record(z.any()).optional(),
  default_usd_rate: z.number().optional(),
  default_accounts: z.record(z.string()).optional(),
  auto_create_accounts: z.boolean().optional(),
  enabled_payment_methods: z.array(z.string()).optional(),
  default_commission_rules: z.record(z.any()).optional(),
  auto_calculate_commissions: z.boolean().optional(),
  auto_create_ledger_entries: z.boolean().optional(),
  auto_create_iva_entries: z.boolean().optional(),
  auto_create_operator_payments: z.boolean().optional(),
  default_income_chart_account_id: z.string().uuid().nullable().optional(),
  default_expense_chart_account_id: z.string().uuid().nullable().optional(),
  auto_generate_invoices: z.boolean().optional(),
  default_point_of_sale: z.number().optional(),
  monthly_close_day: z.number().min(1).max(31).optional(),
  auto_close_month: z.boolean().optional(),
})

// GET - Obtener configuración financiera
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permiso de acceso
    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json(
        { error: "No tiene permiso para ver la configuración financiera" },
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

    // Obtener configuración existente
    const { data: existing, error } = await supabase
      .from("financial_settings")
      .select("*")
      .eq("agency_id", agencyIds[0])
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      console.error("Error fetching financial settings:", error)
      return NextResponse.json(
        { error: "Error al obtener configuración" },
        { status: 500 }
      )
    }

    // Si no existe, crear configuración por defecto
    if (!existing) {
      const defaultSettings = {
        agency_id: agencyIds[0],
        primary_currency: 'ARS',
        enabled_currencies: ['ARS', 'USD'],
        exchange_rate_config: {
          source: 'manual',
          auto_update: false,
        },
        default_usd_rate: 1000.00,
        default_accounts: {},
        auto_create_accounts: false,
        enabled_payment_methods: ['CASH', 'BANK', 'MP'],
        default_commission_rules: {},
        auto_calculate_commissions: true,
        auto_create_ledger_entries: true,
        auto_create_iva_entries: true,
        auto_create_operator_payments: true,
        default_income_chart_account_id: null,
        default_expense_chart_account_id: null,
        auto_generate_invoices: false,
        default_point_of_sale: 1,
        monthly_close_day: 1,
        auto_close_month: false,
        created_by: user.id,
      }

      const { data: newData, error: insertError } = await (supabase.from("financial_settings") as any)
        .insert(defaultSettings)
        .select()
        .single()

      if (insertError) {
        console.error("Error creating default financial settings:", insertError)
        return NextResponse.json(
          { error: "Error al crear configuración por defecto" },
          { status: 500 }
        )
      }

      return NextResponse.json(newData)
    }

    return NextResponse.json(existing)
  } catch (error: any) {
    console.error("Error in GET /api/finances/settings:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener configuración" },
      { status: 500 }
    )
  }
}

// PUT - Actualizar configuración financiera
export async function PUT(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permiso de acceso (solo ADMIN y SUPER_ADMIN)
    if (!canAccessModule(user.role as any, "cash") || 
        (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json(
        { error: "No tiene permiso para editar la configuración financiera" },
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
    const validatedData = financialSettingsSchema.parse(body)

    // Verificar si existe configuración
    const { data: existing } = await supabase
      .from("financial_settings")
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
      const { data, error } = await (supabase.from("financial_settings") as any)
        .update(updateData)
        .eq("id", existingData.id)
        .select()
        .single()

      if (error) {
        console.error("Error updating financial settings:", error)
        return NextResponse.json(
          { error: "Error al actualizar configuración" },
          { status: 500 }
        )
      }

      result = data
    } else {
      // Crear nueva
      const { data, error } = await (supabase.from("financial_settings") as any)
        .insert({
          agency_id: agencyIds[0],
          ...updateData,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) {
        console.error("Error creating financial settings:", error)
        return NextResponse.json(
          { error: "Error al crear configuración" },
          { status: 500 }
        )
      }

      result = data
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error in PUT /api/finances/settings:", error)
    
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
