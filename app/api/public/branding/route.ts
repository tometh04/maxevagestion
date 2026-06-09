import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// GET — Datos de branding públicos (sin auth)
// Requiere ?token=<public_token> para scopear al org correcto
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")

    // Admin client requerido: endpoint público sin sesión de usuario, RLS bloquearía la query
    const supabase: any = createAdminClient()

    let orgId: string | null = null

    if (token) {
      const { data: quotation } = await supabase
        .from("quotations")
        .select("org_id")
        .eq("public_token", token)
        .single()
      orgId = quotation?.org_id ?? null
    }

    if (!orgId) {
      return Response.json({ data: {} })
    }

    const { data, error } = await supabase
      .from("organization_settings")
      .select("key, value")
      .eq("org_id", orgId)

    if (error || !data) {
      return Response.json({ data: {} })
    }

    // Convertir array a objeto y solo exponer datos de branding
    const settings: Record<string, string> = {}
    const allowedKeys = [
      "brand_logo",
      "company_name",
      "brand_color",
      "company_address",
      "company_phone",
      "company_email",
      "company_website",
      "company_instagram",
      "company_legajo",
      "company_tax_id",
      "legajo",
      "tax_id",
      "address",
      "phone",
      "email",
      "website",
      "instagram",
      "pdf_terms_text",
    ]

    for (const item of data) {
      if (allowedKeys.includes(item.key)) {
        settings[item.key] = item.value
      }
    }

    return Response.json({ data: settings })
  } catch {
    return Response.json({ data: {} })
  }
}
