"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  computeProfileCompletion,
  PROFILE_FIELD_COUNT,
} from "@/lib/admin/profile-completion"
import { ProfileBadge } from "./profile-badge"
import type { TenantSettings } from "./org-profile-card"

type Props = {
  orgId: string
  initialSettings: TenantSettings
  initialInternalNotes: string | null
  onCancel: () => void
  onSaved: () => void
}

export function OrgProfileForm({
  orgId,
  initialSettings,
  initialInternalNotes,
  onCancel,
  onSaved,
}: Props) {
  const router = useRouter()
  const [settings, setSettings] = React.useState<TenantSettings>(initialSettings)
  const [internalNotes, setInternalNotes] = React.useState<string>(initialInternalNotes ?? "")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const completion = computeProfileCompletion(settings)

  function setField<K extends keyof TenantSettings>(key: K, v: string) {
    setSettings((prev) => ({ ...prev, [key]: v || null }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/profile`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          settings,
          internal_notes: internalNotes || null,
        }),
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
        <Field label="Nombre de la empresa (Razón social)">
          <Input
            value={settings.company_name ?? ""}
            onChange={(e) => setField("company_name", e.target.value)}
          />
        </Field>
        <Field label="CUIT / Tax ID">
          <Input
            value={settings.tax_id ?? ""}
            onChange={(e) => setField("tax_id", e.target.value)}
            placeholder="30123456789"
          />
        </Field>
        <Field label="Legajo">
          <Input
            value={settings.legajo ?? ""}
            onChange={(e) => setField("legajo", e.target.value)}
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={settings.email ?? ""}
            onChange={(e) => setField("email", e.target.value)}
          />
        </Field>
        <Field label="Teléfono">
          <Input
            value={settings.phone ?? ""}
            onChange={(e) => setField("phone", e.target.value)}
            placeholder="+54 9 ..."
          />
        </Field>
        <Field label="Sitio web">
          <Input
            value={settings.website ?? ""}
            onChange={(e) => setField("website", e.target.value)}
            placeholder="https://..."
          />
        </Field>
        <Field label="Instagram">
          <Input
            value={settings.instagram ?? ""}
            onChange={(e) => setField("instagram", e.target.value)}
            placeholder="@usuario"
          />
        </Field>
        <Field label="Dirección">
          <Input
            value={settings.address ?? ""}
            onChange={(e) => setField("address", e.target.value)}
          />
        </Field>
      </section>

      <section className="rounded border border-amber-500/30 bg-amber-500/5 p-4">
        <h4 className="text-xs font-semibold uppercase text-amber-300 mb-2">
          Notas internas · solo admin
        </h4>
        <Textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
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
