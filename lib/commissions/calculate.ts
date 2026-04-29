import { createServerClient } from "@/lib/supabase/server"

interface Operation {
  id: string
  agency_id: string
  seller_id: string // mapped from seller_primary_id
  seller_secondary_id?: string | null
  commission_split?: number | null
  // Override absoluto del % de comisión por vendedor en la operación.
  // Cuando ambos están seteados (operaciones nuevas creadas con la UI
  // post-29/04), se usan directamente y la suma se valida ≤ principal pct.
  // Cuando son NULL (legacy), se cae al path basado en commission_split.
  commission_pct_primary?: number | null
  commission_pct_secondary?: number | null
  destination: string
  status: string
  sale_amount_total: number
  operator_cost: number
  margin_amount: number
  margin_percentage: number
  currency: string
  sale_currency?: string
  departure_date: string
}

/**
 * Obtiene el porcentaje de comisión para un vendedor.
 * Prioridad (2026-04-20):
 *   1. commission_rules con seller_id específico — override avanzado por
 *      destino, fechas, etc.
 *   2. users.default_commission_percentage — canónico: es el % que se setea
 *      al crear/editar el vendedor en Settings → Usuarios. Workflow que pidió
 *      el owner: creás user con rol vendedor, ponés su %, listo.
 *   3. commission_rules genérica (sin seller_id) — default del tenant.
 *   4. 0% con warning.
 */
export async function getSellerPercentage(sellerId: string): Promise<number> {
  try {
    const supabase = await createServerClient()
    const today = new Date().toISOString().split("T")[0]

    // 1. Regla específica override en commission_rules.
    const { data: sellerRules } = await (supabase
      .from("commission_rules") as any)
      .select("*")
      .eq("type", "SELLER")
      .eq("seller_id", sellerId)
      .lte("valid_from", today)
      .or(`valid_to.is.null,valid_to.gte.${today}`)
      .order("valid_from", { ascending: false })
      .limit(1)

    if (sellerRules && sellerRules.length > 0) {
      return Number((sellerRules as any[])[0].value) || 0
    }

    // 2. users.default_commission_percentage — fuente canónica.
    const { data: userRow } = await (supabase
      .from("users") as any)
      .select("default_commission_percentage")
      .eq("id", sellerId)
      .maybeSingle()
    const userPct = (userRow as any)?.default_commission_percentage
    if (userPct != null) {
      return Number(userPct) || 0
    }

    // 3. Fallback opcional: regla genérica de la org.
    const { data: genericRules } = await (supabase
      .from("commission_rules") as any)
      .select("*")
      .eq("type", "SELLER")
      .is("seller_id", null)
      .lte("valid_from", today)
      .or(`valid_to.is.null,valid_to.gte.${today}`)
      .is("destination_region", null)
      .order("valid_from", { ascending: false })
      .limit(1)

    if (genericRules && genericRules.length > 0) {
      return Number((genericRules as any[])[0].value) || 0
    }
  } catch (err) {
    console.error("[Commissions] Error fetching commission rules:", err)
  }

  console.warn(
    `[Commissions] No commission rule found for seller ${sellerId}. Configure one in Settings → Usuarios (default_commission_percentage).`
  )
  return 0
}

/**
 * Calcula la comisión para una operación basándose en el porcentaje del vendedor.
 * Se calcula siempre que la operación tenga margen positivo y vendedor asignado.
 */
export async function calculateCommission(operation: Operation): Promise<{
  totalCommission: number
  percentage: number
  primaryCommission: number
  secondaryCommission: number | null
}> {
  // Si no hay vendedor o margen es 0/negativo, no hay comisión
  if (!operation.seller_id || operation.margin_amount <= 0) {
    return {
      totalCommission: 0,
      percentage: 0,
      primaryCommission: 0,
      secondaryCommission: null,
    }
  }

  // Obtener porcentaje del vendedor principal
  const primaryPercentage = await getSellerPercentage(operation.seller_id)

  const hasSecondary = !!operation.seller_secondary_id

  if (hasSecondary) {
    let effectivePrimaryPct: number
    let effectiveSecondaryPct: number

    const hasOverrides =
      operation.commission_pct_primary != null &&
      operation.commission_pct_secondary != null

    if (hasOverrides) {
      // Path nuevo (post-29/04): valores absolutos editados por ADMIN.
      // La validación de la API garantiza que la suma ≤ principal pct.
      effectivePrimaryPct = Number(operation.commission_pct_primary) || 0
      effectiveSecondaryPct = Number(operation.commission_pct_secondary) || 0
    } else {
      // Path legacy: commission_split (0-100) interpretado como fracción
      // del pct de CADA vendedor. Tiene un bug histórico cuando los pcts
      // difieren (la suma puede exceder lo que el principal habría
      // cobrado solo), pero se preserva tal cual: Tomi pidió que solo
      // las operaciones nuevas usen la lógica corregida. Las legacy
      // siguen así hasta que un admin las edite con la UI nueva.
      const splitFactor = (operation.commission_split ?? 50) / 100
      effectivePrimaryPct = primaryPercentage * splitFactor

      const secondaryPercentage = await getSellerPercentage(operation.seller_secondary_id!)
      effectiveSecondaryPct = secondaryPercentage * splitFactor
    }

    const primaryCommission = Math.round((operation.margin_amount * effectivePrimaryPct) / 100 * 100) / 100
    const secondaryCommission = Math.round((operation.margin_amount * effectiveSecondaryPct) / 100 * 100) / 100
    const totalCommission = Math.round((primaryCommission + secondaryCommission) * 100) / 100

    return {
      totalCommission,
      // `percentage` queda como el pct del principal (referencia, no del cálculo).
      percentage: Math.round(primaryPercentage * 100) / 100,
      primaryCommission,
      secondaryCommission,
    }
  }

  // Sin vendedor secundario: comisión completa para el primario
  if (primaryPercentage <= 0) {
    return {
      totalCommission: 0,
      percentage: 0,
      primaryCommission: 0,
      secondaryCommission: null,
    }
  }

  const totalCommission = Math.round((operation.margin_amount * primaryPercentage) / 100 * 100) / 100

  return {
    totalCommission,
    percentage: Math.round(primaryPercentage * 100) / 100,
    primaryCommission: totalCommission,
    secondaryCommission: null,
  }
}

