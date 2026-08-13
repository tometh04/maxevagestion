"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Users2 } from "lucide-react"

/**
 * Selector de socio referidor para el cliente (VIB-62).
 *
 * Marca al cliente como "REFERIDO" eligiendo de quién viene.
 *
 * VIB-86: para el vendedor esto es un selector de nombres y nada más. No ve el
 * porcentaje que se lleva el referidor, no puede sobreescribirlo y no puede dar
 * de alta referidores nuevos: eso se hace desde la pantalla de Referidos.
 *
 * Lo que decide qué se muestra es el servidor, no este componente:
 * `GET /api/referral-partners` proyecta solo id y nombre para quien no tiene
 * `referrals.read`, y devuelve `canManage` para el resto. Esconder un campo
 * dejando la API abierta no sería un permiso.
 *
 * Es controlado: el dialog dueño mantiene el estado y lo manda en el submit.
 */

export interface ReferralPartner {
  id: string
  name: string
  /** Solo llega a quien puede ver las comisiones de referidos. */
  default_commission_percentage?: number
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
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch("/api/referral-partners")
      .then((r) => (r.ok ? r.json() : { partners: [], canManage: false }))
      .then((data) => {
        if (!active) return
        setPartners(data.partners ?? [])
        setCanManage(Boolean(data.canManage))
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
  const defaultPct = selected?.default_commission_percentage ?? 0

  const handleSelect = (v: string) => {
    if (v === NONE) {
      onChange({ referralPartnerId: null, referralCommissionPercentage: "" })
      return
    }
    onChange({
      referralPartnerId: v,
      referralCommissionPercentage: value.referralCommissionPercentage,
    })
  }

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
      <div className="flex items-center gap-1.5">
        <Users2 className="h-3.5 w-3.5 text-accent-coral" />
        <span className="text-xs font-medium text-foreground/70">Referido</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Si este cliente viene derivado de otra agencia, seleccioná el referidor.
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
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!loading && partners.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {canManage
                ? "Todavía no hay referidores cargados. Se dan de alta en la pantalla de Referidos."
                : "Todavía no hay referidores cargados. Pedile a un administrador que los cargue."}
            </p>
          )}
        </div>

        {canManage && value.referralPartnerId && (
          <div>
            <label className="text-sm font-medium mb-1.5 block">% comisión (opcional)</label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.1"
              placeholder={defaultPct > 0 ? `Por defecto: ${defaultPct}%` : "Ej: 10"}
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
    </div>
  )
}
