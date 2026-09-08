/**
 * Comisión al referidor (VIB-62).
 *
 * Cuando un cliente viene REFERIDO por un socio (referral_partners), cada venta
 * de ese cliente genera una comisión para el referidor, calculada SOBRE EL MARGEN
 * de la operación (mismo criterio que la comisión del vendedor).
 *
 * Este módulo es el dueño de la regla de negocio: resuelve el % vigente, calcula
 * el monto y hace un upsert idempotente en referral_commissions keyed por
 * operation_id. Se engancha al crear y al editar una operación.
 *
 * Diseño:
 *   - Idempotente: reprocesar la misma operación no duplica filas (unique
 *     operation_id + upsert).
 *   - Reactivo a cambios: si el margen baja a 0/negativo, o el cliente deja de
 *     estar referido, se elimina la comisión existente para no dejar fantasmas.
 *   - Separado de commission_records (que ata seller_id → users). El referidor es
 *     una entidad externa, no un usuario del tenant.
 *   - El caller pasa su propio client Supabase (server client scoped al request),
 *     así respeta RLS/tenant. No usa service role.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveCommissionBase, getCommissionBaseConfig } from "@/lib/commissions/net-base"

export interface ReferralCommissionInput {
  supabase: SupabaseClient<any, any, any>
  operationId: string
  /** Cliente MAIN de la operación. Si es null, no hay referido posible. */
  customerId: string | null
  /** Margen de la operación (venta − costo). Base del cálculo. */
  marginAmount: number
  orgId: string
  agencyId?: string | null
  /** Moneda de la venta; se guarda a título informativo en la comisión. */
  currency?: string
  /** Fecha de venta; usada para el corte de la base neta de IVA (VIB-95). */
  operationDate?: string | null
}

