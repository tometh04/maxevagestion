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
 *
 * ── VIB-102: administradores de asesores independientes ────────────────────
 *
 * Una operación puede generar una comisión para alguien que NO la vendió: quien
 * administra al vendedor (típicamente un asesor independiente) cobra un % de
 * cada venta suya. Ver `lib/commissions/advisor-manager.ts` para la regla; acá
 * solo se suma al plan como una entrada más, con `role = 'ADVISOR_MANAGER'`.
 */

import { logAudit } from "@/lib/audit"
import { roundMoney } from "@/lib/currency"
import { KINDS_FUERA_DEL_PLAN_FILTER } from "@/lib/commissions/kinds"
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
import {
  resolveAdvisorManagerOverrides,
  type AdvisorManagerWarning,
} from "@/lib/commissions/advisor-manager"
import {
  resolveCommissionBase,
  getCommissionBaseConfig,
  type CommissionBaseConfig,
} from "@/lib/commissions/net-base"

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
  /** Fecha de venta; usada para el corte de la base neta de IVA (VIB-95). */
  operation_date?: string | null
}

export type CommissionRule = "SOLO" | "HALF_HALF" | "ABSORB" | "SINGLE" | "MANUAL" | "NONE"

export type CommissionWarning = SharedSplitWarning | AdvisorManagerWarning

export interface CommissionEntry {
  sellerId: string
  /**
   * ADVISOR_MANAGER = no vendió la operación; cobra por administrar al vendedor
   * (VIB-102). Se persiste en `commission_records.kind`.
   */
  role: "PRIMARY" | "SECONDARY" | "ADVISOR_MANAGER"
  /** Porcentaje EFECTIVO sobre el margen: el que realmente se cobra. */
  percentage: number
  amount: number
  /** Solo en ADVISOR_MANAGER: el vendedor administrado que generó la comisión. */
  sourceSellerId?: string | null
}

export interface CommissionPlan {
  entries: CommissionEntry[]
  totalCommission: number
  rule: CommissionRule
  absorberId: string | null
  warnings: CommissionWarning[]
  /** Snapshot a persistir en `operations.commission_pct_*`. */
  pctPrimary: number | null
  pctSecondary: number | null
  /**
   * true si se aplicó al menos una comisión de administrador (VIB-102),
   * incluso cuando terminó sumada a la fila de un vendedor.
   *
   * Es lo que habilita a `applyCommissionPlan` a escribir `kind` y
   * `source_seller_id`. Sin esta bandera habría que mandar esas columnas
   * siempre, y desplegar el código antes que la migración haría fallar TODAS
   * las comisiones, no solo las de administrador.
   */
  hasAdvisorManagerCommission: boolean
}

