/**
 * Cálculo y persistencia de las comisiones de una operación (VIB-63).
 *
 * El módulo está partido en dos mitades a propósito:
 *
 *   `computeOperationCommission(op, profiles)` — puro, sin `await` y sin base.
 *      Decide cuánto le toca a cada vendedor.
 *   `applyCommissionPlan(supabase, op, plan)` — persiste ese plan.
 *
 * `recalculateOperationCommissions()` las encadena y es el punto de entrada que
 * usan las rutas.
 *
 * ── Qué cambió y por qué ───────────────────────────────────────────────────
 *
 * Antes, el porcentaje con el que se pagaba una venta compartida venía en el
 * body del request. Una regresión en la UI que lo mandaba en 0 alcanzó para
 * dejar decenas de ventas sin comisionar y nadie se enteró hasta que los
 * vendedores reclamaron. Ahora, con `commission_split_mode = 'AUTO'` (el
 * default), **el servidor ignora los porcentajes que mande el cliente** y los
 * deriva del perfil de cada vendedor; los `commission_pct_*` de la operación
 * pasan a ser un snapshot de salida. Solo en 'MANUAL' se respetan como entrada.
 *
 * También se eliminó el path legacy basado en `commission_split`, que
 * interpretaba ese número como fracción del porcentaje de cada vendedor y podía
 * hacer que la suma superara lo que el principal habría cobrado solo.
 */

import { logAudit } from "@/lib/audit"
import { roundMoney } from "@/lib/currency"
import { createServerClient } from "@/lib/supabase/server"
import {
  resolveSellerCommissionProfiles,
  type SellerCommissionProfile,
} from "@/lib/commissions/seller-commission-profile"
import {
  resolveSharedSplit,
  resolveSoloPercentage,
  type SharedSplitWarning,
} from "@/lib/commissions/shared-split"

export interface CommissionOperation {
  id: string
  org_id?: string | null
  agency_id?: string | null
  /** Vendedor principal (columna `seller_primary_id`, mapeada por el caller). */
  seller_id: string
  seller_secondary_id?: string | null
  /** Solo son entrada cuando `commission_split_mode === 'MANUAL'`. */
  commission_pct_primary?: number | null
  commission_pct_secondary?: number | null
  commission_split_mode?: string | null
  margin_amount: number
}

export type CommissionRule = "SOLO" | "HALF_HALF" | "ABSORB" | "SINGLE" | "MANUAL" | "NONE"

export interface CommissionEntry {
  sellerId: string
  role: "PRIMARY" | "SECONDARY"
  /** Porcentaje EFECTIVO sobre el margen: el que realmente se cobra. */
  percentage: number
  amount: number
}

export interface CommissionPlan {
  entries: CommissionEntry[]
  totalCommission: number
  rule: CommissionRule
  absorberId: string | null
  warnings: SharedSplitWarning[]
  /** Snapshot a persistir en `operations.commission_pct_*`. */
  pctPrimary: number | null
  pctSecondary: number | null
}

const EMPTY_PLAN: CommissionPlan = {
  entries: [],
  totalCommission: 0,
  rule: "NONE",
  absorberId: null,
  warnings: [],
  pctPrimary: null,
  pctSecondary: null,
}

function nonNegative(raw: unknown): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return 0
  return roundMoney(value, 2)
}

/**
 * Monto de comisión de un porcentaje efectivo. Con margen negativo o cero no hay
 * nada que repartir: el porcentaje se conserva (es lo que le correspondería) y
 * el monto va a 0, nunca en negativo.
 */
function amountFor(margin: number, percentage: number): number {
  if (margin <= 0 || percentage <= 0) return 0
  return roundMoney((margin * percentage) / 100, 2)
}

function participantOf(
  sellerId: string,
  profiles: Map<string, SellerCommissionProfile>
) {
  const profile = profiles.get(sellerId)
  return {
    sellerId,
    percentage: profile?.percentage ?? null,
    mode: profile?.mode ?? ("HALF" as const),
  }
}