/**
 * Crea o actualiza los registros de comisión para una operación
 * Si hay seller_secondary, crea dos registros (uno para cada vendedor)
 */
export async function createOrUpdateCommissionRecords(
  operation: Operation,
  commissionData: {
    totalCommission: number
    percentage: number
    primaryCommission: number
    secondaryCommission: number | null
  },
): Promise<{ primaryId: string | null; secondaryId: string | null }> {
  const supabase = await createServerClient()

  if (commissionData.totalCommission <= 0) {
    return { primaryId: null, secondaryId: null }
  }

  const records: { primaryId: string | null; secondaryId: string | null } = {
    primaryId: null,
    secondaryId: null,
  }

  // Crear/actualizar registro para seller_primary
  const { data: existingPrimary } = await (supabase.from("commission_records") as any)
    .select("id")
    .eq("operation_id", operation.id)
    .eq("seller_id", operation.seller_id)
    .maybeSingle()

  const primaryData = {
    operation_id: operation.id,
    seller_id: operation.seller_id,
    agency_id: operation.agency_id,
    amount: commissionData.primaryCommission,
    percentage: commissionData.percentage,
    status: "PENDING" as const,
    date_calculated: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (existingPrimary) {
    const { data, error } = await (supabase.from("commission_records") as any)
      .update(primaryData)
      .eq("id", existingPrimary.id)
      .select("id")
      .single()

    if (error) {
      console.error("Error updating primary commission record:", error)
    } else {
      records.primaryId = data.id
    }
  } else {
    const { data, error } = await (supabase.from("commission_records") as any)
      .insert(primaryData)
      .select("id")
      .single()

    if (error) {
      console.error("Error creating primary commission record:", error)
    } else {
      records.primaryId = data.id
    }
  }

  // Si hay seller_secondary, crear/actualizar registro para él
  if (operation.seller_secondary_id && commissionData.secondaryCommission) {
    // Para secondary seller, calcular su propio porcentaje
    const secondaryPercentage = await getSellerPercentage(operation.seller_secondary_id)

    const { data: existingSecondary } = await (supabase.from("commission_records") as any)
      .select("id")
      .eq("operation_id", operation.id)
      .eq("seller_id", operation.seller_secondary_id)
      .maybeSingle()

    const secondaryData = {
      operation_id: operation.id,
      seller_id: operation.seller_secondary_id,
      agency_id: operation.agency_id,
      amount: commissionData.secondaryCommission,
      percentage: secondaryPercentage,
      status: "PENDING" as const,
      date_calculated: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (existingSecondary) {
      const { data, error } = await (supabase.from("commission_records") as any)
        .update(secondaryData)
        .eq("id", existingSecondary.id)
        .select("id")
        .single()

      if (error) {
        console.error("Error updating secondary commission record:", error)
      } else {
        records.secondaryId = data.id
      }
    } else {
      const { data, error } = await (supabase.from("commission_records") as any)
        .insert(secondaryData)
        .select("id")
        .single()

      if (error) {
        console.error("Error creating secondary commission record:", error)
      } else {
        records.secondaryId = data.id
      }
    }
  }

  return records
}

/**
 * Procesa operaciones para calcular y crear comisiones.
 * Se ejecuta para cualquier operación con vendedor y margen positivo.
 */
export async function processCommissionsForOperations(operationIds?: string[]): Promise<void> {
  const supabase = await createServerClient()

  let operationsQuery = (supabase.from("operations") as any).select("*")

  if (operationIds && operationIds.length > 0) {
    operationsQuery = operationsQuery.in("id", operationIds)
  }

  const { data: operations, error } = await operationsQuery

  if (error) {
    console.error("Error fetching operations for commission processing:", error)
    return
  }

  for (const rawOp of (operations || []) as any[]) {
    // Map DB column names to interface (seller_primary_id → seller_id)
    const operation: Operation = {
      ...rawOp,
      seller_id: rawOp.seller_primary_id || rawOp.seller_id,
      seller_secondary_id: rawOp.seller_secondary_id || null,
      sale_amount_total: Number(rawOp.sale_amount_total) || 0,
      operator_cost: Number(rawOp.operator_cost) || 0,
      margin_amount: Number(rawOp.margin_amount) || 0,
      margin_percentage: Number(rawOp.margin_percentage) || 0,
    }

    // Recalculate margin from actual values in case it's stale
    const recalculatedMargin = operation.sale_amount_total - operation.operator_cost
    if (Math.abs(recalculatedMargin - operation.margin_amount) > 1) {
      console.log(`[Commissions] Margin mismatch for ${operation.id}: stored=${operation.margin_amount}, recalculated=${recalculatedMargin}. Using recalculated.`)
      operation.margin_amount = recalculatedMargin
    }

    const commissionData = await calculateCommission(operation)
    if (commissionData.totalCommission > 0) {
      await createOrUpdateCommissionRecords(operation, commissionData)
    }
  }
}
