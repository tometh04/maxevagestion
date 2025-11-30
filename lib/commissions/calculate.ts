import { createServerClient } from "@/lib/supabase/server"

interface CommissionRule {
  id: string
  type: "SELLER" | "AGENCY"
  basis: "FIXED_PERCENTAGE" | "FIXED_AMOUNT"
  value: number
  destination_region: string | null
  agency_id: string | null
  valid_from: string
  valid_to: string | null
}

interface Operation {
  id: string
  agency_id: string
  seller_id: string
  seller_secondary_id?: string | null
  destination: string
  status: string
  sale_amount_total: number
  operator_cost: number
  margin_amount: number
  margin_percentage: number
  currency: string
  departure_date: string
}

/**
 * Calcula la comisión para una operación basándose en las reglas activas
 * Retorna: { totalCommission: number, percentage: number, primaryCommission: number, secondaryCommission: number | null }
 */
export async function calculateCommission(operation: Operation): Promise<{
  totalCommission: number
  percentage: number
  primaryCommission: number
  secondaryCommission: number | null
}> {
  const supabase = await createServerClient()

  // Solo calcular comisiones para operaciones CONFIRMED
  if (operation.status !== "CONFIRMED") {
    return {
      totalCommission: 0,
      percentage: 0,
      primaryCommission: 0,
      secondaryCommission: null,
    }
  }

  // Verificar que la operación esté pagada (todos los pagos de cliente deben estar PAID)
  const { data: customerPayments } = await supabase
    .from("payments")
    .select("status")
    .eq("operation_id", operation.id)
    .eq("direction", "INCOME")
    .eq("payer_type", "CUSTOMER")

  const allPaid = customerPayments?.every((p: any) => p.status === "PAID") && (customerPayments?.length || 0) > 0

  if (!allPaid) {
    return {
      totalCommission: 0,
      percentage: 0,
      primaryCommission: 0,
      secondaryCommission: null,
    }
  }

  // Obtener reglas de comisión activas
  const today = new Date().toISOString().split("T")[0]

  let rulesQuery = supabase
    .from("commission_rules")
    .select("*")
    .eq("type", "SELLER")
    .lte("valid_from", today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)

  // Filtrar por región si aplica
  const { data: regionRules } = await rulesQuery
    .eq("destination_region", operation.destination)
    .order("valid_from", { ascending: false })

  // Si no hay regla específica para la región, buscar regla general
  let applicableRule: CommissionRule | null = null

  if (regionRules && regionRules.length > 0) {
    applicableRule = regionRules[0] as CommissionRule
  } else {
    const { data: generalRules } = await rulesQuery
      .is("destination_region", null)
      .order("valid_from", { ascending: false })
      .limit(1)

    if (generalRules && generalRules.length > 0) {
      applicableRule = generalRules[0] as CommissionRule
    }
  }

  if (!applicableRule) {
    // Si no hay regla, usar margen como base (0% de comisión)
    return {
      totalCommission: 0,
      percentage: 0,
      primaryCommission: 0,
      secondaryCommission: null,
    }
  }

  // Calcular comisión según el tipo de regla
  let totalCommission = 0
  let percentage = 0

  if (applicableRule.basis === "FIXED_PERCENTAGE") {
    // Porcentaje del margen
    percentage = applicableRule.value
    totalCommission = (operation.margin_amount * applicableRule.value) / 100
  } else if (applicableRule.basis === "FIXED_AMOUNT") {
    // Monto fijo - calcular porcentaje equivalente
    totalCommission = applicableRule.value
    percentage = operation.margin_amount > 0 ? (totalCommission / operation.margin_amount) * 100 : 0
  }

  totalCommission = Math.round(totalCommission * 100) / 100 // Redondear a 2 decimales

  // Si hay seller_secondary, dividir la comisión (50/50 por defecto, se puede configurar)
  const hasSecondary = !!operation.seller_secondary_id
  const primaryCommission = hasSecondary ? Math.round((totalCommission * 0.5) * 100) / 100 : totalCommission
  const secondaryCommission = hasSecondary ? Math.round((totalCommission * 0.5) * 100) / 100 : null

  return {
    totalCommission,
    percentage: Math.round(percentage * 100) / 100,
    primaryCommission,
    secondaryCommission,
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
      percentage: commissionData.percentage,
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
 * Procesa todas las operaciones CONFIRMED y pagadas para calcular comisiones
 */
export async function processCommissionsForOperations(operationIds?: string[]): Promise<void> {
  const supabase = await createServerClient()

  let operationsQuery = supabase
    .from("operations")
    .select("*")
    .eq("status", "CONFIRMED")

  if (operationIds && operationIds.length > 0) {
    operationsQuery = operationsQuery.in("id", operationIds)
  }

  const { data: operations, error } = await operationsQuery

  if (error) {
    console.error("Error fetching operations for commission processing:", error)
    return
  }

  for (const operation of (operations || []) as Operation[]) {
    const commissionData = await calculateCommission(operation)
    if (commissionData.totalCommission > 0) {
      await createOrUpdateCommissionRecords(operation, commissionData)
    }
  }
}

