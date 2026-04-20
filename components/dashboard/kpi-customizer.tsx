"use client"

import { useState } from "react"
import { Settings2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useToast } from "@/hooks/use-toast"

export type DashboardKpiId = "sales" | "margin" | "debtors" | "debt"

/**
 * Catálogo de KPIs del dashboard. El id es la clave que se guarda en
 * organization_settings.dashboard_hidden_kpis como array JSON:
 * p. ej. ["debt", "debtors"] = ocultar Deuda y Deudores.
 */
export const DASHBOARD_KPIS: Array<{ id: DashboardKpiId; label: string; description: string }> = [
  { id: "sales", label: "Ventas", description: "Suma total del período." },
  { id: "margin", label: "Margen", description: "Ganancia bruta sobre ventas." },
  { id: "debtors", label: "Deudores", description: "Saldo pendiente de clientes." },
  { id: "debt", label: "Deuda", description: "Saldo pendiente a operadores." },
]

interface KpiCustomizerProps {
  hiddenKpis: Set<DashboardKpiId>
  onChange: (next: Set<DashboardKpiId>) => void
}

export function KpiCustomizer({ hiddenKpis, onChange }: KpiCustomizerProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [localHidden, setLocalHidden] = useState<Set<DashboardKpiId>>(hiddenKpis)

  const toggle = (id: DashboardKpiId, visible: boolean) => {
    const next = new Set(localHidden)
    if (visible) next.delete(id)
    else next.add(id)
    setLocalHidden(next)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/settings/organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "dashboard_hidden_kpis",
          value: JSON.stringify(Array.from(localHidden)),
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onChange(localHidden)
      toast({ title: "Preferencias guardadas" })
      setOpen(false)
    } catch (err: any) {
      toast({
        title: "No se pudo guardar",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        if (v) setLocalHidden(hiddenKpis)
        setOpen(v)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-muted-foreground">
          <Settings2 className="h-3.5 w-3.5" />
          Editar KPIs
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-4 border-b border-border/40">
          <p className="text-sm font-semibold">Mostrar KPIs</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Elegí qué cards ver arriba del dashboard.
          </p>
        </div>
        <div className="p-4 space-y-3">
          {DASHBOARD_KPIS.map((k) => {
            const visible = !localHidden.has(k.id)
            return (
              <label
                key={k.id}
                className="flex items-start gap-3 text-sm cursor-pointer"
                htmlFor={`kpi-${k.id}`}
              >
                <Checkbox
                  id={`kpi-${k.id}`}
                  checked={visible}
                  onCheckedChange={(v) => toggle(k.id, v === true)}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium">{k.label}</div>
                  <div className="text-xs text-muted-foreground">{k.description}</div>
                </div>
              </label>
            )
          })}
        </div>
        <div className="flex justify-end gap-2 p-3 border-t border-border/40 bg-muted/20">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Guardar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
