/**
 * QUOTATION REMINDERS SERVICE
 * 
 * Genera alertas automáticas para cotizaciones:
 * - Recordatorio 3 días antes de valid_until
 * - Alerta cuando valid_until expira
 * - Recordatorio de seguimiento 7 días después de enviar
 */

import { createServerClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

/**
 * Generar recordatorios para cotizaciones
 */
export async function generateQuotationReminders(): Promise<{
  created: number
  expired: number
  errors: string[]
}> {
  const supabase = await createServerClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const errors: string[] = []
  let created = 0
  let expired = 0

  try {
    // Expirar cotizaciones vencidas
      const { error: expireError } = await (supabase.rpc as any)("expire_quotations")
    if (expireError) {
      console.error("Error expirando cotizaciones:", expireError)
    } else {
      // Contar cuántas se expiraron (aproximado)
      const { data: expiredQuots } = await supabase
        .from("quotations")
        .select("id")
        .eq("status", "EXPIRED")
        .eq("valid_until", today.toISOString().split("T")[0])
      
      expired = expiredQuots?.length || 0
    }

    // Obtener cotizaciones activas con valid_until
    const threeDaysFromNow = new Date(today)
    threeDaysFromNow.setDate(today.getDate() + 3)

    const { data: quotations, error } = await supabase
      .from("quotations")
      .select("id, quotation_number, destination, valid_until, status, seller_id, created_at")
      .in("status", ["DRAFT", "SENT", "PENDING_APPROVAL"])
      .not("valid_until", "is", null)
      .lte("valid_until", threeDaysFromNow.toISOString().split("T")[0])
      .gte("valid_until", today.toISOString().split("T")[0])

    if (error) {
      throw new Error(`Error obteniendo cotizaciones: ${error.message}`)
    }

    for (const quot of (quotations || []) as any[]) {
      const validUntil = new Date(quot.valid_until)
      const daysUntilExpiry = Math.ceil((validUntil.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      if (daysUntilExpiry === 3 || daysUntilExpiry === 0) {
        try {
          const description = daysUntilExpiry === 0
            ? `🔴 Cotización ${quot.quotation_number} vence hoy - ${quot.destination || "Sin destino"}`
            : `⚠️ Cotización ${quot.quotation_number} vence en 3 días - ${quot.destination || "Sin destino"}`
          
          const success = await createQuotationAlert(supabase, quot, description, validUntil.toISOString().split("T")[0])
          if (success) created++
        } catch (error: any) {
          errors.push(`Error creando alerta para cotización ${quot.id}: ${error.message}`)
        }
      }
    }

    // Recordatorios de seguimiento (7 días después de enviar)
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(today.getDate() - 7)

    const { data: sentQuotations, error: sentError } = await supabase
      .from("quotations")
      .select("id, quotation_number, destination, seller_id, created_at")
      .eq("status", "SENT")
      .gte("created_at", sevenDaysAgo.toISOString())
      .lte("created_at", new Date(sevenDaysAgo.getTime() + 24 * 60 * 60 * 1000).toISOString())

    if (!sentError && sentQuotations) {
      for (const quot of (sentQuotations as any[])) {
        try {
          const description = `📞 Seguimiento pendiente: Cotización ${quot.quotation_number} - ${quot.destination || "Sin destino"}`
          const success = await createQuotationAlert(supabase, quot, description, today.toISOString().split("T")[0])
          if (success) created++
        } catch (error: any) {
          errors.push(`Error creando alerta de seguimiento para cotización ${quot.id}: ${error.message}`)
        }
      }
    }

    return { created, expired, errors }
  } catch (error: any) {
    errors.push(`Error fatal: ${error.message}`)
    return { created, expired, errors }
  }
}

async function createQuotationAlert(
  supabase: SupabaseClient<Database>,
  quotation: any,
  description: string,
  dateDue: string
): Promise<boolean> {
  // Verificar si ya existe
  const { data: existing } = await supabase
    .from("alerts")
    .select("id")
    .eq("type", "GENERIC")
    .eq("status", "PENDING")
    .ilike("description", `%${quotation.quotation_number}%`)
    .eq("date_due", dateDue)
    .maybeSingle()

  if (existing) return false

  // Obtener usuario
  let userId = quotation.seller_id

  if (!userId) {
    const { data: adminUser } = await supabase
      .from("users")
      .select("id")
      .in("role", ["ADMIN", "SUPER_ADMIN"])
      .limit(1)
      .maybeSingle()

    userId = (adminUser as any)?.id || null
  }

  if (!userId) return false

  const { error } = await supabase.from("alerts").insert({
    user_id: userId,
    type: "GENERIC",
    description,
    date_due: dateDue,
    status: "PENDING",
  } as any)

  return !error
}