const EMPTY_PLAN: CommissionPlan = {
  entries: [],
  totalCommission: 0,
  rule: "NONE",
  absorberId: null,
  warnings: [],
  pctPrimary: null,
  pctSecondary: null,
  hasAdvisorManagerCommission: false,
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
  profiles: Map<string, SellerCommissionProfile>,
  baseConfig?: CommissionBaseConfig | null
): CommissionPlan {
  const primaryId = operation.seller_id
  if (!primaryId) return EMPTY_PLAN

  // Base de comisión: ganancia bruta por default, o neta de IVA si la agencia
  // lo tiene activo y la operación entra en el corte (VIB-95). El núcleo sigue
  // puro: la config viene resuelta desde afuera.
  const margin = resolveCommissionBase(
    Number(operation.margin_amount) || 0,
    operation.operation_date,
    baseConfig
  ).base
  const secondaryId =
    operation.seller_secondary_id && operation.seller_secondary_id !== primaryId
      ? operation.seller_secondary_id
      : null
  const isManual = operation.commission_split_mode === "MANUAL"

  let rule: CommissionRule
  let absorberId: string | null = null
  let warnings: CommissionWarning[] = []
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

  // El snapshot de `operations.commission_pct_*` se congela ACÁ, antes de sumar
  // administradores: esas columnas describen el reparto ENTRE VENDEDORES y son
  // lo que el formulario reenvía en cada edición. Si el porcentaje de un
  // administrador se filtrara adentro, `splitModeForUpdate` vería un valor
  // distinto del que mandó la UI y congelaría la operación en MANUAL.
  const pctPrimary = entries[0]?.percentage ?? null
  const pctSecondary = secondaryId ? entries[1]?.percentage ?? null : null

  // ── Comisión del administrador del vendedor (VIB-102) ───────────────────
  //
  // Se aplica también en MANUAL: el modo manual congela el reparto entre los
  // vendedores de la operación, no el trato que la agencia tiene con quien
  // administra al free. Son dos configuraciones distintas.
  const { overrides, warnings: managerWarnings } = resolveAdvisorManagerOverrides(
    [primaryId, secondaryId].filter((id): id is string => !!id).map((sellerId) => {
      const profile = profiles.get(sellerId)
      return {
        sellerId,
        advisorManagerId: profile?.advisorManagerId ?? null,
        advisorManagerPercentage: profile?.advisorManagerPercentage ?? null,
      }
    })
  )
  warnings = [...warnings, ...managerWarnings]

  for (const override of overrides) {
    const existing = entries.find((e) => e.sellerId === override.managerId)

    // El administrador también vendió esta operación. `commission_records` tiene
    // un unique (operation_id, seller_id), así que no puede tener dos filas: se
    // acumulan los dos porcentajes en la suya. El número sigue siendo lo que
    // significa —el % del margen que cobra esa persona por esta venta— y la
    // fila conserva su rol de vendedor, que es el que explica la operación.
    if (existing) {
      existing.percentage = roundMoney(existing.percentage + override.percentage, 2)
      existing.amount = amountFor(margin, existing.percentage)
      continue
    }

    entries.push({
      sellerId: override.managerId,
      role: "ADVISOR_MANAGER",
      percentage: override.percentage,
      amount: amountFor(margin, override.percentage),
      sourceSellerId: override.sourceSellerIds[0] ?? null,
    })
  }

  return {
    entries,
    totalCommission: roundMoney(
      entries.reduce((acc, e) => acc + e.amount, 0),
      2
    ),
    rule,
    absorberId,
    warnings,
    pctPrimary,
    pctSecondary,
    hasAdvisorManagerCommission: overrides.length > 0,
  }
}

