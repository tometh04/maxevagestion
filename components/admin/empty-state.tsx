import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Inbox } from "lucide-react"

type Props = {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-800 bg-slate-900/20 px-6 py-10 text-center",
        className,
      )}
    >
      <div className="rounded-full bg-slate-800/60 p-3 text-slate-400">
        <Icon className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-200">{title}</p>
        {description && <p className="text-xs text-slate-500 max-w-sm">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