export interface ReferralCommissionResult {
  status: "created" | "updated" | "removed" | "skipped"
  amount: number
  percentage: number
  partnerId: string | null
  reason?: string
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export interface ReferralResolution {
  partnerId: string | null
  partnerName: string | null
  /** Sigue dado de alta. Se informa; no filtra el cálculo. */
  partnerActive: boolean
  /**
   * % vigente para las ventas de este cliente: override del cliente si tiene,
   * si no el default del referidor. NO contempla el ajuste manual de una venta
   * puntual, que es de la comisión y no del cliente.
   */
  percentage: number
}

/**
 * Referidor y porcentaje vigentes de un cliente.
 *
 * Extraído para que la previsualización de comisiones pendientes
 * (`pending-operations.ts`) muestre exactamente lo que después va a calcular
 * esta función: si la precedencia se escribiera dos veces, la pantalla podría
 * prometer un número y el sistema guardar otro.
 */
export async function resolveReferralForCustomer(
  supabase: SupabaseClient<any, any, any>,
  customerId: string | null
): Promise<ReferralResolution> {
  const empty: ReferralResolution = {
    partnerId: null,
    partnerName: null,
    partnerActive: false,
    percentage: 0,
  }
  if (!customerId) return empty

  const { data: customer } = await (supabase.from("customers") as any)
    .select("referral_partner_id, referral_commission_percentage")
    .eq("id", customerId)
    .maybeSingle()

  const partnerId = customer?.referral_partner_id ?? null
  if (!partnerId) return empty

  const overridePct =
    customer?.referral_commission_percentage != null
      ? Number(customer.referral_commission_percentage)
      : null

  const { data: partner } = await (supabase.from("referral_partners") as any)
    .select("name, default_commission_percentage, active")
    .eq("id", partnerId)
    .maybeSingle()

  const percentage =
    overridePct ??
    (partner?.default_commission_percentage != null
      ? Number(partner.default_commission_percentage)
      : 0)

  return {
    partnerId,
    partnerName: partner?.name ?? null,
    partnerActive: partner?.active !== false,
    percentage: Number(percentage) || 0,
  }
}

/**
 * Calcula (o recalcula) y persiste la comisión de referido de una operación.
 * Best-effort: nunca lanza; devuelve un resultado describiendo lo que hizo para
 * que el caller pueda loguear/auditar sin romper el flujo de la venta.
 */
export async function createOrUpdateReferralCommission(
  input: ReferralCommissionInput,
): Promise<ReferralCommissionResult> {
  const { supabase, operationId, customerId, orgId, agencyId, currency } = input
  const marginAmount = Number(input.marginAmount) || 0

  try {
    // Buscar comisión existente para poder actualizar/eliminar de forma idempotente.
    const { data: existing } = await (supabase.from("referral_commissions") as any)
      .select("id, status, percentage, percentage_mode")
      .eq("operation_id", operationId)
      .maybeSingle()

    // Comisión ya conciliada/pagada: no la tocamos automáticamente para no pisar
    // un pago hecho a mano. Un recálculo posterior no debe revertir plata.
    if (existing && existing.status !== "PENDING") {
      return { status: "skipped", amount: 0, percentage: 0, partnerId: null, reason: "existing_non_pending" }
    }

    // Resolver si el cliente MAIN está referido, y con qué porcentaje.
    const resolution = await resolveReferralForCustomer(supabase, customerId)
    const partnerId = resolution.partnerId

    // Sin referidor, o margen no positivo → no corresponde comisión.
    // Si había una PENDING previa, la eliminamos (el cliente se desmarcó o el
    // margen pasó a 0/negativo).
    if (!partnerId || marginAmount <= 0) {
      if (existing) {
        await (supabase.from("referral_commissions") as any).delete().eq("id", existing.id)
        return { status: "removed", amount: 0, percentage: 0, partnerId: null, reason: !partnerId ? "not_referred" : "non_positive_margin" }
      }
      return { status: "skipped", amount: 0, percentage: 0, partnerId: null, reason: !partnerId ? "not_referred" : "non_positive_margin" }
    }

    // % vigente. Precedencia: ajuste manual de ESTA venta > override del
    // cliente > default del partner.
    //
    // El ajuste manual es lo que pidió el cliente (VIB-86): el referidor se
    // marca una vez y todas las ventas futuras generan comisión sola, pero un
    // administrador tiene que poder cambiar el porcentaje de una venta puntual.
    // Sin este chequeo, cualquier edición posterior de la operación —una fecha,
    // un servicio— dispara el recálculo y pisa el ajuste.
    const esManual = existing?.percentage_mode === "MANUAL"
    const percentage = esManual
      ? Number(existing.percentage) || 0
      : resolution.percentage

    // Base de comisión: ganancia bruta por default, o neta de IVA si la agencia
    // lo tiene activo y la operación entra en el corte (VIB-95). Mismo criterio
    // que la comisión del vendedor.
    const baseConfig = await getCommissionBaseConfig(supabase, agencyId)
    const resolvedBase = resolveCommissionBase(marginAmount, input.operationDate, baseConfig)
    const commissionBase = resolvedBase.base

    const amount = round2((commissionBase * percentage) / 100)

    // % en 0 (o monto redondeado a 0): no generamos fila; limpiamos la previa.
    if (amount <= 0) {
      if (existing) {
        await (supabase.from("referral_commissions") as any).delete().eq("id", existing.id)
        return { status: "removed", amount: 0, percentage, partnerId, reason: "zero_amount" }
      }
      return { status: "skipped", amount: 0, percentage, partnerId, reason: "zero_amount" }
    }

    const nowIso = new Date().toISOString()
    const payload = {
      org_id: orgId,
      agency_id: agencyId ?? null,
      operation_id: operationId,
      referral_partner_id: partnerId,
      customer_id: customerId,
      basis: "MARGIN",
      base_amount: round2(commissionBase),
      percentage,
      amount,
      currency: currency || "ARS",
      status: "PENDING",
      date_calculated: nowIso,
      updated_at: nowIso,
      // Conservar el modo: un ajuste manual sobrevive a los recálculos. El
      // monto sí se actualiza arriba contra el margen vigente, que es lo
      // esperable si la venta cambia de valor.
      percentage_mode: esManual ? "MANUAL" : "AUTO",
    }

    if (existing) {
      await (supabase.from("referral_commissions") as any).update(payload).eq("id", existing.id)
      return { status: "updated", amount, percentage, partnerId }
    }

    const { error: insertError } = await (supabase.from("referral_commissions") as any).insert(payload)
    if (insertError) {
      console.error("[Referrals] Error insertando referral_commission:", insertError)
      return { status: "skipped", amount, percentage, partnerId, reason: "insert_error" }
    }
    return { status: "created", amount, percentage, partnerId }
  } catch (err) {
    console.error("[Referrals] Error calculando comisión de referido:", err)
    return { status: "skipped", amount: 0, percentage: 0, partnerId: null, reason: "exception" }
  }
}
