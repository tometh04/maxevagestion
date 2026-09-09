import "server-only"

import { createHash } from "node:crypto"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  computeOperationCommission,
  type CommissionWarning,
} from "@/lib/commissions/calculate"
import {
  resolveSellerCommissionProfiles,
  type SellerCommissionProfile,
} from "@/lib/commissions/seller-commission-profile"
import {
  getCommissionBaseConfig,
  type CommissionBaseConfig,
} from "@/lib/commissions/net-base"
import type { Database, Json } from "@/lib/supabase/types"

const sellerProfileSchema = z.object({
  sellerId: z.string().min(1),
  name: z.string().nullable(),
  percentage: z.number().finite().nullable(),
  mode: z.enum(["HALF", "ABSORB"]),
  source: z.enum(["SELLER_RULE", "USER_DEFAULT", "ORG_RULE", "NONE"]),
  advisorManagerId: z.string().nullable(),
  advisorManagerPercentage: z.number().finite().nullable(),
}).strict()

const commissionSnapshotSchema = z.object({
  schema_version: z.literal(1),
  captured_at: z.string().datetime({ offset: true }),
  profiles: z.array(sellerProfileSchema),
  base_config: z.object({
    enabled: z.boolean(),
    rate: z.number().finite(),
    from: z.string().nullable(),
  }).strict(),
}).strict()

const operationSnapshotSchema = z.object({
  id: z.string().min(1),
  file_code: z.string().nullable().optional(),
  org_id: z.string().min(1),
  agency_id: z.string().nullable().optional(),
  seller_id: z.string().min(1),
  seller_secondary_id: z.string().nullable().optional(),
  commission_pct_primary: z.coerce.number().nullable().optional(),
  commission_pct_secondary: z.coerce.number().nullable().optional(),
  commission_split_mode: z.string().nullable().optional(),
  margin_amount: z.coerce.number(),
  operation_date: z.string().nullable().optional(),
}).passthrough()
type OperationSnapshot = z.infer<typeof operationSnapshotSchema>

const claimSchema = z.object({
  claimed: z.boolean(),
  status: z.enum(["PENDING", "PROCESSING", "REVIEW", "COMPLETED"]),
  commission_snapshot: z.unknown().nullable(),
  operation_snapshot: z.unknown().nullable(),
  attempts: z.coerce.number().int().nonnegative(),
}).passthrough()

const finishSchema = z.object({
  finished: z.boolean(),
  idempotent: z.boolean(),
  status: z.enum(["PENDING", "PROCESSING", "REVIEW", "COMPLETED"]),
  attempts: z.coerce.number().int().nonnegative(),
  operation_id: z.string().min(1),
}).passthrough()

const batchClaimSchema = z.object({
  claimed: z.coerce.number().int().nonnegative(),
  jobs: z.array(claimSchema.extend({
    operation_id: z.string().min(1),
    org_id: z.string().min(1),
  })),
}).strict()

export type QuotationConversionEffectsStatus =
  | "PENDING"
  | "PROCESSING"
  | "REVIEW"
  | "COMPLETED"

export interface QuotationConversionEffectsResult {
  claimed: boolean
  status: QuotationConversionEffectsStatus
  errors: string[]
  warnings: CommissionWarning[]
}

export interface QuotationConversionEffectsBatchResult {
  claimed: number
  completed: number
  review: number
  processing: number
  errors: Array<{ operationId: string; messages: string[] }>
}

export class QuotationConversionEffectsError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = "QuotationConversionEffectsError"
  }
}