/**
 * Núcleo puro: dado el estado de la operación y el perfil de sus vendedores,
 * decide el porcentaje efectivo y el monto de cada uno.
 */
export function computeOperationCommission(
  operation: CommissionOperation,
  profiles: Map<string, SellerCommissionProfile>
): CommissionPlan {
  const primaryId = operation.seller_id
  if (!primaryId) return EMPTY_PLAN

  const margin = Number(operation.margin_amount) || 0
  const secondaryId =
    operation.seller_secondary_id && operation.seller_secondary_id !== primaryId
      ? operation.seller_secondary_id
      : null
  const isManual = operation.commission_split_mode === "MANUAL"

  let rule: CommissionRule
  let absorberId: string | null = null
  let warnings: SharedSplitWarning[] = []
  const pctBySeller: Record<string, number> = {}

  if (secondaryId) {
    if (isManual) {
      rule = "MANUAL"
      pctBySeller[primaryId] = nonNegative(operation.commission_pct_primary)
      pctBySeller[secondaryId] = nonNegative(operation.commission_pct_secondary)
    } else {
      const split = resolveSharedSplit(
        participantOf(primaryId, profiles),
        participantOf(secondaryId, profiles)
      )
      rule = split.rule
      absorberId = split.absorberId
      warnings = split.warnings
      Object.assign(pctBySeller, split.bySellerId)
    }
  } else if (isManual) {
    rule = "MANUAL"
    pctBySeller[primaryId] = nonNegative(operation.commission_pct_primary)
  } else {
    rule = "SOLO"
    const percentage = profiles.get(primaryId)?.percentage ?? null
    pctBySeller[primaryId] = resolveSoloPercentage(percentage)
    if (percentage == null) {
      warnings = [{ code: "missing_percentage", sellerId: primaryId }]
    }
  }

  const entries: CommissionEntry[] = [
    { sellerId: primaryId, role: "PRIMARY" as const },
    ...(secondaryId ? [{ sellerId: secondaryId, role: "SECONDARY" as const }] : []),
  ].map(({ sellerId, role }) => {
    const percentage = roundMoney(pctBySeller[sellerId] ?? 0, 2)
    return { sellerId, role, percentage, amount: amountFor(margin, percentage) }
  })

  return {
    entries,
    totalCommission: roundMoney(
      entries.reduce((acc, e) => acc + e.amount, 0),
      2
    ),
    rule,
    absorberId,
    warnings,
    pctPrimary: entries[0]?.percentage ?? null,
    pctSecondary: secondaryId ? entries[1]?.percentage ?? null : null,
  }
}

export interface ApplyCommissionResult {
  written: Array<{ sellerId: string; recordId: string | null; amount: number }>
  /** Registros que NO se tocaron porque ya tienen plata movida. */
  skipped: Array<{ sellerId: string; reason: "paid" | "partially_paid" }>
  /** Registros de vendedores que ya no participan de la operación. */
  removed: Array<{ sellerId: string; amount: number }>
  errors: string[]
}

/**
 * Un registro con plata movida no se pisa nunca de forma automática.
 *
 * Mirar solo `status` no alcanza: un pago parcial deja el registro en PENDING
 * con `amount_paid > 0`, y recalcularlo cambiaría el monto de algo que ya se
 * cobró en parte, sin revertir el asiento contable.
 */
function isLocked(record: { status?: string | null; amount_paid?: number | null }):
  | "paid"
  | "partially_paid"
  | null {
  if ((record.status ?? "PENDING") !== "PENDING") return "paid"
  if (Number(record.amount_paid ?? 0) > 0) return "partially_paid"
  return null
}

/**
 * Persiste el plan. Idempotente: se puede correr las veces que haga falta sobre
 * la misma operación y converge al mismo estado.
 */
