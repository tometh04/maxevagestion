import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: agencyId } = await params
  try {
    const supabase = await createServerClient()
    const { data } = await ((supabase as any).from("agency_settings"))
      .select("data")
      .eq("agency_id", agencyId)
      .maybeSingle()

    return NextResponse.json({ rules: data?.data?.payment_approval_rules ?? [] })
  } catch (error: any) {
    console.error("[payment-approval-rules] GET error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: agencyId } = await params
  const { user } = await getCurrentUser()
  if (!["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const rules = body.rules
    if (!Array.isArray(rules)) {
      return NextResponse.json({ error: "rules debe ser array" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // Upsert agency_settings.data.payment_approval_rules
    const { data: existing } = await ((supabase as any).from("agency_settings"))
      .select("data")
      .eq("agency_id", agencyId)
      .maybeSingle()

    const newData = { ...(existing?.data || {}), payment_approval_rules: rules }

    const { error } = await ((supabase as any).from("agency_settings"))
      .upsert({ agency_id: agencyId, data: newData }, { onConflict: "agency_id" })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rules })
  } catch (error: any) {
    console.error("[payment-approval-rules] PUT error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
