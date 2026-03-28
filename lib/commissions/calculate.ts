import { createServerClient } from "@/lib/supabase/server"

/**
 * Porcentajes de comisión por vendedor (seller_id → percentage)
 * Estos son los porcentajes definidos por la empresa para cada vendedor.
 */
const SELLER_COMMISSION_PERCENTAGES: Record<string, number> = {
  "e86b35c1-f10c-4524-8f28-4a61ef6a3f20": 50,  // Maximiliano Di Franco
  "84c54c89-e6c3-4bac-80ac-9e2186eb3aaf": 35,  // Santiago Nader
  "eca8bd76-50af-46f2-9d20-148e620a8f23": 45,  // Ramiro Airaldi
  "a7fb94f9-1ef6-4749-b6eb-ac17b7f08a05": 35,  // Micaela Nader
  "888c7097-512d-47f3-96e8-25074de4179d": 20,  // Josefina Giordano
  "c9d53499-e9bc-4f11-97b6-1eaf3f049723": 15,  // Candela Bertolotto
  "0f843ee8-2890-48ee-a51b-6d3511b980cc": 15,  // Emilia Roca
  "d7b3e47e-1de9-456f-8d7d-6f26555a5a59": 13,  // Emilia Di Vito
  "92455378-c875-4a37-8ed1-617e91cf90e0": 13,  // Malena Rodriguez
  "b9496cdb-7d18-473c-b9d8-2dafcc7e7912": 20,  // Yamil Isnaldo
  "3591726c-2891-49f4-94f4-27f15d584b16": 10,  // Martina Schiriatti
  "8ff855bb-d531-4ed5-a0bf-2888cc97f79f": 50,  // Julieta Suarez
  "c6cc61f6-0954-4a26-b72b-40c1f0f5566f": 20,  // Naza
}

interface Operation {
  id: string
  agency_id: string
  seller_id: string // mapped from seller_primary_id
  seller_secondary_id?: string | null
  commission_split?: number | null
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
 * Primero busca en el mapa hardcodeado, luego en commission_rules como fallback.
 */
async function getSellerPercentage(sellerId: string): Promise<number> {
  // 1. Buscar en el mapa de porcentajes por vendedor
  if (SELLER_COMMISSION_PERCENTAGES[sellerId] !== undefined) {
    return SELLER_COMMISSION_PERCENTAGES[sellerId]
  }

  // 2. Fallback: buscar en commission_rules (regla genérica)
  try {
    const supabase = await createServerClient()
    const today = new Date().toISOString().split("T")[0]

    const { data: rules } = await supabase
      .from("commission_rules")
      .select("*")
      .eq("type", "SELLER")
      .lte("valid_from", today)
      .or(`valid_to.is.null,valid_to.gte.${today}`)
      .is("destination_region", null)
      .order("valid_from", { ascending: false })
      .limit(1)

    if (rules && rules.length > 0) {
      return Number(rules[0].value) || 0
    }
  } catch (err) {
    console.error("[Commissions] Error fetching commission rules:", err)
  }

  // 3. Sin regla → 0%
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
  const percentage = await getSellerPercentage(operation.seller_id)

  if (percentage <= 0) {
    return {
      totalCommission: 0,
      percentage: 0,
      primaryCommission: 0,
      secondaryCommission: null,
    }
  }

  // Calcular comisión: margen × porcentaje / 100
  let totalCommission = (operation.margin_amount * percentage) / 100
  totalCommission = Math.round(totalCommission * 100) / 100

  // Si hay seller_secondary, dividir según commission_split (50/50 por defecto)
  const hasSecondary = !!operation.seller_secondary_id
  const splitPrimary = (operation.commission_split ?? 50) / 100
  const splitSecondary = 1 - splitPrimary
  const primaryCommission = hasSecondary
    ? Math.round(totalCommission * splitPrimary * 100) / 100
    : totalCommission
  const secondaryCommission = hasSecondary
    ? Math.round(totalCommission * splitSecondary * 100) / 100
    : null

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
