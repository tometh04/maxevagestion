"use client"

// Conciliación bancaria (VIB-137): badge + menú para marcar en qué situación
// está un movimiento respecto del extracto del banco. Es informativo: no toca
// montos, saldos ni el asiento contable.
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CheckCircle2, HelpCircle, Clock, Loader2, Minus } from "lucide-react"
import { toast } from "sonner"

export type ReconciliationStatus = "PENDING" | "UNIDENTIFIED" | "RECONCILED" | null

const CONFIG: Record<
  Exclude<ReconciliationStatus, null>,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  PENDING: {
    label: "Pendiente",
    icon: Clock,
    className: "bg-warning/10 text-warning border-warning/20",
  },
  UNIDENTIFIED: {
    label: "Sin identificar",
    icon: HelpCircle,
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  RECONCILED: {
    label: "Conciliado",
    icon: CheckCircle2,
    className: "bg-success/10 text-success border-success/20",
  },
}

type Props = {
  movementId: string
  status: ReconciliationStatus
  /** Sin permiso de caja: se muestra el estado pero no se puede cambiar */
  disabled?: boolean
  onChanged?: (status: ReconciliationStatus) => void
}

export function CashMovementReconciliation({ movementId, status, disabled, onChanged }: Props) {
  const [current, setCurrent] = useState<ReconciliationStatus>(status)
  const [busy, setBusy] = useState(false)

  async function setStatus(next: ReconciliationStatus) {
    if (next === current) return
    setBusy(true)
    const previous = current
    // Optimista: el usuario concilia muchos movimientos seguidos y esperar el
    // round-trip en cada uno hace el flujo pesado.
    setCurrent(next)
    try {
      const res = await fetch(`/api/cash-movements/${movementId}/reconciliation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      onChanged?.(next)
    } catch (e: any) {
      setCurrent(previous)
      toast.error(e.message || "No se pudo actualizar la conciliación")
    } finally {
      setBusy(false)
    }
  }

  const cfg = current ? CONFIG[current] : null
  const Icon = cfg?.icon

  const trigger = cfg ? (
    <Badge variant="outline" className={`${cfg.className} cursor-pointer whitespace-nowrap`}>
      {busy ? (
        <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
      ) : (
        Icon && <Icon className="h-2.5 w-2.5 mr-1" />
      )}
      {cfg.label}
    </Badge>
  ) : (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Conciliar"}
    </Button>
  )

  if (disabled) {
    return cfg ? (
      <Badge variant="outline" className={`${cfg.className} whitespace-nowrap`}>
        {Icon && <Icon className="h-2.5 w-2.5 mr-1" />}
        {cfg.label}
      </Badge>
    ) : (
      <span className="text-xs text-muted-foreground">-</span>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={busy}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs">Conciliación bancaria</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setStatus("RECONCILED")}>
          <CheckCircle2 className="h-3.5 w-3.5 mr-2 text-success" />
          Conciliado
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setStatus("PENDING")}>
          <Clock className="h-3.5 w-3.5 mr-2 text-warning" />
          Pendiente
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setStatus("UNIDENTIFIED")}>
          <HelpCircle className="h-3.5 w-3.5 mr-2 text-destructive" />
          Sin identificar
        </DropdownMenuItem>
        {current && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setStatus(null)}>
              <Minus className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              Quitar marca
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
