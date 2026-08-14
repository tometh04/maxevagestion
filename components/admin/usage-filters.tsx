"use client"

import { useRouter, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { USAGE_ROLES, USAGE_ROLE_LABELS } from "@/lib/analytics/roles"

type Option = { id: string; name: string }

type Props = {
  orgs: Option[]
  /** Agencias de la org elegida. Vacío si no hay ninguna elegida. */
  agencies: Option[]
}

/**
 * Filtros de `/admin/usage`. Mismo patrón que `orgs-filters.tsx`: todo el estado
 * vive en la query string, cero `useState`.
 *
 * Diferencia con aquel: las opciones no son constantes, vienen del server. Las
 * organizaciones y agencias son datos, no un enum.
 */
export function UsageFilters({ orgs, agencies }: Props) {
  const router = useRouter()
  const search = useSearchParams()

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(search?.toString() ?? "")
    if (value && value !== "ALL") params.set(key, value)
    else params.delete(key)

    // Una agencia no significa nada fuera de su org: si cambia la org, el
    // filtro de agencia que venía seleccionado deja de tener sentido.
    if (key === "org") params.delete("agency")

    router.push(`/admin/usage?${params.toString()}`)
  }

  const org = search?.get("org") ?? "ALL"
  const agency = search?.get("agency") ?? "ALL"
  const role = search?.get("role") ?? "ALL"

  return (
    <div className="flex flex-wrap items-end gap-4">
      <FilterSelect
        label="Organización"
        value={org}
        width="w-[220px]"
        options={[
          { value: "ALL", label: "Todas" },
          ...orgs.map((o) => ({ value: o.id, label: o.name })),
        ]}
        onChange={(v) => setParam("org", v)}
      />

      <FilterSelect
        label="Agencia"
        value={agency}
        width="w-[200px]"
        disabled={org === "ALL"}
        options={[
          { value: "ALL", label: org === "ALL" ? "Elegí una org" : "Todas" },
          ...agencies.map((a) => ({ value: a.id, label: a.name })),
          // Explícito y no escondido: entre un tercio y la mitad de los eventos
          // no tienen agencia (los roles de alcance org no están en
          // `user_agencies`, y contabilidad y comisiones no son por sucursal).
          // Sin esta opción, el filtro parece haber perdido eventos.
          { value: "none", label: "Sin agencia" },
        ]}
        onChange={(v) => setParam("agency", v)}
      />

      <FilterSelect
        label="Rol"
        value={role}
        width="w-[180px]"
        options={[
          { value: "ALL", label: "Todos" },
          ...USAGE_ROLES.map((r) => ({ value: r, label: USAGE_ROLE_LABELS[r] })),
        ]}
        onChange={(v) => setParam("role", v)}
      />
    </div>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  width = "w-[160px]",
  disabled,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  width?: string
  disabled?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={`h-8 ${width} text-xs`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
