import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"
import { ArrowDown, ArrowUp, Minus } from "lucide-react"

type Delta = { value: string; trend: "up" | "down" | "neutral" }

type Props = {
  label: string
  value: React.ReactNode
  icon?: LucideIcon
  hint?: string
  delta?: Delta
  className?: string
}

const TREND_COLOR: Record<Delta["trend"], string> = {
  up: "text-success",
  down: "text-destructive",
  neutral: "text-muted-foreground",
}

const TREND_ICON: Record<Delta["trend"], React.ComponentType<{ className?: string }>> = {
  up: ArrowUp,
  down: ArrowDown,
  neutral: Minus,
}

export function StatCard({ label, value, icon: Icon, hint, delta, className }: Props) {
  const TrendIcon = delta ? TREND_ICON[delta.trend] : null
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-lg border border-muted-foreground/80 bg-ink/40 p-4 backdrop-blur transition hover:border-muted-foreground",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {Icon && (
          <span className="rounded-md bg-ink/60 p-1.5 text-muted-foreground group-hover:text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="text-2xl font-semibold tracking-tight text-muted-foreground">{value}</div>
      {(hint || delta) && (
        <div className="flex items-center gap-2 text-xs">
          {delta && TrendIcon && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium", TREND_COLOR[delta.trend])}>
              <TrendIcon className="h-3 w-3" />
              {delta.value}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  )
}
