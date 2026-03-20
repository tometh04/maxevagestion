import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { id } = await params
  
  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from("wa_devices")
    .select("qr_value, status, phone_number")
    .eq("id", id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    qr: data?.qr_value || null,
    status: data?.status || "UNKNOWN",
    phoneNumber: data?.phone_number || null,
  })
}
