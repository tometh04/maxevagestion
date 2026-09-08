import { cn } from "@/lib/utils"

/**
 * Ocupación de un paquete: cuántas plazas se vendieron sobre el cupo.
 *
 * Es el dato por el que se entra a esta pantalla, así que va como barra + número
 * y no como una métrica suelta. El color acompaña pero nunca informa solo: el
 * texto siempre dice el estado (WCAG 2.1 AA, y `prefers-reduced-motion` no
 * aplica porque no hay animación de entrada).
 */

export type QuotaLevel = "empty" | "available" | "low" | "full" | "over"

export function quotaLevel(consumed: number, totalQuota: number): QuotaLevel {
  if (totalQuota <= 0) return "empty"
  if (consumed > totalQuota) return "over"
  const remaining = totalQuota - consumed
  if (remaining <= 0) return "full"
  // Un quinto del cupo o menos: es cuando conviene salir a vender o ampliar.
  if (remaining / totalQuota <= 0.2) return "low"
  return "available"
}

const BAR_COLOR: Record<QuotaLevel, string> = {
  empty: "bg-muted-foreground/30",
  available: "bg-primary",
  low: "bg-accent-sand",
  full: "bg-destructive",
  over: "bg-destructive",
}

const TEXT_COLOR: Record<QuotaLevel, string> = {
  empty: "text-muted-foreground",
  available: "text-muted-foreground",
  low: "text-accent-sand",
  full: "text-destructive",
  over: "text-destructive",
}

export function quotaStatusLabel(consumed: number, totalQuota: number): string {
  const level = quotaLevel(consumed, totalQuota)
  const remaining = totalQuota - consumed
  switch (level) {
    case "empty":
      return "Sin cupo definido"
    case "full":
      return "Agotado"
    case "over":
      // No debería pasar: la RPC bloquea la sobreventa. Si aparece, es un dato
      // que hay que ver, no esconder detrás de un cero.
      return `Sobrevendido por ${Math.abs(remaining)}`
    case "low":
      return `Quedan ${remaining}`
    default:
      return `${remaining} disponibles`
  }
}

interface QuotaMeterProps {
  consumed: number
  totalQuota: number
  /** `sm` para celdas de tabla, `lg` para la cabecera del detalle. */
  size?: "sm" | "lg"
  className?: string
}

export function QuotaMeter({ consumed, totalQuota, size = "sm", className }: QuotaMeterProps) {
  const level = quotaLevel(consumed, totalQuota)
  const pct = totalQuota > 0 ? Math.min(100, Math.round((consumed / totalQuota) * 100)) : 0
  const isLarge = size === "lg"

  return (
    <div className={cn("min-w-[7rem] space-y-1", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn("tabular-nums font-medium", isLarge ? "text-2xl" : "text-sm")}
          // El lector de pantalla recibe la frase completa; el resto es visual.
          aria-hidden="true"
        >
          {consumed}
          <span className="text-muted-foreground font-normal"> / {totalQuota}</span>
        </span>
        <span className={cn("text-xs", TEXT_COLOR[level], isLarge && "text-sm")}>
          {quotaStatusLabel(consumed, totalQuota)}
        </span>
      </div>

      <div
        className={cn("w-full overflow-hidden rounded-full bg-secondary", isLarge ? "h-2" : "h-1.5")}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalQuota}
        aria-valuenow={consumed}
        aria-label={`${consumed} de ${totalQuota} plazas vendidas. ${quotaStatusLabel(consumed, totalQuota)}`}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-200", BAR_COLOR[level])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
