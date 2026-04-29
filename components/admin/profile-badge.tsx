import { cn } from "@/lib/utils"
import {
  PROFILE_FIELD_COUNT,
  profileBadgeLevel,
} from "@/lib/admin/profile-completion"

type Props = {
  completion: number
  showCount?: boolean
  className?: string
}

const STYLES: Record<ReturnType<typeof profileBadgeLevel>, string> = {
  empty:    "bg-red-500/15 text-red-300 border-red-500/30",
  partial:  "bg-amber-500/15 text-amber-300 border-amber-500/30",
  complete: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
}

const ICONS: Record<ReturnType<typeof profileBadgeLevel>, string> = {
  empty:    "🔴",
  partial:  "🟡",
  complete: "🟢",
}

export function ProfileBadge({ completion, showCount = true, className }: Props) {
  const level = profileBadgeLevel(completion)
  return (
    <span
      title={`Perfil ${completion}/${PROFILE_FIELD_COUNT}`}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium",
        STYLES[level],
        className,
      )}
    >
      <span>{ICONS[level]}</span>
      {showCount && (
        <span>
          {completion}/{PROFILE_FIELD_COUNT}
        </span>
      )}
    </span>
  )
}