export async function applyCommissionPlan(
  supabase: any,
  operation: CommissionOperation,
  plan: CommissionPlan
): Promise<ApplyCommissionResult> {
  const result: ApplyCommissionResult = {
    written: [],
    skipped: [],
    removed: [],
    errors: [],
  }

  // `operation_id` ya ancla el tenant (una operación pertenece a una sola org),
  // así que la lectura no necesita org_id para ser segura.
  const { data: existingRows, error: readError } = await supabase
    .from("commission_records")
    .select("id, seller_id, status, amount, amount_paid, percentage")
    .eq("operation_id", operation.id)

  if (readError) {
    result.errors.push(`No se pudieron leer las comisiones existentes: ${readError.message}`)
    return result
  }

  const existing = new Map<string, any>()
  for (const row of (existingRows || []) as any[]) {
    existing.set(row.seller_id, row)
  }

  const now = new Date().toISOString()

  for (const entry of plan.entries) {
    const current = existing.get(entry.sellerId)

    if (current) {
      const locked = isLocked(current)
      if (locked) {
        result.skipped.push({ sellerId: entry.sellerId, reason: locked })
        continue
      }

      const { data, error } = await supabase
        .from("commission_records")
        .update({
          agency_id: operation.agency_id ?? null,
          amount: entry.amount,
          percentage: entry.percentage,
          status: "PENDING",
          date_calculated: now,
          updated_at: now,
        })
        .eq("id", current.id)
        .select("id")
        .single()

      if (error) {
        result.errors.push(`Error actualizando la comisión de ${entry.sellerId}: ${error.message}`)
      } else {
        result.written.push({ sellerId: entry.sellerId, recordId: data?.id ?? null, amount: entry.amount })
      }
      continue
    }

    // Sin registro previo y sin monto no hay nada que registrar. Importa la
    // asimetría con el caso de arriba: si el registro YA existe se actualiza
    // aunque quede en 0 —esa es la corrección a la baja que antes no se podía
    // hacer—, pero no se crea uno nuevo en cero. Sin esta distinción, una
    // organización cuyos vendedores todavía no tienen porcentaje configurado se
    // llenaría de comisiones en $0, una por cada operación que toque.
    if (entry.amount === 0) {
      continue
    }

    const { data, error } = await supabase
      .from("commission_records")
      .insert({
        operation_id: operation.id,
        seller_id: entry.sellerId,
        // Antes no se seteaba: los registros quedaban con org_id nulo y fuera
        // del alcance de cualquier query scopeada por tenant.
        org_id: operation.org_id ?? null,
        agency_id: operation.agency_id ?? null,
        amount: entry.amount,
        percentage: entry.percentage,
        status: "PENDING",
        date_calculated: now,
        updated_at: now,
      })
      .select("id")
      .single()

    if (error) {
      result.errors.push(`Error creando la comisión de ${entry.sellerId}: ${error.message}`)
    } else {
      result.written.push({ sellerId: entry.sellerId, recordId: data?.id ?? null, amount: entry.amount })
    }
  }

  // Vendedores que ya no participan de la operación. Sin esto, cambiar el
  // secundario dejaba viva la comisión del anterior y la operación terminaba
  // pagándole a tres personas.
  const planned = new Set(plan.entries.map((e) => e.sellerId))
  for (const [sellerId, row] of Array.from(existing.entries())) {
    if (planned.has(sellerId)) continue

    const locked = isLocked(row)
    if (locked) {
      result.skipped.push({ sellerId, reason: locked })
      continue
    }

    const { error } = await supabase.from("commission_records").delete().eq("id", row.id)

    if (error) {
      result.errors.push(`Error eliminando la comisión huérfana de ${sellerId}: ${error.message}`)
      continue
    }

    result.removed.push({ sellerId, amount: Number(row.amount) || 0 })
    await logAudit(supabase, {
      action: "DELETE",
      entity_type: "commission",
      entity_id: row.id,
      details: {
        reason: "seller_no_longer_in_operation",
        operation_id: operation.id,
        seller_id: sellerId,
        amount: Number(row.amount) || 0,
      },
    })
  }

  if (result.errors.length > 0) {
    console.error("[Commissions] Errores aplicando el plan de comisiones:", {
      operationId: operation.id,
      errors: result.errors,
    })
  }

  return result
}

export interface RecalculateResult extends ApplyCommissionResult {
  plan: CommissionPlan
}

