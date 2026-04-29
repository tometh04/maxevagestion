/**
 * ACCOUNTING AUDIT LOG
 *
 * Registra acciones contables en la tabla audit_logs.
 * Usa el cliente admin (service role) para bypasear RLS.
 * Es fire-and-forget: no bloquea la operacion principal si el log falla.
 */

import { createAdminClient } from "@/lib/supabase/server"

export type AccountingAuditAction =
  | "CREATE_LEDGER"
  | "UPDATE_LEDGER"
  | "DELETE_LEDGER"
  | "CREATE_IVA"
  | "UPDATE_IVA"
  | "CREATE_COMMISSION"
  | "UPDATE_COMMISSION"
  | "PAY_COMMISSION"
  | "CREATE_WITHHOLDING"
  | "CHANGE_EXCHANGE_RATE"
  | "CHANGE_TAX_SETTINGS"

export interface AccountingAuditParams {
  userId: string
  action: AccountingAuditAction
  entityType: string
  entityId?: string
  details?: Record<string, any>
}

/**
 * Registra una accion contable en la tabla audit_logs.
 *
 * Esta funcion es fire-and-forget: lanza la insercion pero no espera
 * el resultado ni propaga errores para no bloquear la operacion principal.
 *
 * Usa el cliente admin (service role) para bypasear RLS en audit_logs.
 *
 * @param params - Datos de la accion a registrar
 */
export function logAccountingAction(params: AccountingAuditParams): void {
  // Fire-and-forget: ejecutar sin await para no bloquear
  _insertAuditLog(params).catch((error) => {
    console.error("[AUDIT] Error logging accounting action:", error)
  })
}

/**
 * Version async de logAccountingAction para cuando se necesita esperar el resultado.
 * Util en tests o cuando se quiere confirmar que el log fue creado.
 */
export async function logAccountingActionAsync(
  params: AccountingAuditParams
): Promise<{ id: string } | null> {
  return _insertAuditLog(params)
}

async function _insertAuditLog(
  params: AccountingAuditParams
): Promise<{ id: string } | null> {
  try {
    const adminSupabase = createAdminClient()

    const { data, error } = await (adminSupabase.from("audit_logs") as any)
      .insert({
        user_id: params.userId,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId || null,
        details: params.details || {},
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (error) {
      console.error("[AUDIT] Failed to insert audit log:", error.message)
      return null
    }

    return { id: data.id }
  } catch (error) {
    console.error("[AUDIT] Unexpected error inserting audit log:", error)
    return null
  }
}