function deterministicReviewAlertId(operationId: string): string {
  const bytes = createHash("sha256")
    .update(`quotation-conversion:commission-review:${operationId}`)
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function ensureQuotationCommissionReviewAlert(input: {
  supabase: SupabaseClient<Database>
  orgId: string
  operationId: string
  userId?: string | null
  fileCode: string
}): Promise<boolean> {
  try {
    const { error } = await (input.supabase.from("alerts") as any).upsert({
      id: deterministicReviewAlertId(input.operationId),
      org_id: input.orgId,
      operation_id: input.operationId,
      user_id: input.userId ?? null,
      type: "OTHER",
      description: `Revisar cálculo de comisiones de la operación ${input.fileCode}`,
      date_due: new Date().toISOString(),
      status: "PENDING",
    }, { onConflict: "id" })
    if (error) {
      console.warn("[quotation-conversion] commission review alert failed", error.message)
      return false
    }
    return true
  } catch (error) {
    console.warn("[quotation-conversion] commission review alert failed", error)
    return false
  }
}

export async function captureQuotationCommissionSnapshot(input: {
  supabase: SupabaseClient<Database>
  orgId: string
  agencyId: string
  sellerIds: Array<string | null | undefined>
}): Promise<Json> {
  const [profiles, baseConfig] = await Promise.all([
    // Con la oficina: el snapshot tiene que decir el porcentaje que se va a
    // pagar de verdad, y depende de la sucursal (VIB-188).
    resolveSellerCommissionProfiles(
      input.supabase as any,
      input.orgId,
      input.sellerIds,
      input.agencyId
    ),
    getCommissionBaseConfig(input.supabase as any, input.agencyId),
  ])

  const snapshot = commissionSnapshotSchema.parse({
    schema_version: 1,
    captured_at: new Date().toISOString(),
    profiles: Array.from(profiles.values()),
    base_config: baseConfig,
  })
  return snapshot as unknown as Json
}

async function finishEffects(
  supabase: SupabaseClient<Database>,
  input: {
    operationId: string
    orgId: string
    attempt: number
    outcome: "COMPLETED" | "REVIEW"
    error: string | null
    commissionPlan: Json | null
  }
) {
  const { data, error } = await (supabase as any).rpc("finish_quotation_conversion_effects", {
    p_operation_id: input.operationId,
    p_org_id: input.orgId,
    p_expected_attempt: input.attempt,
    p_outcome: input.outcome,
    p_error: input.error,
    p_commission_plan: input.commissionPlan,
  })
  if (error) {
    throw new QuotationConversionEffectsError(
      "No se pudo confirmar el estado del procesamiento financiero",
      error
    )
  }
  const parsed = finishSchema.safeParse(data)
  if (!parsed.success) {
    throw new QuotationConversionEffectsError(
      "La base devolvió una confirmación financiera inválida",
      parsed.error
    )
  }
  if (parsed.data.operation_id !== input.operationId) {
    throw new QuotationConversionEffectsError(
      "La confirmación financiera no coincide con la operación"
    )
  }
  return parsed.data
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error inesperado procesando comisiones"
}

/**
 * Consume el outbox creado por la conversión. Nunca consulta perfiles o reglas
 * vigentes: calcula exclusivamente con los snapshots congelados dentro del
 * mismo commit que creó la operación.
 */
export async function processQuotationConversionEffects(input: {
  supabase: SupabaseClient<Database>
  operationId: string
  orgId: string
}): Promise<QuotationConversionEffectsResult> {
  const { data, error } = await (input.supabase as any).rpc("claim_quotation_conversion_effects", {
    p_operation_id: input.operationId,
    p_org_id: input.orgId,
    p_lease_seconds: 300,
  })
  if (error) {
    throw new QuotationConversionEffectsError(
      "No se pudo reclamar el procesamiento financiero de la conversión",
      error
    )
  }

  const parsedClaim = claimSchema.safeParse(data)
  if (!parsedClaim.success) {
    throw new QuotationConversionEffectsError(
      "La base devolvió un estado financiero inválido",
      parsedClaim.error
    )
  }
  const claim = parsedClaim.data
  if (!claim.claimed) {
    return { claimed: false, status: claim.status, errors: [], warnings: [] }
  }

  return processClaimedEffects({
    supabase: input.supabase,
    operationId: input.operationId,
    orgId: input.orgId,
    claim,
  })
}

async function processClaimedEffects(input: {
  supabase: SupabaseClient<Database>
  operationId: string
  orgId: string
  claim: z.infer<typeof claimSchema>
}): Promise<QuotationConversionEffectsResult> {
  const { claim } = input
  const errors: string[] = []
  let warnings: CommissionWarning[] = []
  let commissionPlan: Json | null = null
  let operationForReview: OperationSnapshot | null = null

  try {
    const commissionSnapshot = commissionSnapshotSchema.parse(claim.commission_snapshot)
    const operation = operationSnapshotSchema.parse(claim.operation_snapshot)
    operationForReview = operation
    if (operation.id !== input.operationId || operation.org_id !== input.orgId) {
      throw new Error("El snapshot financiero no coincide con la operación reclamada")
    }

    const profiles = new Map<string, SellerCommissionProfile>(
      commissionSnapshot.profiles.map((profile) => [profile.sellerId, profile])
    )
    const baseConfig = commissionSnapshot.base_config as CommissionBaseConfig
    const plan = computeOperationCommission(operation, profiles, baseConfig)
    warnings = plan.warnings
    commissionPlan = plan as unknown as Json
  } catch (processingError) {
    errors.push(errorMessage(processingError))
  }

  if (errors.length === 0) {
    try {
      const completed = await finishEffects(input.supabase, {
        operationId: input.operationId,
        orgId: input.orgId,
        attempt: claim.attempts,
        outcome: "COMPLETED",
        error: null,
        commissionPlan,
      })
      if (completed.status !== "COMPLETED") {
        throw new QuotationConversionEffectsError(
          `La base no confirmó las comisiones (estado ${completed.status})`
        )
      }
      return { claimed: true, status: "COMPLETED", errors: [], warnings }
    } catch (completionError) {
      errors.push(errorMessage(completionError))
    }
  }

  try {
    const reviewed = await finishEffects(input.supabase, {
      operationId: input.operationId,
      orgId: input.orgId,
      attempt: claim.attempts,
      outcome: "REVIEW",
      error: errors.join(" | ").slice(0, 4000),
      commissionPlan: null,
    })
    if (reviewed.status === "COMPLETED") {
      return { claimed: true, status: "COMPLETED", errors: [], warnings }
    }
    if (reviewed.status !== "REVIEW") {
      throw new QuotationConversionEffectsError(
        `La base no confirmó la revisión financiera (estado ${reviewed.status})`
      )
    }
  } catch (finishError) {
    errors.push(errorMessage(finishError))
    return { claimed: true, status: "PROCESSING", errors, warnings }
  }

  const alertPersisted = await ensureQuotationCommissionReviewAlert({
    supabase: input.supabase,
    orgId: input.orgId,
    operationId: input.operationId,
    userId: operationForReview?.seller_id ?? null,
    fileCode: operationForReview?.file_code || input.operationId,
  })
  if (!alertPersisted) errors.push("No se pudo persistir la alerta de revisión")

  return { claimed: true, status: "REVIEW", errors, warnings }
}

/**
 * Reclama un lote cross-tenant para el cron y consume exactamente esos leases.
 * No vuelve a ejecutar el claim individual: ambos caminos convergen en
 * `processClaimedEffects`, que es el único calculador/aplicador del outbox.
 */
export async function processNextQuotationConversionEffects(input: {
  supabase: SupabaseClient<Database>
  limit?: number
}): Promise<QuotationConversionEffectsBatchResult> {
  const limit = Math.max(1, Math.min(50, Math.trunc(input.limit ?? 20)))
  const { data, error } = await (input.supabase as any).rpc(
    "claim_next_quotation_conversion_effects",
    { p_limit: limit, p_lease_seconds: 300 }
  )
  if (error) {
    throw new QuotationConversionEffectsError(
      "No se pudo reclamar el lote de efectos financieros",
      error
    )
  }

  const parsedBatch = batchClaimSchema.safeParse(data)
  if (!parsedBatch.success || parsedBatch.data.claimed !== parsedBatch.data.jobs.length) {
    throw new QuotationConversionEffectsError(
      "La base devolvió un lote financiero inválido",
      parsedBatch.success ? undefined : parsedBatch.error
    )
  }

  const results = await Promise.all(parsedBatch.data.jobs.map(async (job) => {
    try {
      return {
        operationId: job.operation_id,
        result: await processClaimedEffects({
          supabase: input.supabase,
          operationId: job.operation_id,
          orgId: job.org_id,
          claim: job,
        }),
      }
    } catch (processingError) {
      return {
        operationId: job.operation_id,
        result: {
          claimed: true,
          status: "PROCESSING" as const,
          errors: [errorMessage(processingError)],
          warnings: [],
        },
      }
    }
  }))

  return {
    claimed: parsedBatch.data.claimed,
    completed: results.filter(({ result }) => result.status === "COMPLETED").length,
    review: results.filter(({ result }) => result.status === "REVIEW").length,
    processing: results.filter(({ result }) => result.status === "PROCESSING").length,
    errors: results
      .filter(({ result }) => result.errors.length > 0)
      .map(({ operationId, result }) => ({ operationId, messages: result.errors })),
  }
}
