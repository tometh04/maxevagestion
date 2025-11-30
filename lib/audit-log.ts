/**
 * Audit Log Service
 * 
 * Sistema básico de logs de auditoría para rastrear acciones importantes
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export type AuditAction =
  | "CREATE_LEAD"
  | "UPDATE_LEAD"
  | "DELETE_LEAD"
  | "CREATE_OPERATION"
  | "UPDATE_OPERATION"
  | "DELETE_OPERATION"
  | "CREATE_CUSTOMER"
  | "UPDATE_CUSTOMER"
  | "DELETE_CUSTOMER"
  | "MARK_PAYMENT_PAID"
  | "CREATE_CASH_MOVEMENT"
  | "UPDATE_CASH_MOVEMENT"
  | "DELETE_CASH_MOVEMENT"
  | "PAY_COMMISSION"
  | "UPDATE_SETTINGS"
  | "INVITE_USER"
  | "UPDATE_USER_ROLE"
  | "SYNC_TRELLO"
  | "EXPORT_REPORT"
  | "AI_COPILOT_QUERY"

export interface AuditLogEntry {
  user_id: string
  action: AuditAction
  entity_type: string // "lead", "operation", "customer", etc.
  entity_id?: string
  details?: Record<string, any>
  ip_address?: string
  user_agent?: string
}

/**
 * Crear un log de auditoría
 */
export async function createAuditLog(
  supabase: SupabaseClient<Database>,
  entry: AuditLogEntry
): Promise<void> {
  try {
    // Por ahora, solo logueamos en consola
    // En producción, guardar en una tabla de auditoría
    console.log("[AUDIT]", {
      timestamp: new Date().toISOString(),
      user_id: entry.user_id,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      details: entry.details,
      ip_address: entry.ip_address,
    })

    // TODO: Crear tabla audit_logs en Supabase y guardar ahí
    // await supabase.from("audit_logs").insert({
    //   user_id: entry.user_id,
    //   action: entry.action,
    //   entity_type: entry.entity_type,
    //   entity_id: entry.entity_id,
    //   details: entry.details,
    //   ip_address: entry.ip_address,
    //   user_agent: entry.user_agent,
    //   created_at: new Date().toISOString(),
    // })
  } catch (error) {
    // No lanzar error para no romper el flujo principal
    console.error("Error creating audit log:", error)
  }
}

/**
 * Helper para obtener IP y User-Agent del request
 */
export function getRequestMetadata(request: Request): {
  ip_address?: string
  user_agent?: string
} {
  const forwardedFor = request.headers.get("x-forwarded-for")
  const realIp = request.headers.get("x-real-ip")
  const userAgent = request.headers.get("user-agent")

  return {
    ip_address: forwardedFor?.split(",")[0] || realIp || undefined,
    user_agent: userAgent || undefined,
  }
}

