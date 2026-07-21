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

/** Un vuelo concreto que necesita check-in dentro de una operación. */
export interface CheckinTarget {
  date: string
  airlineName: string | null
  destination: string
  /** Texto del tramo en la descripción: "Salida", "Regreso", "Tramo 2 (AB123) — Salida". */
  segmentLabel: string
}

export interface CheckinLegInput {
  order_index?: number | null
  destination?: string | null
  departure_date?: string | null
  airline_name?: string | null
  reservation_code_air?: string | null
}

export interface CheckinOperationInput {
  destination?: string | null
  departure_date?: string | null
  return_date?: string | null
  airline_name?: string | null
}

/**
 * Arma la lista de vuelos a chequear de una operación: ida, regreso y cada
 * tramo cargado en operation_legs.
 *
 * Los tramos usan SU propia aerolínea para resolver la anticipación, que es el
 * punto de la feature: un tramo con LATAM (72hs) y otro con JetSmart (48hs)
 * disparan en momentos distintos.
 *
 * Dedup por fecha, y la ida/regreso van primero: si un tramo sale el mismo día
 * que la salida principal, se conserva la alerta general y no se duplica el
 * aviso. La tabla `alerts` igual deduplica por (operation_id, type, date_due),
 * así que dos alertas para la misma fecha nunca convivirían.
 */
export function buildCheckinTargets(
  op: CheckinOperationInput,
  legs: CheckinLegInput[] = []
): CheckinTarget[] {
  const targets: CheckinTarget[] = []
  const seenDates = new Set<string>()

  const push = (target: CheckinTarget | null) => {
    if (!target?.date || seenDates.has(target.date)) return
    seenDates.add(target.date)
    targets.push(target)
  }

  if (op.departure_date) {
    push({
      date: op.departure_date,
      airlineName: op.airline_name ?? null,
      destination: op.destination || "",
      segmentLabel: "Salida",
    })
  }

  if (op.return_date) {
    push({
      date: op.return_date,
      airlineName: op.airline_name ?? null,
      destination: op.destination || "",
      segmentLabel: "Regreso",
    })
  }

  const sortedLegs = [...legs].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
  )

  sortedLegs.forEach((leg, index) => {
    if (!leg.departure_date) return
    const code = (leg.reservation_code_air || "").trim()
    const codeFragment = code ? ` (${code})` : ""
    push({
      date: leg.departure_date,
      // La aerolínea del tramo manda; si no la cargaron, la de la operación.
      airlineName: leg.airline_name || op.airline_name || null,
      destination: leg.destination || op.destination || "",
      segmentLabel: `Tramo ${index + 1}${codeFragment} — Salida`,
    })
  })

  return targets
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

  // Tramos (operation_legs) que vuelan dentro de la ventana. Su operación puede
  // tener la salida principal fuera del rango — un tramo intermedio de un viaje
  // que arrancó hace un mes igual necesita su check-in.
  const legsByOperation = new Map<string, any[]>()
  const legOperationIds = new Set<string>()
  try {
    const { data: legRows, error: legsError } = await (supabase.from("operation_legs") as any)
      .select("operation_id, order_index, destination, departure_date, airline_name, reservation_code_air")
      .not("departure_date", "is", null)
      .gte("departure_date", fromStr)
      .lte("departure_date", toStr)

    if (legsError) {
      result.errors.push(`Error fetching legs: ${legsError.message}`)
    }

    for (const leg of (legRows ?? []) as any[]) {
      if (!leg?.operation_id) continue
      legOperationIds.add(leg.operation_id)
      const arr = legsByOperation.get(leg.operation_id) ?? []
      arr.push(leg)
      legsByOperation.set(leg.operation_id, arr)
    }
  } catch (err: any) {
    result.errors.push(`Error fetching legs: ${err?.message ?? err}`)
  }

  // Operaciones alcanzadas sólo por un tramo: hay que traerlas aparte.
  const operationsById = new Map<string, any>()
  for (const op of [...(departures as any[]), ...(returns as any[])]) {
    operationsById.set(op.id, op)
  }

  const missingOpIds = Array.from(legOperationIds).filter((opId) => !operationsById.has(opId))
  if (missingOpIds.length > 0) {
    const { data: legOps, error: legOpsError } = await supabase
      .from("operations")
      .select("id, org_id, seller_id, destination, departure_date, return_date, airline_name")
      .in("status", ["RESERVED", "CONFIRMED"])
      .in("id", missingOpIds)

    if (legOpsError) {
      result.errors.push(`Error fetching leg operations: ${legOpsError.message}`)
    }

    for (const op of (legOps ?? []) as any[]) {
      operationsById.set(op.id, op)
    }
  }

  if (operationsById.size === 0) return result

  // Titular (cliente MAIN) por operación → identifica la reserva en el aviso
  // (dos reservas al mismo destino/fecha se veían idénticas). Batch por op ids
  // de la ventana (ya scopeadas). Formato "Apellido, Nombre".
  const titularByOp = new Map<string, string>()
  const opIds = Array.from(operationsById.keys())
  if (opIds.length > 0) {
    const { data: ocRows } = await (supabase.from("operation_customers") as any)
      .select("operation_id, role, customers:customer_id(first_name, last_name)")
      .in("operation_id", opIds)
    const rowsByOp = new Map<string, any[]>()
    for (const row of (ocRows ?? []) as any[]) {
      const arr = rowsByOp.get(row.operation_id) ?? []
      arr.push(row)
      rowsByOp.set(row.operation_id, arr)
    }
    rowsByOp.forEach((rows, opId) => {
      const main = rows.find((r: any) => r.role === "MAIN") ?? rows[0]
      const c = main?.customers
      const name = c ? [c.last_name, c.first_name].filter(Boolean).join(", ") : ""
      if (name) titularByOp.set(opId, name)
    })
  }

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

  async function createCheckinAlert(op: any, target: CheckinTarget) {
    const { date } = target
    const config = getConfig(op.org_id)
    if (!config.enabled) {
      result.skipped++
      return
    }

    // Solo disparar si la fecha entra en la ventana de anticipación de SU
    // aerolínea — la del tramo cuando el target es un tramo.
    const leadDays = leadDaysFromHours(resolveCheckinLeadHours(target.airlineName, config))
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
    const airlineFragment = target.airlineName ? ` (${target.airlineName})` : ""
    // "Check-in próximo" (no "pendiente") para preservar el matcher de WhatsApp
    // (generate-from-operations ilike '%Check-in próximo%') y el texto familiar.
    const titular = titularByOp.get(op.id)
    const titularFragment = titular ? ` — ${titular}` : ""
    const description =
      `Check-in próximo${airlineFragment}: ${target.destination}${titularFragment}` +
      ` — ${target.segmentLabel} ${dateLabel}`

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

  for (const op of Array.from(operationsById.values())) {
    const targets = buildCheckinTargets(op, legsByOperation.get(op.id) ?? [])
    for (const target of targets) {
      try {
        await createCheckinAlert(op, target)
      } catch (err: any) {
        result.errors.push(`Op ${op.id} (${target.segmentLabel}): ${err?.message ?? err}`)
      }
    }
  }

  return result
}
