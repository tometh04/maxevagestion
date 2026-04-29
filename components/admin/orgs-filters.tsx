"use client"

import { useRouter, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  ORG_PLANS,
  ORG_SUBSCRIPTION_STATUSES,
} from "@/lib/admin/constants"

export function OrgsFilters() {
  const router = useRouter()
  const search = useSearchParams()

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(search?.toString() ?? "")
    if (value && value !== "ALL") {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete("page")
    router.push(`/admin/orgs?${params.toString()}`)
  }

  function toggleParam(key: string, checked: boolean) {
    const params = new URLSearchParams(search?.toString() ?? "")
    if (checked) {
      params.set(key, "true")
    } else {
      params.delete(key)
    }
    params.delete("page")
    router.push(`/admin/orgs?${params.toString()}`)
  }

  const status = search?.get("status") ?? "ALL"
  const plan = search?.get("plan") ?? "ALL"
  const completion = search?.get("completion") ?? "ALL"
  const hasCustomPlan = search?.get("has_custom_plan") === "true"
  const hasPreapproval = search?.get("has_preapproval") === "true"

  return (
    <div className="flex flex-wrap items-center gap-4">
      <FilterSelect
        label="Status"
        value={status}
        options={[
          { value: "ALL", label: "Todos" },
          ...ORG_SUBSCRIPTION_STATUSES.map((s) => ({ value: s, label: s })),
        ]}
        onChange={(v) => setParam("status", v)}
      />
      <FilterSelect
        label="Plan"
        value={plan}
        options={[
          { value: "ALL", label: "Todos" },
          ...ORG_PLANS.map((p) => ({ value: p, label: p })),
          { value: "CUSTOM", label: "CUSTOM (custom_plan_id IS NOT NULL)" },
        ]}
        onChange={(v) => setParam("plan", v)}
      />
      <FilterSelect
        label="Perfil"
        value={completion}
        options={[
          { value: "ALL", label: "Todos" },
          { value: "empty", label: "Vacío" },
          { value: "partial", label: "Parcial" },
          { value: "complete", label: "Completo" },
        ]}
        onChange={(v) => setParam("completion", v)}
      />

      <div className="flex items-center gap-4 ml-2">
        <CheckRow
          id="has_custom_plan"
          label="Con custom plan"
          checked={hasCustomPlan}
          onChange={(c) => toggleParam("has_custom_plan", c)}
        />
        <CheckRow
          id="has_preapproval"
          label="Con MP preapproval"
          checked={hasPreapproval}
          onChange={(c) => toggleParam("has_preapproval", c)}
        />
      </div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-slate-400">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function CheckRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (c: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChange(Boolean(c))} />
      <Label htmlFor={id} className="text-xs text-slate-300 cursor-pointer">
        {label}
      </Label>
    </div>
  )
}
