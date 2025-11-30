/**
 * ALERTAS CONTABLES AVANZADAS
 * 
 * Genera alertas relacionadas con el módulo contable:
 * - IVA pendiente
 * - Saldo de caja bajo
 * - FX losses altos
 * - Documentación faltante
 */

import { createServerClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { getMonthlyIVAToPay } from "@/lib/accounting/iva"
import { getAccountBalance } from "@/lib/accounting/ledger"
import { getOverdueOperatorPayments } from "@/lib/accounting/operator-payments"

/**
 * Generar alerta de IVA pendiente
 * Se genera cuando hay IVA a pagar en el mes actual
 */
export async function generateIVAAlert(
  supabase: SupabaseClient<Database>,
  agencyId: string,
  userId: string,
  threshold: number = 0
): Promise<void> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  try {
    const ivaStatus = await getMonthlyIVAToPay(supabase, year, month)

    if (ivaStatus.iva_to_pay > threshold) {
      // Verificar si ya existe una alerta de IVA para este mes
      const { data: existing } = await (supabase.from("alerts") as any)
        .select("id")
        .eq("type", "IVA_PENDING")
        .eq("agency_id", agencyId)
        .gte("created_at", `${year}-${String(month).padStart(2, "0")}-01`)
        .maybeSingle()

      if (!existing) {
        await (supabase.from("alerts") as any).insert({
          agency_id: agencyId,
          user_id: userId,
          type: "IVA_PENDING",
          description: `IVA pendiente de pago: ${ivaStatus.iva_to_pay.toLocaleString("es-AR", {
            style: "currency",
            currency: "ARS",
          })} (Mes: ${month}/${year})`,
          date_due: new Date(year, month, 10).toISOString(), // Vence el día 10 del mes siguiente
          status: "PENDING",
        })
      }
    }
  } catch (error) {
    console.error("Error generating IVA alert:", error)
  }
}

/**
 * Generar alerta de saldo de caja bajo
 * Se genera cuando el saldo de una cuenta CASH está por debajo del umbral
 */
export async function generateCashBalanceAlert(
  supabase: SupabaseClient<Database>,
  agencyId: string,
  userId: string,
  threshold: number = 100000 // Umbral por defecto: $100,000 ARS
): Promise<void> {
  try {
    // Obtener todas las cuentas CASH en ARS
    const { data: cashAccounts } = await (supabase.from("financial_accounts") as any)
      .select("id, name")
      .eq("type", "CASH")
      .eq("currency", "ARS")

    for (const account of cashAccounts || []) {
      const balance = await getAccountBalance(account.id, supabase)

      if (balance < threshold) {
        // Verificar si ya existe una alerta para esta cuenta
        const { data: existing } = await (supabase.from("alerts") as any)
          .select("id")
          .eq("type", "CASH_LOW")
          .eq("agency_id", agencyId)
          .like("description", `%${account.name}%`)
          .eq("status", "PENDING")
          .maybeSingle()

        if (!existing) {
          await (supabase.from("alerts") as any).insert({
            agency_id: agencyId,
            user_id: userId,
            type: "CASH_LOW",
            description: `Saldo bajo en ${account.name}: ${balance.toLocaleString("es-AR", {
              style: "currency",
              currency: "ARS",
            })} (Umbral: ${threshold.toLocaleString("es-AR", { style: "currency", currency: "ARS" })})`,
            date_due: new Date().toISOString(),
            status: "PENDING",
          })
        }
      }
    }
  } catch (error) {
    console.error("Error generating cash balance alert:", error)
  }
}

/**
 * Generar alerta de FX losses altos
 * Se genera cuando hay pérdidas cambiarias significativas en un período
 */
