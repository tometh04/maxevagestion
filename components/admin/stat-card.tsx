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
  up: "text-emerald-400",
  down: "text-red-400",
  neutral: "text-slate-400",
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
        "group relative flex flex-col gap-3 rounded-lg border border-slate-800/80 bg-slate-900/40 p-4 backdrop-blur transition hover:border-slate-700",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        {Icon && (
          <span className="rounded-md bg-slate-800/60 p-1.5 text-slate-400 group-hover:text-slate-300">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="text-2xl font-semibold tracking-tight text-slate-100">{value}</div>
      {(hint || delta) && (
        <div className="flex items-center gap-2 text-xs">
          {delta && TrendIcon && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium", TREND_COLOR[delta.trend])}>
              <TrendIcon className="h-3 w-3" />
              {delta.value}
            </span>
          )}
          {hint && <span className="text-slate-500">{hint}</span>}
        </div>
      )}
    </div>
  )
}
