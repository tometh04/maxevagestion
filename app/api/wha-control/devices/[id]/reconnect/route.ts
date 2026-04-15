import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { callConnector } from "@/lib/wha-control/connector-client"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { id } = await params

  const supabase = createAdminClient() as any

  // Mark as reconnecting before calling connector
  await supabase
    .from("wa_devices")
    .update({ status: "RECONNECTING" })
    .eq("id", id)

  const result = await callConnector(`/devices/${id}/start`, "POST")

  if (!result.ok) {
    // Revert to disconnected if connector failed
    await supabase
      .from("wa_devices")
      .update({ status: "DISCONNECTED" })
      .eq("id", id)

    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true })
}
