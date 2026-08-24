import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/lib/supabase/types"

export type QuotationConversionErrorCode =
  | "not_found"
  | "invalid_state"
  | "document_changed"
  | "invalid_content"
  | "plan_limit"
  | "conflict"
  | "conversion_failed"

export class QuotationConversionError extends Error {
  constructor(
    message: string,
    readonly code: QuotationConversionErrorCode,
    readonly status: number
  ) {
    super(message)
    this.name = "QuotationConversionError"
  }
}

export interface QuotationConversionResult {
  operationId: string
  fileCode: string
  servicesCreated: number
  alreadyConverted: boolean
  operation: Record<string, unknown>
}

interface ConvertQuotationArgs {
  supabase: SupabaseClient<Database>
  quotationId: string
  orgId: string
  agencyId: string
  actorId: string
  fileCode: string
  commissionSnapshot: Json | null
}

function asObject(value: Json | null): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null
  return value as Record<string, unknown>
}

function mapConversionDatabaseError(error: { code?: string; message?: string }) {
  const message = String(error.message || "")

  if (error.code === "P0002" || message.includes("quotation not found")) {
    return new QuotationConversionError("Cotización no encontrada", "not_found", 404)
  }
  if (error.code === "P0001" && message.includes("operation monthly plan limit reached")) {
    return new QuotationConversionError(
      "Alcanzaste el límite de operaciones por mes. Actualizá el plan para crear más.",
      "plan_limit",
      403
    )
  }
  if (error.code === "42501" && message.includes("organization subscription suspended")) {
    return new QuotationConversionError(
      "La suscripción está suspendida. Contactá soporte para reactivarla.",
      "plan_limit",
      403
    )
  }
  if (message.includes("active accepted document") || message.includes("accepted snapshot")) {
    return new QuotationConversionError(
      "El documento aceptado cambió o ya no está disponible. Volvé a emitir la cotización.",
      "document_changed",
      409
    )
  }
  if (error.code === "55000" || message.includes("quotation status")) {
    return new QuotationConversionError(
      "La cotización ya no está en un estado válido para convertir.",
      "invalid_state",
      409
    )
  }
  if (error.code === "40001" || error.code === "23505") {
    return new QuotationConversionError(
      "La cotización fue convertida o modificada por otra solicitud.",
      "conflict",
      409
    )
  }
  if (["22023", "22P02", "23514", "23503"].includes(String(error.code || ""))) {
    return new QuotationConversionError(
      "La cotización aceptada tiene datos incompletos o inconsistentes para crear la operación.",
      "invalid_content",
      422
    )
  }

  return new QuotationConversionError(
    "No se pudo convertir la cotización sin dejar datos parciales.",
    "conversion_failed",
    500
  )
}

/**
 * Creates the operation, service detail, supplier debts and quotation linkage
 * in one database transaction. There is intentionally no row-by-row fallback:
 * a partial conversion is worse than a failed conversion.
 */
export async function convertQuotationToOperation({
  supabase,
  quotationId,
  orgId,
  agencyId,
  actorId,
  fileCode,
  commissionSnapshot,
}: ConvertQuotationArgs): Promise<QuotationConversionResult> {
  const { data, error } = await (supabase as any).rpc("convert_quotation_to_operation", {
    p_quotation_id: quotationId,
    p_org_id: orgId,
    p_agency_id: agencyId,
    p_actor_id: actorId,
    p_file_code: fileCode,
    p_commission_snapshot: commissionSnapshot,
  })

  if (error) throw mapConversionDatabaseError(error)

  const result = asObject(data as Json | null)
  const operation = asObject((result?.operation ?? null) as Json | null)
  const operationId = typeof result?.operation_id === "string" ? result.operation_id : ""
  const returnedFileCode = typeof result?.file_code === "string" ? result.file_code : ""
  const servicesCreated = Number(result?.services_created)

  if (
    !result
    || !operation
    || !operationId
    || !returnedFileCode
    || !Number.isInteger(servicesCreated)
    || servicesCreated < 0
  ) {
    throw new QuotationConversionError(
      "La base no devolvió una conversión verificable.",
      "conversion_failed",
      500
    )
  }

  return {
    operationId,
    fileCode: returnedFileCode,
    servicesCreated,
    alreadyConverted: result.already_converted === true,
    operation,
  }
}
