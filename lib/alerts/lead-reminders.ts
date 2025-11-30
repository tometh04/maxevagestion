/**
 * LEAD REMINDERS SERVICE
 * 
 * Genera alertas automáticas para leads basadas en fechas:
 * - Recordatorio 30 días antes de estimated_checkin_date
 * - Recordatorio 15 días antes de estimated_checkin_date
 * - Recordatorio en follow_up_date
 */

import { createServerClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

/**
 * Generar recordatorios para leads
 */
export async function generateLeadReminders(): Promise<{
  created: number
  errors: string[]
}> {
  const supabase = await createServerClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const errors: string[] = []
  let created = 0

  try {
    // Obtener leads con fechas relevantes
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, contact_name, destination, estimated_checkin_date, follow_up_date, assigned_seller_id, agency_id")
      .or("estimated_checkin_date.not.is.null,follow_up_date.not.is.null")

    if (error) {
      throw new Error(`Error obteniendo leads: ${error.message}`)
    }

    for (const lead of (leads || []) as any[]) {
      // Recordatorios de check-in (30 y 15 días antes)
      if (lead.estimated_checkin_date) {
        const checkinDate = new Date(lead.estimated_checkin_date)
        const daysUntilCheckin = Math.ceil((checkinDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        if (daysUntilCheckin === 30 || daysUntilCheckin === 15) {
          try {
            const description = `Lead "${lead.contact_name}" - Check-in en ${daysUntilCheckin} días (${lead.destination || "Sin destino"})`
            const success = await createLeadAlert(supabase, lead, description, checkinDate.toISOString().split("T")[0])
            if (success) created++
          } catch (error: any) {
            errors.push(`Error creando alerta de check-in para lead ${lead.id}: ${error.message}`)
          }
        }
      }

      // Recordatorio de seguimiento
      if (lead.follow_up_date) {
        const followUpDate = new Date(lead.follow_up_date)
        const daysUntilFollowUp = Math.ceil((followUpDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        if (daysUntilFollowUp === 0) {
          try {
            const description = `Seguimiento pendiente: Lead "${lead.contact_name}" - ${lead.destination || "Sin destino"}`
            const success = await createLeadAlert(supabase, lead, description, followUpDate.toISOString().split("T")[0])
            if (success) created++
          } catch (error: any) {
            errors.push(`Error creando alerta de seguimiento para lead ${lead.id}: ${error.message}`)
          }
        }
      }
    }

    return { created, errors }
  } catch (error: any) {
    errors.push(`Error fatal: ${error.message}`)
    return { created, errors }
  }
}

async function createLeadAlert(
  supabase: SupabaseClient<Database>,
  lead: any,
  description: string,
  dateDue: string
): Promise<boolean> {
  // Verificar si ya existe
  const { data: existing } = await supabase
    .from("alerts")
    .select("id")
    .eq("type", "GENERIC")
    .eq("status", "PENDING")
    .ilike("description", `%${lead.contact_name}%`)
    .eq("date_due", dateDue)
    .maybeSingle()

  if (existing) return false

  // Obtener usuario
  let userId = lead.assigned_seller_id

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

