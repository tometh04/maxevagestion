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

  const result = await callConnector(`/devices/${id}/stop`, "POST")

  // Always update DB status regardless of connector response
  const supabase = createAdminClient() as any
  await supabase
    .from("wa_devices")
    .update({ status: "DISCONNECTED" })
    .eq("id", id)

  if (!result.ok) {
    // Device is marked disconnected in DB even if connector failed
    return NextResponse.json({
      ok: true,
      warning: `Dispositivo marcado como desconectado, pero el conector reportó: ${result.error}`,
    })
  }

  return NextResponse.json({ ok: true })
}
