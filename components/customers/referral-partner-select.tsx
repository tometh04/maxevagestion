"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Plus, X, Users2 } from "lucide-react"
import { toast } from "sonner"

/**
 * Selector de socio referidor para el cliente (VIB-62).
 *
 * Marca al cliente como "REFERIDO" eligiendo de quién viene. Permite crear un
 * referidor nuevo en línea (nombre + % por defecto) sin salir del alta del
 * cliente. El % opcional sobreescribe el default del partner para este cliente.
 *
 * Es controlado: el dialog dueño mantiene el estado y lo manda en el submit.
 */

export interface ReferralPartner {
  id: string
  name: string
  default_commission_percentage: number
}

export interface ReferralValue {
  referralPartnerId: string | null
  referralCommissionPercentage: string
}

const NONE = "__none__"

export function ReferralPartnerSelect({
  value,
  onChange,
}: {
  value: ReferralValue
  onChange: (next: ReferralValue) => void
}) {
  const [partners, setPartners] = useState<ReferralPartner[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPct, setNewPct] = useState("")

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch("/api/referral-partners")
      .then((r) => (r.ok ? r.json() : { partners: [] }))
      .then((data) => {
        if (active) setPartners(data.partners ?? [])
      })
      .catch(() => {
        if (active) setPartners([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const selected = partners.find((p) => p.id === value.referralPartnerId) || null

  const handleSelect = (v: string) => {
    if (v === NONE) {
      onChange({ referralPartnerId: null, referralCommissionPercentage: "" })
      setShowCreate(false)
      return
    }
    if (v === "__create__") {
      setShowCreate(true)
      return
    }
    onChange({ referralPartnerId: v, referralCommissionPercentage: value.referralCommissionPercentage })
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) {
      toast.error("Ingresá el nombre del referidor")
      return
    }
    let pct: number | undefined
    if (newPct.trim() !== "") {
      pct = Number(newPct)
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        toast.error("El porcentaje debe estar entre 0 y 100")
        return
      }
    }
    setCreating(true)
    try {
      const res = await fetch("/api/referral-partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, default_commission_percentage: pct ?? 0 }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "No se pudo crear el referidor")
      }
      const { partner } = await res.json()
      setPartners((prev) => [...prev, partner].sort((a, b) => a.name.localeCompare(b.name)))
      onChange({ referralPartnerId: partner.id, referralCommissionPercentage: value.referralCommissionPercentage })
      setShowCreate(false)
      setNewName("")
      setNewPct("")
      toast.success("Referidor creado")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear el referidor")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
      <div className="flex items-center gap-1.5">
        <Users2 className="h-3.5 w-3.5 text-accent-coral" />
        <span className="text-xs font-medium text-foreground/70">Referido</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Si este cliente viene derivado de otra agencia, seleccioná el referidor. Cada venta
        generará una comisión automática para él (sobre la ganancia).
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium mb-1.5 block">Viene referido de</label>
          <Select
            value={value.referralPartnerId ?? NONE}
            onValueChange={handleSelect}
            disabled={loading}
          >
            <SelectTrigger>
              <SelectValue placeholder={loading ? "Cargando..." : "Sin referido"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin referido</SelectItem>
              {partners.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.default_commission_percentage > 0 ? ` (${p.default_commission_percentage}%)` : ""}
                </SelectItem>
              ))}
              <SelectItem value="__create__">
                <span className="flex items-center gap-1.5 text-primary">
                  <Plus className="h-3.5 w-3.5" /> Nuevo referidor
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {value.referralPartnerId && (
          <div>
            <label className="text-sm font-medium mb-1.5 block">% comisión (opcional)</label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.1"
              placeholder={
                selected && selected.default_commission_percentage > 0
                  ? `Por defecto: ${selected.default_commission_percentage}%`
                  : "Ej: 10"
              }
              value={value.referralCommissionPercentage}
              onChange={(e) =>
                onChange({ ...value, referralCommissionPercentage: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground mt-1">
              Vacío = usar el % por defecto del referidor.
            </p>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="rounded-lg border border-border/50 bg-background p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Nuevo referidor</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setShowCreate(false)}
              disabled={creating}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nombre *</label>
              <Input
                placeholder="Agencia XYZ"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">% por defecto</label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.1"
                placeholder="Ej: 10"
                value={newPct}
                onChange={(e) => setNewPct(e.target.value)}
              />
            </div>
          </div>
          <Button type="button" size="sm" onClick={handleCreate} disabled={creating}>
            {creating ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Creando...
              </>
            ) : (
              "Crear referidor"
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
