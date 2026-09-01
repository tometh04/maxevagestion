import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  if (!user.org_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Orden inválida" }, { status: 400 })
  }
  const supabase: any = await createServerClient()
  const { data } = await supabase
    .from("quotation_credit_orders")
    .select("id, status, units_snapshot, amount_ars_snapshot, expires_at, approved_at")
    .eq("id", id)
    .eq("org_id", user.org_id)
    .maybeSingle()
  if (!data) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 })
  return NextResponse.json({ order: data }, { headers: { "Cache-Control": "no-store" } })
}
