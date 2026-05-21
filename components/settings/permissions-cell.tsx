"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import type { ResolvedModulePerms } from "@/lib/permissions-agency"

interface PermissionsCellProps {
  perms: ResolvedModulePerms
  onChange: (updated: ResolvedModulePerms) => void
  isModified: boolean
  readOnly?: boolean
}

type PermKey = "read" | "write" | "delete" | "export"

const PERM_LABELS: { key: PermKey; label: string }[] = [
  { key: "read", label: "L" },
  { key: "write", label: "E" },
  { key: "delete", label: "B" },
  { key: "export", label: "X" },
]

export function PermissionsCell({ perms, onChange, isModified, readOnly }: PermissionsCellProps) {
  function toggle(key: PermKey) {
    if (readOnly) return
    const updated = { ...perms, [key]: !perms[key] }
    // Si se deshabilita read, también deshabilitar write/delete/export
    if (key === "read" && !updated.read) {
      updated.write = false
      updated.delete = false
      updated.export = false
    }
    // Si se habilita write/delete/export, también habilitar read
    if ((key === "write" || key === "delete" || key === "export") && updated[key]) {
      updated.read = true
    }
    onChange(updated)
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 px-2 py-2 rounded-md min-w-[80px]",
        isModified && "bg-amber-50 dark:bg-amber-950/20 ring-1 ring-amber-300 dark:ring-amber-700",
        readOnly && "opacity-60"
      )}
    >
      <div className="flex gap-1.5">
        {PERM_LABELS.map(({ key, label }) => (
          <div key={key} className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] font-mono text-muted-foreground uppercase">{label}</span>
            <Checkbox
              checked={perms[key]}
              onCheckedChange={() => toggle(key)}
              disabled={readOnly}
              className="h-4 w-4"
              aria-label={key}
            />
          </div>
        ))}
      </div>
      {perms.ownDataOnly && (
        <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
          solo propios
        </span>
      )}
    </div>
  )
}
