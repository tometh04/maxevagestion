/**
 * Clasificación de fallas al resolver la sesión, y reintento de las transitorias.
 *
 * `getCurrentUser()` mandaba a `/login` ante CUALQUIER error: un token inválido,
 * pero también un 429 del servicio de Auth, un 502, o un fetch que no salió.
 * Eso convierte un hipo de red en un deslogueo — con la cookie de sesión
 * perfectamente válida en el browser.
 *
 * El síntoma es el peor de todos: entrás, la app abre, y en el primer render te
 * saca. Volvés a loguearte y anda, porque nunca hubo nada roto. Y aparece más
 * seguido justo después del login porque ahí hay una ráfaga de `auth.getUser()`
 * (middleware + `/post-login` + layout del dashboard + cada `/api/*` que dispara
 * la pantalla), o sea la ventana más grande para que uno falle.
 *
 * Regla: solo desloguear cuando Supabase dice que la sesión no sirve. Si la
 * falla es de infraestructura, reintentar y, si persiste, tirar el error — que
 * se vea una pantalla de error reintentable, no una sesión destruida.
 */

/** Reintentos extra (además del intento inicial) y backoff entre ellos. */
const RETRY_DELAYS_MS = [150, 400]

type MaybeAuthError = {
  name?: string
  status?: number
  code?: string
  message?: string
} | null

/**
 * `true` cuando el error es de infraestructura y NO significa "no hay sesión".
 *
 * Se listan solo los casos que sabemos transitorios; cualquier otro error se
 * trata como terminal, o sea que el comportamiento previo se mantiene para todo
 * lo que no esté acá. Es a propósito: un falso "transitorio" dejaría entrar a
 * alguien sin sesión a una pantalla de error en loop.
 */
export function isTransientAuthError(error: MaybeAuthError): boolean {
  if (!error) return false

  // gotrue-js envuelve fetch fallido / timeout / 5xx retryables acá.
  if (error.name === "AuthRetryableFetchError") return true

  const status = typeof error.status === "number" ? error.status : undefined
  if (status === 408 || status === 429) return true
  if (status !== undefined && status >= 500) return true

  // Fetch que no llegó a tener respuesta: no hay status y el mensaje es del
  // runtime, no de GoTrue.
  const message = (error.message ?? "").toLowerCase()
  if (
    status === undefined &&
    (message.includes("fetch failed") ||
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("econnreset") ||
      message.includes("socket hang up"))
  ) {
    return true
  }

  return false
}

/**
 * Igual que `isTransientAuthError` pero para errores de PostgREST al leer la
 * fila de `users`. Una query que falló no es un usuario que no existe.
 */
export function isTransientPostgrestError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false

  const code = error.code ?? ""
  // 57014 statement_timeout, 08006/08003 fallas de conexión, 53300 too many
  // connections, XX000 internal. PGRST002 = schema cache no disponible todavía.
  if (["57014", "08006", "08003", "08000", "53300", "53400", "XX000", "PGRST002"].includes(code)) {
    return true
  }

  const message = (error.message ?? "").toLowerCase()
  return (
    message.includes("fetch failed") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("upstream connect error")
  )
}

/**
 * Corre `attempt` y reintenta mientras el error sea transitorio.
 *
 * Devuelve el último resultado: el caller decide qué hacer con un error que
 * sobrevivió a los reintentos. No traga nada.
 */
export async function retryTransient<T>(
  // `PromiseLike` y no `Promise`: los query builders de PostgREST son thenables,
  // no promesas, y con `Promise<T>` TypeScript no logra inferir T y cae al
  // constraint (o sea pierde `data`).
  attempt: () => PromiseLike<T>,
  isTransient: (error: any) => boolean,
  label: string
): Promise<T> {
  // T queda sin constraint a proposito: varios call sites pasan builders
  // tipados como `any` y con `T extends { error: any }` la inferencia caia al
  // constraint, perdiendo `data`.
  const errorOf = (value: T) => (value as { error?: unknown } | null)?.error ?? null

  let result = await attempt()

  for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
    const error = errorOf(result)
    if (!isTransient(error)) return result

    console.warn(
      `[auth] ${label}: falla transitoria (intento ${i + 1}/${RETRY_DELAYS_MS.length + 1}) — ${describeError(error)}`
    )
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[i]))
    result = await attempt()
  }

  return result
}

/** Descripción corta y sin PII para logs. */
export function describeError(error: any): string {
  if (!error) return "sin error"
  const parts = [
    error.name && `name=${error.name}`,
    error.status !== undefined && `status=${error.status}`,
    error.code && `code=${error.code}`,
    error.message && `msg=${String(error.message).slice(0, 160)}`,
  ].filter(Boolean)
  return parts.join(" ") || "error sin detalle"
}
