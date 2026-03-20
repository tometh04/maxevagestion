import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { callConnector } from "@/lib/wha-control/connector-client"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { id } = await params
  const supabase = createAdminClient()

  // Stop connector socket first
  await callConnector(`/devices/${id}/stop`, "POST")

  // Soft delete — wa_devices not in generated types yet
  
  const db = supabase as any
  await db.from("wa_devices").update({ is_active: false, status: "DISCONNECTED" }).eq("id", id)

  return NextResponse.json({ ok: true })
}