export interface ApplyCommissionResult {
  written: Array<{ sellerId: string; recordId: string | null; amount: number }>
  /** Registros que NO se tocaron porque ya tienen plata movida. */
  skipped: Array<{ sellerId: string; reason: "paid" | "partially_paid" | "settled" }>
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
 *
 * Una comisión saldada (`settled_at`, VIB-94) también está cerrada, aunque no
 * tenga plata atrás: es una deuda vieja que la agencia dio por cancelada. Sin
 * este candado, editar la operación la recalcularía y volvería a nacer como
 * deuda — que es exactamente lo que el cierre vino a evitar.
 */
export function isLocked(record: {
  status?: string | null
  amount_paid?: number | null
  settled_at?: string | null
}): "paid" | "partially_paid" | "settled" | null {
  if ((record.status ?? "PENDING") !== "PENDING") return "paid"
  if (Number(record.amount_paid ?? 0) > 0) return "partially_paid"
  if (record.settled_at) return "settled"
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
  // Solo las filas que este plan posee. Las de `KINDS_FUERA_DEL_PLAN` tienen su
  // propio vendedor, su propio porcentaje y su propio mes, y no se derivan del
  // margen de la operación: son las filas de la tabla que NO produce este plan.
  // Si entraran acá, el Map de abajo las haría desaparecer (colapsa por
  // seller_id) y el barrido de huérfanas las borraría, porque su vendedor no
  // figura en `plan.entries`. Y ese barrido corre con casi cualquier edición de
  // la operación o de sus servicios.
  const { data: existingRows, error: readError } = await supabase
    .from("commission_records")
    .select("id, seller_id, status, amount, amount_paid, percentage, settled_at, kind")
    .eq("operation_id", operation.id)
    .not("kind", "in", KINDS_FUERA_DEL_PLAN_FILTER)

  if (readError) {
    result.errors.push(`No se pudieron leer las comisiones existentes: ${readError.message}`)
    return result
  }

  const existing = new Map<string, any>()
  for (const row of (existingRows || []) as any[]) {
    existing.set(row.seller_id, row)
  }

  const now = new Date().toISOString()

  /**
   * Mes al que se imputa la comisión. Para las filas del plan es la fecha de la
   * operación, que es el criterio que el Reporte de Comisiones ya venía usando
   * (antes lo sacaba del join con `operations`); persistirlo en la fila deja el
   * resultado idéntico y permite que una comisión de servicio lleve la suya.
   */
  const accrualDate = (operation.operation_date ?? now).slice(0, 10)

  /**
   * Columnas de VIB-102. Solo se mandan si la operación tiene alguna comisión
   * de administrador: así una organización que no usa la función sigue
   * escribiendo exactamente el mismo payload de siempre y no depende de que la
   * migración ya esté corrida.
   *
   * Cuando sí se mandan, van en TODAS las filas de la operación, también en las
   * de vendedor: es lo que devuelve a 'SELLER' la fila de quien dejó de ser
   * administrador y pasó a vender esta misma operación.
   */
  const kindFieldsFor = (entry: CommissionEntry) =>
    plan.hasAdvisorManagerCommission
      ? {
          kind: entry.role === "ADVISOR_MANAGER" ? "ADVISOR_MANAGER" : "SELLER",
          source_seller_id: entry.role === "ADVISOR_MANAGER" ? entry.sourceSellerId ?? null : null,
        }
      : {}

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
          accrual_date: accrualDate,
          updated_at: now,
          ...kindFieldsFor(entry),
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
        accrual_date: accrualDate,
        updated_at: now,
        ...kindFieldsFor(entry),
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
  operation: CommissionOperation,
  baseConfig?: CommissionBaseConfig | null
): Promise<RecalculateResult> {
  if (!operation.seller_id) {
    return { written: [], skipped: [], removed: [], errors: [], plan: EMPTY_PLAN }
  }

  const orgId = operation.org_id || ""
  // La oficina va porque un vendedor puede cobrar distinto en cada sucursal
  // (VIB-175): en Lozada, 25% en Madero y 45% en Rosario.
  const profiles = await resolveSellerCommissionProfiles(
    supabase,
    orgId,
    [operation.seller_id, operation.seller_secondary_id],
    operation.agency_id
  )

  // Si el caller no pasó la config, la resolvemos por la agencia de la operación.
  const resolvedConfig =
    baseConfig ?? (await getCommissionBaseConfig(supabase, operation.agency_id))

  const plan = computeOperationCommission(operation, profiles, resolvedConfig)
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

  // Cache de config de base neta por agencia para no consultar por cada operación.
  const configByAgency = new Map<string, CommissionBaseConfig>()

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

    const agencyKey = operation.agency_id || ""
    if (!configByAgency.has(agencyKey)) {
      configByAgency.set(agencyKey, await getCommissionBaseConfig(supabase, operation.agency_id))
    }

    await recalculateOperationCommissions(supabase, operation, configByAgency.get(agencyKey))
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
  sellerId: string,
  /** Oficina de la operación, para resolver el porcentaje que rige ahí (VIB-175). */
  agencyId?: string | null
): Promise<number> {
  const profiles = await resolveSellerCommissionProfiles(supabase, orgId, [sellerId], agencyId)
  return profiles.get(sellerId)?.percentage ?? 0
}
