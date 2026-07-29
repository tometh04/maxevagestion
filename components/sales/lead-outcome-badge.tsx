"use client"

import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { resolveLeadResolution, type LeadResolutionLabel } from "@/lib/leads/outcome"

interface LeadOutcomeBadgeProps {
  outcome?: string | null
  status?: string | null
  /**
   * Si se conoce el estado de operación del lead, se distingue venta real vs
   * manual. Si es undefined (ej. tarjetas del tablero que no cargan las
   * operaciones), se muestra un badge grueso "Venta" sin la distinción.
   */
  hasOperation?: boolean
  className?: string
}

const BADGE_STYLES: Record<LeadResolutionLabel, string> = {
  Venta: "bg-success/15 text-success border-success/30",
  "Venta sin operación": "bg-accent-sand/20 text-foreground border-accent-sand/40",
  Descartado: "bg-muted text-muted-foreground border-border",
}

const BADGE_ICONS: Record<LeadResolutionLabel, typeof CheckCircle2> = {
  Venta: CheckCircle2,
  "Venta sin operación": AlertTriangle,
  Descartado: XCircle,
}

/**
 * Badge del resultado (outcome) de un lead: Venta / Venta sin operación /
 * Descartado. No renderiza nada si el lead sigue abierto.
 */
export function LeadOutcomeBadge({ outcome, status, hasOperation, className }: LeadOutcomeBadgeProps) {
  let label: LeadResolutionLabel | null

  if (typeof hasOperation === "boolean") {
    label = resolveLeadResolution({ outcome, status, hasOperation }).label
  } else {
    // Sin conocer la operación: badge grueso.
    if (outcome === "SALE") label = "Venta"
    else if (outcome === "DISCARDED" || status === "LOST") label = "Descartado"
    else label = null
  }

  if (!label) return null

  const Icon = BADGE_ICONS[label]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        BADGE_STYLES[label],
        className
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {label}
    </span>
  )
}
