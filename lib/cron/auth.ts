/**
 * Helper centralizado para autenticar cron jobs.
 *
 * Todos los endpoints `/api/cron/*` esperan el header
 * `Authorization: Bearer $CRON_SECRET`. El secret está duplicado entre la app
 * principal (Railway env var) y cada Railway Cron Service. Cuando se rota
 * uno y no el otro, todos los crons tiran 401 en silencio (Bug #21 Crons
 * 401 desde 2026-04-26).
 *
 * Esta función centraliza la verificación + agrega diagnóstico server-side
 * cuando falla, para poder distinguir:
 *   - falta CRON_SECRET en la app
 *   - llegó sin Authorization header
 *   - llegó con prefix distinto (ej. "Token X" en vez de "Bearer X")
 *   - llegó con Bearer pero token diferente
 *
 * Los logs nunca exponen el secret. Solo longitud + primer/último char +
 * prefix del header recibido. Suficiente para diagnosticar mismatch.
 */
export type CronAuthResult =
  | { authorized: true }
  | { authorized: false; reason: string }

export function checkCronAuth(request: Request, cronName: string): CronAuthResult {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")

  if (!cronSecret) {
    console.error(
      `[cron:${cronName}] 401 — CRON_SECRET no está seteado en la app. ` +
        `Verificá Railway env vars del servicio principal.`
    )
    return { authorized: false, reason: "CRON_SECRET no configurado en app" }
  }

  if (!authHeader) {
    console.error(
      `[cron:${cronName}] 401 — request sin Authorization header. ` +
        `El cron service no está mandando el header. Verificá curl del Railway Cron Service.`
    )
    return { authorized: false, reason: "Authorization header ausente" }
  }

  const expected = `Bearer ${cronSecret}`
  if (authHeader === expected) {
    return { authorized: true }
  }

  // Falla — diagnóstico sin exponer el secret real
  const headerPrefix = authHeader.split(/\s+/, 1)[0] || "(vacío)"
  const sentToken = authHeader.replace(/^Bearer\s+/i, "")
  const receivedLen = sentToken.length
  const expectedLen = cronSecret.length
  const sample =
    receivedLen > 6
      ? `${sentToken.slice(0, 3)}…${sentToken.slice(-3)}`
      : "(corto)"
  const expectedSample =
    expectedLen > 6
      ? `${cronSecret.slice(0, 3)}…${cronSecret.slice(-3)}`
      : "(corto)"

  console.error(
    `[cron:${cronName}] 401 — Bearer mismatch. ` +
      `Recibido: scheme="${headerPrefix}" len=${receivedLen} sample="${sample}". ` +
      `Esperado: len=${expectedLen} sample="${expectedSample}". ` +
      `Si los samples difieren, el Railway Cron Service tiene un CRON_SECRET ` +
      `distinto al de la app. Sincronizá ambos.`
  )
  return { authorized: false, reason: "Bearer token no coincide" }
}
