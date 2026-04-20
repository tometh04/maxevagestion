import { createServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// GET — Datos de branding públicos (sin auth)
export async function GET() {
  try {
    const supabase: any = await createServerClient()

    const { data, error } = await supabase
      .from("organization_settings")
      .select("key, value")

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
