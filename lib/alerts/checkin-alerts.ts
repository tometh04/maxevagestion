import { createAdminClient } from "@/lib/supabase/server"

export interface CheckinAlertResult {
  created: number
  skipped: number
  errors: string[]
}

/**
 * Genera alertas de check-in para operaciones con salida o regreso en aproximadamente 48hs.
 * Cubre ambos tramos: vuelo de ida (departure_date) y vuelo de regreso (return_date).
 * El check de duplicados usa operation_id + type + date_due para distinguir ida de regreso.
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
  const fromStr = from.toISOString().split("T")[0]
  const toStr = to.toISOString().split("T")[0]

  // Dos queries separadas: una por ida, otra por regreso
  const [departureRes, returnRes] = await Promise.all([
    supabase
      .from("operations")
      .select("id, org_id, seller_id, destination, departure_date, return_date, airline_name")
      .in("status", ["RESERVED", "CONFIRMED"])
      .not("departure_date", "is", null)
      .gte("departure_date", fromStr)
      .lte("departure_date", toStr),
    supabase
      .from("operations")
      .select("id, org_id, seller_id, destination, departure_date, return_date, airline_name")
      .in("status", ["RESERVED", "CONFIRMED"])
      .not("return_date", "is", null)
      .gte("return_date", fromStr)
      .lte("return_date", toStr),
  ])

  if (departureRes.error) result.errors.push(`Error fetching departures: ${departureRes.error.message}`)
  if (returnRes.error) result.errors.push(`Error fetching returns: ${returnRes.error.message}`)

  // Deduplicar por id — una operación puede aparecer en ambas listas si ida y regreso
  // caen en la misma ventana (vuelos cortos). Las procesamos por separado de todas formas
  // porque generan alertas distintas (date_due diferente).
  const departures = departureRes.data ?? []
  const returns = returnRes.data ?? []

  if (departures.length === 0 && returns.length === 0) return result

  // Cache de usuario POST_VENTA por org para evitar queries repetidas
  const postVentaCache = new Map<string, string | null>()

  async function getAssignedUser(op: any): Promise<string> {
    const orgId: string = op.org_id
    if (!orgId) return op.seller_id
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
    return postVentaCache.get(orgId) ?? op.seller_id
  }

  async function createCheckinAlert(op: any, date: string, isReturn: boolean) {
    // Evitar duplicados: mismo operation_id + type + date_due evita re-crear la misma alerta
    // sin bloquear la alerta del otro tramo (ida vs regreso tienen date_due distintos)
    const { data: existing } = await supabase
      .from("alerts")
      .select("id")
      .eq("operation_id", op.id)
      .eq("type", "CHECKIN_REMINDER")
      .eq("date_due", date)
      .in("status", ["PENDING", "DONE"])
      .maybeSingle()

    if (existing) {
      result.skipped++
      return
    }

    const assignedUserId = await getAssignedUser(op)
    const dateLabel = new Date(date).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    const airlineFragment = op.airline_name ? ` (${op.airline_name})` : ""
    const tripLabel = isReturn ? "vuelo de regreso" : "salida"
    const description = isReturn
      ? `Check-in pendiente${airlineFragment}: ${op.destination} — Regreso ${dateLabel}`
      : `Check-in pendiente${airlineFragment}: ${op.destination} — Salida ${dateLabel}`

    await supabase.from("alerts").insert({
      org_id: op.org_id,
      operation_id: op.id,
      user_id: assignedUserId,
      type: "CHECKIN_REMINDER",
      description,
      date_due: date,
      status: "PENDING",
    } as any)

    result.created++
  }

  for (const op of departures as any[]) {
    try {
      await createCheckinAlert(op, op.departure_date, false)
    } catch (err: any) {
      result.errors.push(`Op ${op.id} (ida): ${err?.message ?? err}`)
    }
  }

  for (const op of returns as any[]) {
    try {
      await createCheckinAlert(op, op.return_date, true)
    } catch (err: any) {
      result.errors.push(`Op ${op.id} (regreso): ${err?.message ?? err}`)
    }
  }

  return result
}
