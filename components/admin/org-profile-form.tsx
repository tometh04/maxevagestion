"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { TAX_CATEGORIES } from "@/lib/admin/constants"
import {
  computeProfileCompletion,
  PROFILE_FIELD_COUNT,
} from "@/lib/admin/profile-completion"
import { ProfileBadge } from "./profile-badge"

type ProfileFields = {
  contact_name: string | null
  contact_phone: string | null
  internal_notes: string | null
  address_street: string | null
  address_city: string | null
  address_province: string | null
  address_country: string | null
  address_postal_code: string | null
  tax_category: string | null
  cuit: string | null
  billing_email: string | null
  billing_name: string | null
}

type Props = {
  orgId: string
  initial: ProfileFields
  onCancel: () => void
  onSaved: () => void
}

export function OrgProfileForm({ orgId, initial, onCancel, onSaved }: Props) {
  const router = useRouter()
  const [values, setValues] = React.useState<ProfileFields>(initial)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const completion = computeProfileCompletion(values)

  function set<K extends keyof ProfileFields>(key: K, v: ProfileFields[K]) {
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/profile`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      router.refresh()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Editando perfil</h3>
        <ProfileBadge completion={completion} />
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Razón social (billing_name)">
          <Input value={values.billing_name ?? ""} onChange={(e) => set("billing_name", e.target.value)} />
        </Field>
        <Field label="CUIT">
          <Input
            value={values.cuit ?? ""}
            onChange={(e) => set("cuit", e.target.value)}
            placeholder="30123456789"
          />
        </Field>
        <Field label="Condición fiscal">
          <Select
            value={values.tax_category ?? ""}
            onValueChange={(v) => set("tax_category", v || null)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {TAX_CATEGORIES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Email facturación">
          <Input
            type="email"
            value={values.billing_email ?? ""}
            onChange={(e) => set("billing_email", e.target.value)}
          />
        </Field>
        <Field label="Contacto (nombre)">
          <Input value={values.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} />
        </Field>
        <Field label="Contacto (teléfono / WhatsApp)">
          <Input
            value={values.contact_phone ?? ""}
            onChange={(e) => set("contact_phone", e.target.value)}
            placeholder="+54 9 ..."
          />
        </Field>
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase text-slate-400 mb-2">Dirección fiscal</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Calle y número">
            <Input value={values.address_street ?? ""} onChange={(e) => set("address_street", e.target.value)} />
          </Field>
          <Field label="Ciudad">
            <Input value={values.address_city ?? ""} onChange={(e) => set("address_city", e.target.value)} />
          </Field>
          <Field label="Provincia">
            <Input value={values.address_province ?? ""} onChange={(e) => set("address_province", e.target.value)} />
          </Field>
          <Field label="Código postal">
            <Input value={values.address_postal_code ?? ""} onChange={(e) => set("address_postal_code", e.target.value)} />
          </Field>
          <Field label="País (ISO2)">
            <Input
              value={values.address_country ?? "AR"}
              onChange={(e) => set("address_country", e.target.value.toUpperCase())}
              maxLength={2}
            />
          </Field>
        </div>
      </section>

      <section className="rounded border border-amber-500/30 bg-amber-500/5 p-4">
        <h4 className="text-xs font-semibold uppercase text-amber-300 mb-2">
          Notas internas · solo admin
        </h4>
        <Textarea
          value={values.internal_notes ?? ""}
          onChange={(e) => set("internal_notes", e.target.value)}
          rows={4}
          placeholder="Cualquier nota relevante para el equipo platform..."
        />
      </section>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando..." : "Guardar"}
        </Button>
      </div>

      <div className="text-xs text-slate-500">
        Completitud actual: {completion}/{PROFILE_FIELD_COUNT}
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-400">{label}</Label>
      {children}
    </div>
  )
}
