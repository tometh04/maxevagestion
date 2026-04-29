"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  computeProfileCompletion,
  PROFILE_FIELD_COUNT,
} from "@/lib/admin/profile-completion"
import { ProfileBadge } from "./profile-badge"
import { OrgProfileForm } from "./org-profile-form"

export type TenantSettings = {
  company_name: string | null
  tax_id: string | null
  legajo: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  instagram: string | null
}

type Props = {
  orgId: string
  settings: TenantSettings
  internalNotes: string | null
}

export function OrgProfileCard({ orgId, settings, internalNotes }: Props) {
  const [editing, setEditing] = React.useState(false)
  const completion = computeProfileCompletion(settings)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">Perfil de la agencia</CardTitle>
        <div className="flex items-center gap-3">
          <ProfileBadge completion={completion} />
          {!editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Editar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <OrgProfileForm
            orgId={orgId}
            initialSettings={settings}
            initialInternalNotes={internalNotes}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <ReadView settings={settings} internalNotes={internalNotes} completion={completion} />
        )}
      </CardContent>
    </Card>
  )
}

function ReadView({
  settings,
  internalNotes,
  completion,
}: {
  settings: TenantSettings
  internalNotes: string | null
  completion: number
}) {
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
        <Row label="Razón social" value={settings.company_name} />
        <Row label="CUIT / Tax ID" value={settings.tax_id} />
        <Row label="Legajo" value={settings.legajo} />
        <Row label="Email" value={settings.email} />
        <Row label="Teléfono" value={settings.phone} />
        <Row label="Sitio web" value={settings.website} />
        <Row label="Instagram" value={settings.instagram} />
        <Row label="Dirección" value={settings.address} colSpan={2} />
      </section>

      <section className="rounded border border-amber-500/30 bg-amber-500/5 p-4">
        <h4 className="text-xs font-semibold uppercase text-amber-300 mb-2">
          Notas internas · solo admin
        </h4>
        <p className="text-sm text-slate-300 whitespace-pre-wrap">
          {internalNotes ?? <span className="text-slate-500">Sin notas</span>}
        </p>
      </section>

      <div className="text-xs text-slate-500">
        Completitud: {completion}/{PROFILE_FIELD_COUNT}
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  colSpan,
}: {
  label: string
  value: string | null
  colSpan?: 2
}) {
  return (
    <div className={colSpan === 2 ? "md:col-span-2" : undefined}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm text-slate-200">
        {value ?? <span className="text-slate-500">—</span>}
      </div>
    </div>
  )
}
