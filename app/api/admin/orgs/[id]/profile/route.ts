import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

const TENANT_SETTING_KEYS = [
  "company_name",
  "tax_id",
  "legajo",
  "address",
  "phone",
  "email",
  "website",
  "instagram",
] as const

type TenantSettingKey = (typeof TENANT_SETTING_KEYS)[number]

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orgId } = await params

  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Parse settings object
  const rawSettings = typeof body.settings === "object" && body.settings !== null
    ? (body.settings as Record<string, unknown>)
    : {}

  const settingsPatch: Partial<Record<TenantSettingKey, string | null>> = {}
  for (const key of TENANT_SETTING_KEYS) {
    if (!(key in rawSettings)) continue
    const v = rawSettings[key]
    if (v !== null && typeof v !== "string") {
      return NextResponse.json({ error: `Invalid value for settings.${key}` }, { status: 400 })
    }
    settingsPatch[key] = v as string | null
  }

  // Parse internal_notes
  let internalNotesPatch: string | null | undefined = undefined
  if ("internal_notes" in body) {
    const v = body.internal_notes
    if (v !== null && typeof v !== "string") {
      return NextResponse.json({ error: "Invalid value for internal_notes" }, { status: 400 })
    }
    internalNotesPatch = v as string | null
  }

  const hasSettings = Object.keys(settingsPatch).length > 0
  const hasInternalNotes = internalNotesPatch !== undefined

  if (!hasSettings && !hasInternalNotes) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  // Validate tax_id (CUIT: 11 digits AR)
  if (settingsPatch.tax_id) {
    const stripped = settingsPatch.tax_id.replace(/[-\s]/g, "")
    if (!/^\d{11}$/.test(stripped)) {
      return NextResponse.json({ error: "CUIT debe tener 11 dígitos" }, { status: 400 })
    }
    settingsPatch.tax_id = stripped
  }

  const admin = createAdminClient()

  // Verify org exists
  const { data: orgExists } = await (admin.from("organizations") as any)
    .select("id, internal_notes")
    .eq("id", orgId)
    .maybeSingle()

  if (!orgExists) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  // Snapshot of settings before
  const settingKeys = Object.keys(settingsPatch) as TenantSettingKey[]
  const allKeysToFetch = [
    ...settingKeys,
    // Also fetch aliases for before snapshot
    ...settingKeys.flatMap((k) => (k === "address" ? ["company_address"] : [])),
  ]

  const beforeSettingsMap: Record<string, string | null> = {}
  if (allKeysToFetch.length > 0) {
    const { data: beforeRows } = await (admin.from("organization_settings") as any)
      .select("key, value")
      .eq("org_id", orgId)
      .in("key", allKeysToFetch)
    for (const row of (beforeRows ?? [])) {
      beforeSettingsMap[row.key] = row.value
    }
  }

  // Upsert settings into organization_settings
  if (hasSettings) {
    const now = new Date().toISOString()
    const upsertRows: { org_id: string; key: string; value: string | null; updated_at: string }[] = []

    for (const [key, value] of Object.entries(settingsPatch) as [TenantSettingKey, string | null][]) {
      upsertRows.push({ org_id: orgId, key, value, updated_at: now })
      // Sync address/company_address (same as tenant API)
      if (key === "address") {
        upsertRows.push({ org_id: orgId, key: "company_address", value, updated_at: now })
      }
    }

    const { error: upsertError } = await (admin.from("organization_settings") as any)
      .upsert(upsertRows, { onConflict: "org_id,key" })

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }
  }

  // Update internal_notes in organizations table
  let afterInternalNotes = orgExists.internal_notes
  if (hasInternalNotes) {
    const { error: notesError } = await (admin.from("organizations") as any)
      .update({ internal_notes: internalNotesPatch })
      .eq("id", orgId)

    if (notesError) {
      return NextResponse.json({ error: notesError.message }, { status: 500 })
    }
    afterInternalNotes = internalNotesPatch
  }

  // Snapshot after settings
  const afterSettingsMap: Record<string, string | null> = {}
  if (settingKeys.length > 0) {
    const { data: afterRows } = await (admin.from("organization_settings") as any)
      .select("key, value")
      .eq("org_id", orgId)
      .in("key", settingKeys)
    for (const row of (afterRows ?? [])) {
      afterSettingsMap[row.key] = row.value
    }
  }

  // Build changed_fields list
  const changed_fields: string[] = [
    ...settingKeys.map((k) => `settings.${k}`),
    ...(hasInternalNotes ? ["internal_notes"] : []),
  ]

  const before: Record<string, unknown> = {
    ...Object.fromEntries(settingKeys.map((k) => [`settings.${k}`, beforeSettingsMap[k] ?? null])),
    ...(hasInternalNotes ? { internal_notes: orgExists.internal_notes } : {}),
  }
  const after: Record<string, unknown> = {
    ...Object.fromEntries(settingKeys.map((k) => [`settings.${k}`, afterSettingsMap[k] ?? null])),
    ...(hasInternalNotes ? { internal_notes: afterInternalNotes } : {}),
  }

  logSecurityEvent({
    eventType: "ORG_PROFILE_UPDATED_BY_ADMIN",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "organizations",
    targetEntityId: orgId,
    requestPath: req.url,
    details: { changed_fields, before, after },
  })

  return NextResponse.json({ ok: true })
}
