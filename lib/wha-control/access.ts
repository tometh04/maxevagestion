/**
 * Alcance dentro de WhatsApp central.
 *
 * Hay dos formas de entrar y no hay que confundirlas:
 *   * administración (SUPER_ADMIN / ORG_OWNER / ADMIN): ve todos los teléfonos
 *     de la organización, que es como nació el módulo;
 *   * vendedor: vincula su línea y ve SOLO sus conversaciones, igual que en el
 *     resto del sistema, donde un SELLER ve únicamente lo suyo.
 *
 * Las rutas usan service role (no pasan por RLS), así que el filtro tiene que
 * ir explícito en cada query. Estos helpers son ese filtro: si una ruta recibe
 * un deviceId o un chatId de la URL, tiene que pasarlo por acá antes de tocar
 * nada, o un vendedor podría leer el teléfono de un compañero cambiando el id.
 */

export interface WhaScope {
  orgId: string
  userId: string
  isWhaAdmin: boolean
}

/** Alcance a partir de lo que devuelve `whaControlAuthGuard()`. */
export function scopeFromAuth(auth: any): WhaScope {
  return {
    orgId: auth.orgId,
    userId: auth.user.id,
    isWhaAdmin: auth.isWhaAdmin === true,
  }
}

/**
 * Aplica el alcance a una query sobre `wa_devices`. El admin ve la organización
 * entera; el vendedor, solo lo suyo.
 */
export function scopeDevicesQuery(query: any, scope: WhaScope) {
  const scoped = query.eq("org_id", scope.orgId)
  return scope.isWhaAdmin ? scoped : scoped.eq("user_id", scope.userId)
}

/**
 * ¿Puede tocar este teléfono? Devuelve la fila si sí, null si no existe, no es
 * de su organización o es de otra persona.
 */
export async function getAccessibleDevice(
  supabase: any,
  scope: WhaScope,
  deviceId: string,
  columns = "id, status, user_id, agency_id"
): Promise<any | null> {
  const { data } = await scopeDevicesQuery(
    supabase.from("wa_devices").select(columns),
    scope
  )
    .eq("id", deviceId)
    .maybeSingle()
  return data ?? null
}

/**
 * ¿Puede tocar esta conversación? Se resuelve por el teléfono al que pertenece,
 * que es donde vive la propiedad.
 */
export async function getAccessibleChat(
  supabase: any,
  scope: WhaScope,
  chatId: string,
  columns = "id, device_id, remote_jid, is_group"
): Promise<any | null> {
  const { data: chat } = await supabase
    .from("wa_chats")
    .select(columns)
    .eq("id", chatId)
    .eq("org_id", scope.orgId)
    .maybeSingle()

  if (!chat) return null
  if (scope.isWhaAdmin) return chat

  const device = await getAccessibleDevice(supabase, scope, (chat as any).device_id, "id")
  return device ? chat : null
}

/** Igual que la anterior pero para el conjunto de ids de una conversación partida. */
export async function filterAccessibleChatIds(
  supabase: any,
  scope: WhaScope,
  chatIds: string[]
): Promise<string[]> {
  if (chatIds.length === 0) return []

  const { data: chats } = await supabase
    .from("wa_chats")
    .select("id, device_id")
    .in("id", chatIds)
    .eq("org_id", scope.orgId)

  const filas = (chats ?? []) as Array<{ id: string; device_id: string }>
  if (filas.length === 0) return []
  if (scope.isWhaAdmin) return filas.map((c) => c.id)

  const deviceIds = Array.from(new Set(filas.map((c) => c.device_id)))
  const { data: propios } = await scopeDevicesQuery(
    supabase.from("wa_devices").select("id"),
    scope
  ).in("id", deviceIds)

  const mios = new Set((propios ?? []).map((d: any) => d.id))
  return filas.filter((c) => mios.has(c.device_id)).map((c) => c.id)
}
