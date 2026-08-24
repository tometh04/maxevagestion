/**
 * Redacta credenciales bearer embebidas en paths públicos antes de enviarlas
 * a logs, métricas o trazas. No modifica el path usado para routing.
 */
export function redactSensitivePath(pathname: string): string {
  return pathname
    .replace(/^\/cotizacion\/[^/]+/i, "/cotizacion/[token]")
    .replace(
      /^\/api\/public\/quotations\/[^/]+/i,
      "/api/public/quotations/[token]"
    )
}
