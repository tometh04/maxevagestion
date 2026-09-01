import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions, assertPermission } from "@/lib/permissions-agency"
import { z } from "zod"
import { DEFAULT_USD_ARS_FALLBACK_RATE } from "@/lib/accounting/exchange-rates"
import { ALL_SERVICE_TYPES } from "@/lib/commissions/service-commission"

export const dynamic = 'force-dynamic'

// Condición fiscal (tax_regime) - determina el tipo de facturación y tratamiento impositivo:
// RESPONSABLE_INSCRIPTO: Emite FA-A, discrimina IVA, retiene
// MONOTRIBUTISTA: Emite FA-C, no discrimina IVA
// EXENTO: Emite FA-C, no cobra IVA
// NO_RESPONSABLE: No responsable IVA
const taxRegimeEnum = z.enum([
  'RESPONSABLE_INSCRIPTO',
  'MONOTRIBUTISTA',
  'EXENTO',
  'NO_RESPONSABLE',
])

// Schema de validación para configuración financiera
const financialSettingsSchema = z.object({
  primary_currency: z.enum(['ARS', 'USD']).optional(),
  enabled_currencies: z.array(z.string()).optional(),
  exchange_rate_config: z.record(z.any()).optional(),
  /**
   * Desde cuándo esta agencia lleva su contabilidad en vibook (VIB-143).
   * Los estados formales toman datos a partir de acá; los asientos anteriores
   * se siguen viendo en el Mayor.
   */
  accounting_start_date: z.string().nullable().optional(),
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
  // Tax settings
  default_iva_rate: z.number().min(0).max(27).optional(),
  tax_regime: taxRegimeEnum.optional(),
  ganancias_rate: z.number().min(0).max(100).optional(),
  retention_ganancias_rate: z.number().min(0).max(100).optional(),
  retention_iva_rate: z.number().min(0).max(100).optional(),
  iibb_jurisdiction: z.string().optional(),
  iibb_rate: z.number().min(0).max(10).optional(),
  iibb_convenio_multilateral: z.boolean().optional(),
  iibb_jurisdictions: z.array(z.object({
    jurisdiction: z.string(),
    rate: z.number().min(0).max(100),
    coeficiente: z.number().min(0).max(1),
  })).optional(),
  // Master toggle para desactivar todas las retenciones/percepciones automáticas
  // (p.ej. agencias monotributistas o de prueba que no retienen).
  withholdings_enabled: z.boolean().optional(),
  // Modo de cálculo de costo de operadores para cotizaciones
  default_cost_calculation_mode: z.enum(['SIMPLE', 'COMMISSIONABLE']).optional(),
  default_commission_percentage: z.number().min(0).max(100).optional(),
  // Base de comisiones neta de IVA (VIB-95). Opt-in por agencia. La alícuota se
  // guarda como fracción (0.105 = 10,5%); commission_net_from es la fecha de corte
  // (solo operaciones con operation_date >= aplican base neta). NULL = todas.
  commission_base_net_of_iva: z.boolean().optional(),
  commission_iva_rate: z.number().min(0).max(0.999).optional(),
  commission_net_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)")
    .nullable()
    .optional(),
  // Qué tipos de servicio comisionan por defecto en esta oficina. Es sólo el
  // default del switch "Comisiona" de cada servicio, no una restricción: la
  // verdad de cada fila vive en `operation_services.generates_commission`.
  commission_service_types: z.array(z.enum(ALL_SERVICE_TYPES)).optional(),
  // Si el ajuste por liquidación de operador se reparte con el vendedor y el
  // referidor según el porcentaje de su comisión original (VIB-174). El ajuste
  // contable se registra siempre; esto decide a quién le toca la diferencia.
  operator_adjustment_split_with_seller: z.boolean().optional(),
})


/**
 * Qué oficina se está configurando.
 *
 * Hasta ahora los dos verbos pegaban siempre contra `agencyIds[0]`, así que una
 * agencia con dos oficinas sólo podía configurar la primera y la otra quedaba
 * con los defaults para siempre — sin ningún cartel que lo dijera. Con el
 * parámetro explícito, la pantalla puede elegir; sin él se conserva el
 * comportamiento de antes.
 *
 * `agencyId` NO es columna de `financial_settings`: se saca del body antes del
 * `parse` de Zod. Un campo de más en el payload de PostgREST rompe la escritura
 * entera con un 500 genérico.
 */
