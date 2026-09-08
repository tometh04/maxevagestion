import { NextResponse } from "next/server"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import OpenAI from "openai"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import { assertAgencyAuthoringScope, QuotationAuthoringError } from "@/lib/quotation-documents/authoring-server"
import { interpretQuotationDesign } from "@/lib/quotation-documents/import-design"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) return NextResponse.json({ error: "Usuario sin organización" }, { status: 403 })
    if (Number(request.headers.get("content-length")) > 11 * 1024 * 1024) {
      return NextResponse.json({ error: "El PDF debe pesar hasta 10 MB." }, { status: 413 })
    }
    const supabase = await createServerClient()
    const scope = await resolveAgencyPermissionScope(supabase, user, "settings", "write")
    if (!scope.agencyIds.length) return NextResponse.json({ error: "No tiene permiso para administrar modelos" }, { status: 403 })
    const data = await request.formData()
    const agencyId = z.string().uuid().safeParse(data.get("agency_id"))
    const file = data.get("file")
    if (!agencyId.success || !(file instanceof File) || file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Elegí una agencia y un PDF de hasta 10 MB." }, { status: 400 })
    }
    await assertAgencyAuthoringScope({ supabase, orgId: user.org_id, agencyId: agencyId.data, allowedAgencyIds: scope.agencyIds })
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "La interpretación de modelos no está disponible en este momento." }, { status: 503 })
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000, maxRetries: 0 })
    const manifest = await interpretQuotationDesign(new Uint8Array(await file.arrayBuffer()), openai)
    return NextResponse.json({ manifest }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (isRedirectError(error)) throw error
    if (error instanceof QuotationAuthoringError) {
      return NextResponse.json({ error: error.message }, { status: error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400 })
    }
    return NextResponse.json({ error: "No pudimos interpretar el PDF. Volvé a intentarlo." }, { status: 502 })
  }
}
