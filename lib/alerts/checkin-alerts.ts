import { createAdminClient } from "@/lib/supabase/server"

export interface CheckinAlertResult {
  created: number
  skipped: number
  errors: string[]
}

/** Override de anticipación de check-in para una aerolínea puntual. */
export interface AirlineLeadTime {
  airline: string
  hours: number
}

/** Configuración de check-in resuelta por org (desde operation_settings). */
export interface CheckinConfig {
  enabled: boolean
  defaultHours: number
  /** Map de aerolínea normalizada → horas de anticipación. */
  overrides: Map<string, number>
}

const DEFAULT_CHECKIN_HOURS = 48

/**
 * Normaliza el nombre de aerolínea para matchear overrides de forma robusta
 * pese a que `operations.airline_name` es texto libre: lowercase, sin acentos,
 * espacios colapsados. "Aerolíneas Argentinas" === "aerolineas argentinas".
 */
export function normalizeAirline(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Resuelve cuántas horas antes de la salida debe dispararse el check-in para una
 * operación, según su aerolínea. Si la aerolínea tiene override → sus horas;
 * si no → el default de la org.
 */
export function resolveCheckinLeadHours(
  airlineName: string | null | undefined,
  config: CheckinConfig
): number {
  const key = normalizeAirline(airlineName)
  if (key && config.overrides.has(key)) {
    return config.overrides.get(key) as number
  }
  return config.defaultHours
}

/** Horas → días enteros de ventana (cron diario). 24→1, 48→2, 72→3. */
export function leadDaysFromHours(hours: number): number {
  return Math.max(1, Math.ceil(hours / 24))
}

const DEFAULT_CONFIG: CheckinConfig = {
  enabled: true,
  defaultHours: DEFAULT_CHECKIN_HOURS,
  overrides: new Map(),
}

function buildConfig(row: any): CheckinConfig {
  const rawOverrides: AirlineLeadTime[] = Array.isArray(row?.checkin_airline_lead_times)
    ? row.checkin_airline_lead_times
    : []
  const overrides = new Map<string, number>()
  for (const entry of rawOverrides) {
    const key = normalizeAirline(entry?.airline)
    const hours = Number(entry?.hours)
    if (key && Number.isFinite(hours) && hours > 0) {
      overrides.set(key, hours)
    }
  }
  return {
    enabled: row?.checkin_enabled !== false,
    defaultHours:
      Number.isFinite(Number(row?.checkin_default_hours)) && Number(row?.checkin_default_hours) > 0
        ? Number(row.checkin_default_hours)
        : DEFAULT_CHECKIN_HOURS,
    overrides,
  }
}

/**
 * Genera alertas de check-in para operaciones cuya salida o regreso entra en la
 * ventana de anticipación configurada por la org (default 48hs, override por aerolínea).
 * Cubre ambos tramos: vuelo de ida (departure_date) y vuelo de regreso (return_date).
 * El check de duplicados usa operation_id + type + date_due para distinguir ida de regreso.
 * Se ejecuta vía cron diario.
 */
export async function generateCheckinAlerts(): Promise<CheckinAlertResult> {
  const supabase = createAdminClient()
  const result: CheckinAlertResult = { created: 0, skipped: 0, errors: [] }

  // Config de check-in por org. operation_settings es por agencia con org_id; mapeamos
  // por org_id (las operaciones se scopean por org en este generador). Esto reemplaza la
  // ventana hardcodeada previa y, de paso, evita el bug del cron que leía settings con
  // .limit(1) y los aplicaba a todas las orgs.
  const configByOrg = new Map<string, CheckinConfig>()
  let maxLeadDays = leadDaysFromHours(DEFAULT_CHECKIN_HOURS)
  try {
    const { data: settingsRows } = await (supabase as any)
      .from("operation_settings")
      .select("org_id, checkin_enabled, checkin_default_hours, checkin_airline_lead_times")
    for (const row of (settingsRows ?? []) as any[]) {
      if (!row?.org_id) continue
      const config = buildConfig(row)
      configByOrg.set(row.org_id, config)
      // Ventana de query = máxima anticipación posible entre default y overrides,
      // así no perdemos aerolíneas con check-in temprano (ej. 72hs).
      const orgMaxHours = Math.max(config.defaultHours, ...Array.from(config.overrides.values(), (h) => h))
      maxLeadDays = Math.max(maxLeadDays, leadDaysFromHours(orgMaxHours))
    }
  } catch (err: any) {
    result.errors.push(`Error loading checkin settings: ${err?.message ?? err}`)
  }

  const getConfig = (orgId: string | null | undefined): CheckinConfig =>
    (orgId && configByOrg.get(orgId)) || DEFAULT_CONFIG

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const msPerDay = 24 * 60 * 60 * 1000
  const daysUntil = (dateStr: string): number => {
    const d = new Date(`${dateStr}T00:00:00`)
    d.setHours(0, 0, 0, 0)
    return Math.round((d.getTime() - today.getTime()) / msPerDay)
  }

  // Traemos un rango amplio [hoy, hoy+maxLeadDays] y filtramos por operación según su
  // aerolínea. El borde inferior es hoy (incluye salidas del día con check-in pendiente).
  const to = new Date(today)
  to.setDate(today.getDate() + maxLeadDays)
  const fromStr = today.toISOString().split("T")[0]
  const toStr = to.toISOString().split("T")[0]

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
    const config = getConfig(op.org_id)
    if (!config.enabled) {
      result.skipped++
      return
    }

    // Solo disparar si la fecha entra en la ventana de anticipación de SU aerolínea.
    const leadDays = leadDaysFromHours(resolveCheckinLeadHours(op.airline_name, config))
    const remaining = daysUntil(date)
    if (remaining < 0 || remaining > leadDays) {
      result.skipped++
      return
    }

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
