/**
 * Marcar comisión como PAID cuando existe ledger_movement COMMISSION
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

/**
 * Verificar y marcar comisiones como PAID si hay ledger_movement COMMISSION
 */
export async function markCommissionsAsPaidIfLedgerExists(
  supabase: SupabaseClient<Database>,
  operationId: string
): Promise<{ marked: number }> {
  // Buscar ledger_movements de tipo COMMISSION para esta operación
  const { data: commissionMovements } = await (supabase.from("ledger_movements") as any)
    .select("id, seller_id")
    .eq("operation_id", operationId)
    .eq("type", "COMMISSION")

  if (!commissionMovements || commissionMovements.length === 0) {
    return { marked: 0 }
  }

  // Marcar comisiones como PAID para los sellers que tienen ledger_movement
  const sellerIds = commissionMovements.map((m: any) => m.seller_id).filter(Boolean)

  if (sellerIds.length === 0) {
    return { marked: 0 }
  }

  const { data: updated, error } = await (supabase.from("commission_records") as any)
    .update({
      status: "PAID",
      date_paid: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("operation_id", operationId)
    .in("seller_id", sellerIds)
    .eq("status", "PENDING")
    .select("id")

  if (error) {
    console.error("Error marking commissions as paid:", error)
    return { marked: 0 }
  }

  return { marked: updated?.length || 0 }
}