function resolveTargetAgency(
  requested: unknown,
  agencyIds: string[]
): { ok: true; agencyId: string } | { ok: false; status: number; error: string } {
  const wanted = typeof requested === "string" ? requested.trim() : ""
  if (!wanted) return { ok: true, agencyId: agencyIds[0] }
  if (!agencyIds.includes(wanted)) {
    return { ok: false, status: 403, error: "No tiene acceso a esa agencia" }
  }
  return { ok: true, agencyId: wanted }
}
// GET - Obtener configuración financiera
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Verificar permiso de acceso contra la matriz por org (agency_role_permissions).
    // Respeta los overrides configurados en Ajustes → Permisos; sin override usa el
    // default estático del rol (comportamiento previo intacto).
    const perms = await resolveUserPermissions(
      supabase,
      user.id,
      (user as any).org_id,
      (user as any).roles ?? user.role,
      agencyIds
    )
    if (!assertPermission(user.role, perms, "cash", "read")) {
      return NextResponse.json(
        { error: "No tiene permiso para ver la configuración financiera" },
        { status: 403 }
      )
    }

    if (agencyIds.length === 0) {
      return NextResponse.json(
        { error: "No tiene agencias asignadas" },
        { status: 403 }
      )
    }

    const target = resolveTargetAgency(
      new URL(request.url).searchParams.get("agencyId"),
      agencyIds
    )
    if (!target.ok) {
      return NextResponse.json({ error: target.error }, { status: target.status })
    }
    const targetAgencyId = target.agencyId

    // Obtener configuración existente
    const { data: existing, error } = await supabase
      .from("financial_settings")
      .select("*")
      .eq("agency_id", targetAgencyId)
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
        agency_id: targetAgencyId,
        primary_currency: 'USD',
        enabled_currencies: ['ARS', 'USD'],
        exchange_rate_config: {
          source: 'manual',
          auto_update: false,
        },
        default_usd_rate: DEFAULT_USD_ARS_FALLBACK_RATE,
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

    // Coerce legacy tax_regime values (Bug fix 2026-05-13 reportado por
    // Lozada Gualeguaychú): algunas rows tienen `tax_regime = 'TRAVEL_AGENCY'`
    // (valor legacy que ya no está en el enum del schema). Al hacer PUT,
    // Zod rechaza con "Datos inválidos". Coercemos a 'RESPONSABLE_INSCRIPTO'
    // (el régimen estándar para agencia de viajes AR) para que el dropdown
    // muestre un valor válido y el guardado funcione. El backfill SQL
    // 20260513000002 hace lo mismo en BD; este código es defense-in-depth.
    const VALID_TAX_REGIMES = ['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTISTA', 'EXENTO', 'NO_RESPONSABLE']
    const existingRow = existing as any
    if (existingRow && (!existingRow.tax_regime || !VALID_TAX_REGIMES.includes(existingRow.tax_regime))) {
      existingRow.tax_regime = 'RESPONSABLE_INSCRIPTO'
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

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Permiso de EDICIÓN resuelto contra la matriz por org (agency_role_permissions).
    // Por defecto edita quien tiene cash.write estático (ADMIN/SUPER_ADMIN/ORG_OWNER y
    // CONTABLE), pero cada org puede habilitar SELLER/VIEWER desde Ajustes → Permisos
    // sin tocar el rol global de otros tenants.
    const perms = await resolveUserPermissions(
      supabase,
      user.id,
      (user as any).org_id,
      (user as any).roles ?? user.role,
      agencyIds
    )
    if (!assertPermission(user.role, perms, "cash", "write")) {
      return NextResponse.json(
        { error: "No tiene permiso para editar la configuración financiera" },
        { status: 403 }
      )
    }
    
    if (agencyIds.length === 0) {
      return NextResponse.json(
        { error: "No tiene agencias asignadas" },
        { status: 403 }
      )
    }

    const { agencyId: requestedAgencyId, ...settingsBody } = await request.json()

    const target = resolveTargetAgency(requestedAgencyId, agencyIds)
    if (!target.ok) {
      return NextResponse.json({ error: target.error }, { status: target.status })
    }
    const targetAgencyId = target.agencyId

    // Validar datos
    const validatedData = financialSettingsSchema.parse(settingsBody)

    // Verificar si existe configuración
    const { data: existing } = await supabase
      .from("financial_settings")
      .select("id")
      .eq("agency_id", targetAgencyId)
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
          agency_id: targetAgencyId,
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
