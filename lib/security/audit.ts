import { createAdminClient } from "@/lib/supabase/server"

/**
 * SaaS Pilar 8 — Security audit log.
 *
 * Registra eventos de seguridad relevantes en `security_audit_log` usando el
 * admin client (service_role) — la tabla tiene force-RLS y los inserts deben
 * venir de código de plataforma, no de usuarios. Es fire-and-forget.
 *
 * Tipos de evento canónicos (agregá más si hace falta, pero mantenelos
 * estables para poder filtrar):
 *   - CROSS_ORG_LEAK: detecté un row con org_id != user.org_id en un result
 *   - PLATFORM_IMPERSONATION: un platform_admin empezó a operar como otra org
 *   - ROLE_CHANGE: se cambió users.role de un usuario
 *   - TENANT_SUSPEND / TENANT_REACTIVATE: organizations.status cambió
 *   - AUTH_ANOMALY: patrón sospechoso en login (IP nuevo, geolocalización rara)
 *   - MULTI_TENANT_STRICT_TRIP: el kill switch se activó
 */

export type SecuritySeverity = "INFO" | "WARN" | "ERROR" | "CRITICAL"

export interface SecurityAuditParams {
  eventType: string
  severity: SecuritySeverity
  actorUserId?: string | null
  actorAuthId?: string | null
  actorOrgId?: string | null
  targetOrgId?: string | null
  targetEntity?: string | null
  targetEntityId?: string | null
  requestIp?: string | null
  requestPath?: string | null
  details?: Record<string, any>
}

/**
 * Fire-and-forget. No propaga errores ni bloquea la operación principal.
 */
export function logSecurityEvent(params: SecurityAuditParams): void {
  _insert(params).catch((err) => {
    console.error("[SECURITY_AUDIT] error insertando evento:", err?.message || err)
  })
}

/**
 * Variante async para tests / flows que necesitan confirmar escritura.
 */
export async function logSecurityEventAsync(
  params: SecurityAuditParams
): Promise<{ id: string } | null> {
  return _insert(params)
}

async function _insert(params: SecurityAuditParams): Promise<{ id: string } | null> {
  try {
    const admin = createAdminClient() as any
    const { data, error } = await admin
      .from("security_audit_log")
      .insert({
        event_type: params.eventType,
        severity: params.severity,
        actor_user_id: params.actorUserId ?? null,
        actor_auth_id: params.actorAuthId ?? null,
        actor_org_id: params.actorOrgId ?? null,
        target_org_id: params.targetOrgId ?? null,
        target_entity: params.targetEntity ?? null,
        target_entity_id: params.targetEntityId ?? null,
        request_ip: params.requestIp ?? null,
        request_path: params.requestPath ?? null,
        details: params.details ?? {},
      })
      .select("id")
      .single()
    if (error) {
      console.error("[SECURITY_AUDIT] insert error:", error.message)
      return null
    }
    return { id: (data as any).id }
  } catch (err) {
    console.error("[SECURITY_AUDIT] unexpected error:", err)
    return null
  }
}

/**
 * Helper: scanea un array de resultados y detecta rows con org_id que no
 * coincide con la org esperada. Loguea un CROSS_ORG_LEAK por cada mismatch.
 * Uso típico después de una query que retornó resultados tenant-scoped:
 *
 *   const { data } = await supabase.from("operations").select(...)
 *   assertNoCrossOrgLeak(data, expectedOrgId, { userId, path: "/api/...") })
 *
 * Si MULTI_TENANT_STRICT=true, también lanza para cortar la response.
 */
export function assertNoCrossOrgLeak<T extends { org_id?: string | null }>(
  rows: T[] | null | undefined,
  expectedOrgId: string,
  context: {
    userId?: string | null
    authId?: string | null
    path?: string | null
    entity?: string | null
  }
): void {
  if (!rows || rows.length === 0) return
  const strict = process.env.MULTI_TENANT_STRICT === "true"
  for (const row of rows) {
    if (row.org_id && row.org_id !== expectedOrgId) {
      logSecurityEvent({
        eventType: "CROSS_ORG_LEAK",
        severity: "CRITICAL",
        actorUserId: context.userId ?? null,
        actorAuthId: context.authId ?? null,
        actorOrgId: expectedOrgId,
        targetOrgId: row.org_id,
        targetEntity: context.entity ?? null,
        requestPath: context.path ?? null,
        details: { row_sample: { id: (row as any).id, org_id: row.org_id } },
      })
      if (strict) {
        throw new Error(
          `MULTI_TENANT_STRICT: cross-org leak detected (expected ${expectedOrgId}, got ${row.org_id})`
        )
      }
    }
  }
}
