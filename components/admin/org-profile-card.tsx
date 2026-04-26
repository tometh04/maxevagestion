"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TAX_CATEGORIES } from "@/lib/admin/constants"
import {
  computeProfileCompletion,
  PROFILE_FIELD_COUNT,
} from "@/lib/admin/profile-completion"
import { ProfileBadge } from "./profile-badge"
import { OrgProfileForm } from "./org-profile-form"

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
  profile: ProfileFields
}

export function OrgProfileCard({ orgId, profile }: Props) {
  const [editing, setEditing] = React.useState(false)
  const completion = computeProfileCompletion(profile)

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
            initial={profile}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <ReadView profile={profile} completion={completion} />
        )}
      </CardContent>
    </Card>
  )
}

function ReadView({
  profile,
  completion,
}: {
  profile: ProfileFields
  completion: number
}) {
  const taxLabel =
    TAX_CATEGORIES.find((t) => t.value === profile.tax_category)?.label ?? null

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
        <Row label="Razón social" value={profile.billing_name} />
        <Row label="CUIT" value={profile.cuit} />
        <Row label="Condición fiscal" value={taxLabel} />
        <Row label="Email facturación" value={profile.billing_email} />
        <Row label="Contacto" value={joinContact(profile.contact_name, profile.contact_phone)} />
        <Row
          label="Dirección"
          value={joinAddress(profile)}
          colSpan={2}
        />
      </section>

      <section className="rounded border border-amber-500/30 bg-amber-500/5 p-4">
        <h4 className="text-xs font-semibold uppercase text-amber-300 mb-2">
          Notas internas · solo admin
        </h4>
        <p className="text-sm text-slate-300 whitespace-pre-wrap">
          {profile.internal_notes ?? <span className="text-slate-500">Sin notas</span>}
        </p>
      </section>

      <div className="text-xs text-slate-500">
        Completitud: {completion}/{PROFILE_FIELD_COUNT} (
        {profile.internal_notes ? "con notas internas" : "sin notas internas"})
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

function joinContact(name: string | null, phone: string | null) {
  if (!name && !phone) return null
  return [name, phone].filter(Boolean).join(" · ")
}

function joinAddress(p: ProfileFields) {
  const parts = [
    p.address_street,
    p.address_city,
    p.address_province,
    p.address_country,
    p.address_postal_code,
  ].filter(Boolean)
  return parts.length ? parts.join(", ") : null
}
