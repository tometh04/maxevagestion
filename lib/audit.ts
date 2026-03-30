/**
 * AUDIT LOG SERVICE
 *
 * Logs sensitive operations for compliance and security tracking.
 * Non-blocking: errors are caught and logged but never thrown to avoid
 * disrupting the main operation flow.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "APPROVE"
  | "CONVERT"
  | "PAYMENT_CREATE"
  | "PAYMENT_UPDATE"
  | "PAYMENT_DELETE"
  | "SETTINGS_CHANGE"
  | "EXPORT"
  | "IMPORT"

export type AuditEntityType =
  | "lead"
  | "operation"
  | "payment"
  | "customer"
  | "operator"
  | "user"
  | "commission"
  | "exchange_rate"
  | "financial_account"
  | "settings"
  | "quotation"

interface AuditLogEntry {
  user_id?: string
  user_email?: string
  action: AuditAction
  entity_type: AuditEntityType
  entity_id?: string
  details?: Record<string, any>
  ip_address?: string
}

/**
 * Log an audit event. Non-blocking — catches all errors internally.
 */
export async function logAudit(
  supabase: SupabaseClient,
  entry: AuditLogEntry
): Promise<void> {
  try {
    await (supabase.from("audit_log") as any).insert({
      user_id: entry.user_id || null,
      user_email: entry.user_email || null,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id || null,
      details: entry.details || {},
      ip_address: entry.ip_address || null,
    })
  } catch (error) {
    // Never throw — audit failures must not disrupt main operations
    console.warn("[Audit] Failed to log event:", entry.action, entry.entity_type, error)
  }
}

/**
 * Helper to extract IP from Next.js request headers
 */
export function getClientIP(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0].trim()
  }
  const realIp = request.headers.get("x-real-ip")
  return realIp || null
}
