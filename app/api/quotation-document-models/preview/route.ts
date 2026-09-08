import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import {
  QuotationAuthoringError,
  assertAgencyAuthoringScope,
  previewQuotationModel,
} from "@/lib/quotation-documents/authoring-server"

const schema = z.object({ agency_id: z.string().uuid(), manifest: z.unknown() }).strict()

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 })
    const { user } = await getCurrentUser()
    if (!user.org_id) return NextResponse.json({ error: "Usuario sin organización" }, { status: 403 })
    const supabase = await createServerClient()
    const scope = await resolveAgencyPermissionScope(supabase, user, "settings", "write")
    if (!scope.agencyIds.includes(parsed.data.agency_id)) {
      return NextResponse.json({ error: "No tiene permiso para administrar modelos" }, { status: 403 })
    }
    const agency = await assertAgencyAuthoringScope({
      supabase,
      orgId: user.org_id,
      agencyId: parsed.data.agency_id,
      allowedAgencyIds: scope.agencyIds,
    })
    const { data: settings, error: settingsError } = await supabase
      .from("organization_settings")
      .select("key, value")
      .eq("org_id", user.org_id)
      .in("key", ["company_name", "brand_logo", "logo_url", "brand_logo_url"])
    if (settingsError) throw settingsError
    const branding = Object.fromEntries((settings || []).map(row => [row.key, typeof row.value === "string" ? row.value : ""]))
    const preview = await previewQuotationModel({
      manifest: parsed.data.manifest,
      agencyId: agency.id,
      agencyName: branding.company_name || agency.name,
      agencyLogoUrl: branding.brand_logo || branding.logo_url || branding.brand_logo_url,
    })
    return NextResponse.json({ document: { html: preview.html, pageCount: preview.pageCount } })
  } catch (error) {
    if ((error as { digest?: string })?.digest === "NEXT_REDIRECT") throw error
    if (error instanceof QuotationAuthoringError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : error.code === "INVALID" ? 400 : 500
      return NextResponse.json({ error: error.message }, { status })
    }
    console.error("[quotation-model-preview] unexpected error", error)
    return NextResponse.json({ error: "No se pudo generar la vista previa" }, { status: 500 })
  }
}
