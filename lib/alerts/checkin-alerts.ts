import { createAdminClient } from "@/lib/supabase/server"

export interface CheckinAlertResult {
  created: number
  skipped: number
  errors: string[]
}

/**
 * Genera alertas de check-in para operaciones con salida en aproximadamente 48hs.
 * Asigna la alerta al primer usuario POST_VENTA del org; si no existe, al seller de la operación.
 * Se ejecuta vía cron diario.
 */
export async function generateCheckinAlerts(): Promise<CheckinAlertResult> {
  const supabase = createAdminClient()
  const result: CheckinAlertResult = { created: 0, skipped: 0, errors: [] }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Ventana: salidas entre mañana y 3 días (cubre el umbral de 48hs con tolerancia de ±1 día por timing del cron)
  const from = new Date(today)
  from.setDate(today.getDate() + 1)
  const to = new Date(today)
  to.setDate(today.getDate() + 3)

  const { data: operations, error } = await supabase
    .from("operations")
    .select("id, org_id, seller_id, destination, departure_date, airline_name")
    .in("status", ["RESERVED", "CONFIRMED"])
    .not("departure_date", "is", null)
    .gte("departure_date", from.toISOString().split("T")[0])
    .lte("departure_date", to.toISOString().split("T")[0])

  if (error) {
    result.errors.push(`Error fetching operations: ${error.message}`)
    return result
  }

  if (!operations || operations.length === 0) return result

  // Cache de usuario POST_VENTA por org para evitar queries repetidas
  const postVentaCache = new Map<string, string | null>()

  for (const op of operations as any[]) {
    try {
      // Evitar duplicados
      const { data: existing } = await supabase
        .from("alerts")
        .select("id")
        .eq("operation_id", op.id)
        .eq("type", "CHECKIN_REMINDER")
        .in("status", ["PENDING", "DONE"])
        .maybeSingle()

      if (existing) {
        result.skipped++
        continue
      }

      // Buscar POST_VENTA en el org (con cache)
      let assignedUserId: string = op.seller_id
      const orgId: string = op.org_id

      if (orgId) {
        if (!postVentaCache.has(orgId)) {
          const { data: pvUser } = await (supabase.from("users") as any)
            .select("id")
            .eq("org_id", orgId)
            .eq("role", "POST_VENTA")
            .eq("is_active", true)
            .limit(1)
            .maybeSingle()
          postVentaCache.set(orgId, pvUser?.id ?? null)
        }
        assignedUserId = postVentaCache.get(orgId) ?? op.seller_id
      }

      const departureLabel = new Date(op.departure_date).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })

      const airlineFragment = op.airline_name ? ` (${op.airline_name})` : ""

      await supabase.from("alerts").insert({
        org_id: orgId,
        operation_id: op.id,
        user_id: assignedUserId,
        type: "CHECKIN_REMINDER",
        description: `Check-in pendiente${airlineFragment}: ${op.destination} — Salida ${departureLabel}`,
        date_due: op.departure_date,
        status: "PENDING",
      } as any)

      result.created++
    } catch (err: any) {
      result.errors.push(`Op ${op.id}: ${err?.message ?? err}`)
    }
  }

  return result
}