export async function generateFXLossAlert(
  supabase: SupabaseClient<Database>,
  agencyId: string,
  userId: string,
  threshold: number = 50000, // Umbral por defecto: $50,000 ARS
  days: number = 30 // Período: últimos 30 días
): Promise<void> {
  try {
    const dateFrom = new Date()
    dateFrom.setDate(dateFrom.getDate() - days)

    // Sumar todas las pérdidas FX del período
    const { data: fxLosses } = await (supabase.from("ledger_movements") as any)
      .select("amount_ars_equivalent")
      .eq("type", "FX_LOSS")
      .gte("created_at", dateFrom.toISOString())

    const totalFXLoss = (fxLosses || []).reduce(
      (sum: number, m: any) => sum + parseFloat(m.amount_ars_equivalent || "0"),
      0
    )

    if (totalFXLoss > threshold) {
      // Verificar si ya existe una alerta de FX loss
      const { data: existing } = await (supabase.from("alerts") as any)
        .select("id")
        .eq("type", "FX_LOSS")
        .eq("agency_id", agencyId)
        .gte("created_at", dateFrom.toISOString())
        .eq("status", "PENDING")
        .maybeSingle()

      if (!existing) {
        await (supabase.from("alerts") as any).insert({
          agency_id: agencyId,
          user_id: userId,
          type: "FX_LOSS",
          description: `Pérdidas cambiarias altas en últimos ${days} días: ${totalFXLoss.toLocaleString("es-AR", {
            style: "currency",
            currency: "ARS",
          })} (Umbral: ${threshold.toLocaleString("es-AR", { style: "currency", currency: "ARS" })})`,
          date_due: new Date().toISOString(),
          status: "PENDING",
        })
      }
    }
  } catch (error) {
    console.error("Error generating FX loss alert:", error)
  }
}

/**
 * Generar alerta de documentación faltante
 * Se genera cuando una operación CONFIRMED no tiene documentos requeridos
 */
export async function generateMissingDocsAlert(
  supabase: SupabaseClient<Database>,
  agencyId: string,
  operationId: string,
  sellerId: string
): Promise<void> {
  try {
    // Obtener la operación
    const { data: operation } = await (supabase.from("operations") as any)
      .select("id, destination, departure_date, file_code")
      .eq("id", operationId)
      .single()

    if (!operation || (operation.status !== "CONFIRMED" && operation.status !== "RESERVED")) {
      return
    }

    // Verificar documentos requeridos (pasaportes, vouchers, etc.)
    // Nota: La tabla documents puede no existir, en ese caso solo verificamos que la operación esté confirmada
    let missingTypes: string[] = []
    try {
      const { data: documents } = await (supabase.from("documents") as any)
        .select("id, type")
        .eq("operation_id", operationId)

      const requiredTypes = ["PASSPORT", "VOUCHER", "TICKET"]
      const existingTypes = (documents || []).map((d: any) => d.type)
      missingTypes = requiredTypes.filter((type) => !existingTypes.includes(type))
    } catch (error) {
      // Si la tabla documents no existe, asumimos que faltan todos los documentos requeridos
      console.warn("Documents table may not exist, assuming all documents are missing")
      missingTypes = ["PASSPORT", "VOUCHER", "TICKET"]
    }

    if (missingTypes.length > 0) {
      // Verificar si ya existe una alerta de documentación faltante
      const { data: existing } = await (supabase.from("alerts") as any)
        .select("id")
        .eq("type", "MISSING_DOC")
        .eq("operation_id", operationId)
        .eq("status", "PENDING")
        .maybeSingle()

      if (!existing) {
        await (supabase.from("alerts") as any).insert({
          agency_id: agencyId,
          operation_id: operationId,
          user_id: sellerId,
          type: "MISSING_DOC",
          description: `Documentación faltante en operación ${operation.file_code || operationId.slice(0, 8)}: ${missingTypes.join(", ")}`,
          date_due: operation.departure_date || new Date().toISOString(),
          status: "PENDING",
        })
      }
    }
  } catch (error) {
    console.error("Error generating missing docs alert:", error)
  }
}

/**
 * Generar todas las alertas contables
 */
export async function generateAllAccountingAlerts(
  supabase: SupabaseClient<Database>,
  agencyId: string,
  userId: string
): Promise<void> {
  await Promise.all([
    generateIVAAlert(supabase, agencyId, userId),
    generateCashBalanceAlert(supabase, agencyId, userId),
    generateFXLossAlert(supabase, agencyId, userId),
  ])
}

