import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

const ALLOWED_FIELDS = [
  "contact_name",
  "contact_phone",
  "internal_notes",
  "address_street",
  "address_city",
  "address_province",
  "address_country",
  "address_postal_code",
  "tax_category",
  "cuit",
  "billing_email",
  "billing_name",
] as const

const VALID_TAX = new Set([
  "RESPONSABLE_INSCRIPTO",
  "MONOTRIBUTO",
  "EXENTO",
  "CONSUMIDOR_FINAL",
  "NO_RESPONSABLE",
])

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

  const patch: Record<string, string | null> = {}
  for (const key of ALLOWED_FIELDS) {
    if (!(key in body)) continue
    const v = body[key]
    if (v !== null && typeof v !== "string") {
      return NextResponse.json({ error: `Invalid value for ${key}` }, { status: 400 })
    }
    patch[key] = v as string | null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  // Validaciones
  if (patch.cuit) {
    const stripped = patch.cuit.replace(/[-\s]/g, "")
    if (!/^\d{11}$/.test(stripped)) {
      return NextResponse.json({ error: "CUIT debe tener 11 dígitos" }, { status: 400 })
    }
    patch.cuit = stripped
  }

  if (patch.tax_category && !VALID_TAX.has(patch.tax_category)) {
    return NextResponse.json({ error: "tax_category inválida" }, { status: 400 })
  }

  if (patch.address_country) {
    const cc = patch.address_country.toUpperCase()
    if (!/^[A-Z]{2}$/.test(cc)) {
      return NextResponse.json(
        { error: "address_country debe ser ISO 2 letras" },
        { status: 400 },
      )
    }
    patch.address_country = cc
  }

  const admin = createAdminClient()

  // Snapshot before
  const { data: before } = await (admin.from("organizations") as any)
    .select(ALLOWED_FIELDS.join(","))
    .eq("id", orgId)
    .maybeSingle()

  if (!before) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  // Update
  const { data: updated, error } = await (admin.from("organizations") as any)
    .update(patch)
    .eq("id", orgId)
    .select("*")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit
  const changed_fields = Object.keys(patch)
  const before_subset: Record<string, unknown> = {}
  const after_subset: Record<string, unknown> = {}
  for (const k of changed_fields) {
    before_subset[k] = (before as any)[k]
    after_subset[k] = (updated as any)[k]
  }

  logSecurityEvent({
    eventType: "ORG_PROFILE_UPDATED_BY_ADMIN",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    // target_org_id used intentionally to match audit schema column name
    target_org_id: orgId,
    requestPath: req.url,
    details: { changed_fields, before: before_subset, after: after_subset },
  } as any)

  return NextResponse.json({ ok: true, profile: updated })
}