/**
 * Punto de entrada de las rutas: resuelve perfiles, calcula y persiste.
 *
 * Se le pasa el cliente del request (no abre uno propio) para respetar el
 * scope del caller.
 */
export async function recalculateOperationCommissions(
  supabase: any,
  operation: CommissionOperation
): Promise<RecalculateResult> {
  if (!operation.seller_id) {
    return { written: [], skipped: [], removed: [], errors: [], plan: EMPTY_PLAN }
  }

  const orgId = operation.org_id || ""
  const profiles = await resolveSellerCommissionProfiles(supabase, orgId, [
    operation.seller_id,
    operation.seller_secondary_id,
  ])

  const plan = computeOperationCommission(operation, profiles)
  const applied = await applyCommissionPlan(supabase, operation, plan)

  // En AUTO los porcentajes de la operación son un snapshot de salida: se
  // reescriben para que la pantalla muestre lo que realmente se va a pagar.
  if (operation.commission_split_mode !== "MANUAL" && plan.entries.length > 0) {
    const changed =
      Number(operation.commission_pct_primary ?? -1) !== Number(plan.pctPrimary ?? -1) ||
      Number(operation.commission_pct_secondary ?? -1) !== Number(plan.pctSecondary ?? -1)

    if (changed) {
      const { error } = await supabase
        .from("operations")
        .update({
          commission_pct_primary: plan.pctPrimary,
          commission_pct_secondary: plan.pctSecondary,
        })
        .eq("id", operation.id)

      if (error) {
        applied.errors.push(`No se pudo guardar el snapshot de porcentajes: ${error.message}`)
      }
    }
  }

  if (plan.warnings.length > 0) {
    console.warn("[Commissions] Reparto con advertencias:", {
      operationId: operation.id,
      rule: plan.rule,
      warnings: plan.warnings,
    })
  }

  return { ...applied, plan }
}

/**
 * Recalcula las comisiones de un conjunto de operaciones de UNA organización.
 *
 * `orgId` es obligatorio: antes la función sin argumentos recorría las
 * operaciones de todos los tenants.
 */
export async function processCommissionsForOperations(
  operationIds: string[],
  orgId: string
): Promise<void> {
  if (!orgId) {
    console.error("[Commissions] processCommissionsForOperations requiere orgId")
    return
  }
  if (!operationIds || operationIds.length === 0) return

  const supabase = await createServerClient()

  const { data: operations, error } = await (supabase.from("operations") as any)
    .select("*")
    .eq("org_id", orgId)
    .in("id", operationIds)

  if (error) {
    console.error("[Commissions] Error leyendo operaciones para recalcular:", error)
    return
  }

  for (const rawOp of (operations || []) as any[]) {
    const operation: CommissionOperation = {
      ...rawOp,
      seller_id: rawOp.seller_id,
      seller_secondary_id: rawOp.seller_secondary_id || null,
      margin_amount: Number(rawOp.margin_amount) || 0,
    }

    // El margen guardado puede estar desactualizado respecto de venta y costo.
    const recalculatedMargin =
      (Number(rawOp.sale_amount_total) || 0) - (Number(rawOp.operator_cost) || 0)
    if (Math.abs(recalculatedMargin - operation.margin_amount) > 1) {
      console.log(
        `[Commissions] Margen desactualizado en ${operation.id}: guardado=${operation.margin_amount}, recalculado=${recalculatedMargin}. Se usa el recalculado.`
      )
      operation.margin_amount = recalculatedMargin
    }

    await recalculateOperationCommissions(supabase, operation)
  }
}

/**
 * Porcentaje de un solo vendedor. Queda para los pocos call sites que todavía
 * lo necesitan sueltos (validación de splits manuales); para calcular comisiones
 * usar `recalculateOperationCommissions`.
 */
export async function getSellerPercentage(
  supabase: any,
  orgId: string,
  sellerId: string
): Promise<number> {
  const profiles = await resolveSellerCommissionProfiles(supabase, orgId, [sellerId])
  return profiles.get(sellerId)?.percentage ?? 0
}
