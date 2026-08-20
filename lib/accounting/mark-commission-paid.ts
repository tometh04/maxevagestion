/**
 * Marcar comisión como PAID cuando existe ledger_movement COMMISSION
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export interface MarkCommissionsOptions {
  /**
   * Fila concreta que se está saldando.
   *
   * Desde que una operación puede tener más de una comisión por vendedor —la de
   * la venta base y una por cada servicio que esa persona vendió después, cada
   * una con su propio mes—, el barrido por `(operation_id, seller_id)` dejó de
   * ser inequívoco: cobrar la comisión del paquete marcaría como pagada también
   * la del servicio, que nadie pagó. Cuando el caller sabe qué fila está
   * pagando, se marca sólo esa.
   */
  commissionRecordId?: string | null
}

/**
 * Verificar y marcar comisiones como PAID si hay ledger_movement COMMISSION
 */
export async function markCommissionsAsPaidIfLedgerExists(
  supabase: SupabaseClient<Database>,
  operationId: string,
  options: MarkCommissionsOptions = {}
): Promise<{ marked: number }> {
  // Buscar ledger_movements de tipo COMMISSION para esta operación.
  //
  // Solo los que MOVIERON PLATA (con cuenta financiera). Desde VIB-134/B0 el
  // asiento contable de comisión genera líneas type=COMMISSION con seller_id,
  // pero son un devengamiento, no un pago. Sin este filtro el barrido de abajo
  // —el que corre cuando no se sabe qué comisión concreta se pagó— tomaría los
  // vendedores del asiento y marcaría como pagadas comisiones que nadie pagó,
  // incluida la del vendedor secundario al pagar solo la del primario.
  const { data: commissionMovements } = await (supabase.from("ledger_movements") as any)
    .select("id, seller_id")
    .eq("operation_id", operationId)
    .eq("type", "COMMISSION")
    .not("account_id", "is", null)

  if (!commissionMovements || commissionMovements.length === 0) {
    return { marked: 0 }
  }

  // Marcar comisiones como PAID para los sellers que tienen ledger_movement
  const sellerIds = commissionMovements.map((m: any) => m.seller_id).filter(Boolean)

  if (sellerIds.length === 0) {
    return { marked: 0 }
  }

  const paidAt = new Date().toISOString()

  let query = (supabase.from("commission_records") as any)
    .update({
      status: "PAID",
      date_paid: paidAt,
      updated_at: paidAt,
    })
    .eq("operation_id", operationId)
    .eq("status", "PENDING")

  if (options.commissionRecordId) {
    query = query.eq("id", options.commissionRecordId)
  } else {
    // Sin fila concreta no hay manera de saber a cuál de las comisiones del
    // vendedor corresponde el movimiento, así que se conserva el barrido
    // histórico por vendedor, pero se excluyen las de servicio: esas se cobran
    // por su propio circuito y no deben saldarse como efecto colateral del pago
    // de otra comisión.
    query = query.in("seller_id", sellerIds).neq("kind", "SERVICE")
  }

  const { data: updated, error } = await query.select("id")

  if (error) {
    console.error("Error marking commissions as paid:", error)
    return { marked: 0 }
  }

  return { marked: updated?.length || 0 }
}
