import "server-only"

import { getCurrentUser } from "@/lib/auth"
import {
  applyAgencyPermissionScope,
  resolveAgencyPermissionScope,
} from "@/lib/permissions/agency-scope-server"
import { createHttpOfferRefreshAdapter } from "@/lib/quotation-refresh/http-offer-refresh-adapter"
import {
  createQuotationRefreshModule,
  QuotationRefreshError,
} from "@/lib/quotation-refresh/module"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"

export async function quotationRefreshRequestContext(
  quotationId: string,
  permission: "read" | "write"
) {
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    throw new QuotationRefreshError("FORBIDDEN", "Usuario sin organización asociada.")
  }
  const server = await createServerClient()
  const scope = await resolveAgencyPermissionScope(server, user, "leads", permission)
  if (scope.memberAgencyIds.length > 0 && scope.agencyIds.length === 0) {
    throw new QuotationRefreshError("FORBIDDEN", "No tiene permiso para actualizar cotizaciones.")
  }

  const admin = createAdminClient() as any
  let query = admin
    .from("quotations")
    .select("id, org_id, agency_id, seller_id")
    .eq("id", quotationId)
    .eq("org_id", user.org_id)
  query = applyAgencyPermissionScope(query, scope)
  const { data, error } = await query.maybeSingle()
  if (error || !data) {
    throw new QuotationRefreshError("NOT_FOUND", "Cotización no encontrada.", error)
  }

  return {
    user,
    quotation: data as { id: string; org_id: string; agency_id: string },
    module: createQuotationRefreshModule({
      db: admin,
      offerRefresh: createHttpOfferRefreshAdapter(),
    }),
  }
}
export function quotationRefreshHttpError(error: unknown) {
  if (!(error instanceof QuotationRefreshError)) {
    console.error("[quotation-price-refresh] unexpected error", error)
    return {
      status: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "No se pudo actualizar la cotización." } },
    }
  }

  const status = error.code === "NOT_FOUND"
    ? 404
    : error.code === "FORBIDDEN"
      ? 403
      : error.code === "INVALID_INPUT"
        ? 400
        : error.code === "CREDENTIAL_UNAVAILABLE"
          ? 422
          : error.code === "MISSING_OPERATOR"
            ? 422
          : ["QUOTATION_CHANGED", "RUN_CHANGED", "ACTIVE_RUN", "IDEMPOTENCY_CONFLICT", "INVALID_STATE"].includes(error.code)
            ? 409
            : error.code === "REMOTE_FAILED"
              ? 502
              : 500
  const code = error.code === "QUOTATION_CHANGED"
    ? "STALE_QUOTATION"
    : error.code === "RUN_CHANGED"
      ? "STALE_RUN"
      : error.code
  return { status, body: { error: { code, message: error.message } } }
}
