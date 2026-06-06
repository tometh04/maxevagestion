import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { callConnector } from "@/lib/wha-control/connector-client"

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
    .eq("org_id", auth.orgId) // SaaS tenant scope
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // For devices waiting for QR, ask the connector for the current QR value.
  // QR codes expire every ~20s so the DB value may already be stale.
  if (data?.status === "PENDING_QR" || data?.status === "RECONNECTING") {
    const connResult = await callConnector(`/devices/${id}/qr`, "GET", undefined, 5000)
    if (connResult.ok && connResult.data?.qr) {
      // Persist fresh QR to DB so subsequent polls work even during brief connector outages
      await supabase
        .from("wa_devices")
        .update({ qr_value: connResult.data.qr })
        .eq("id", id)
        .eq("org_id", auth.orgId)

      return NextResponse.json({
        qr: connResult.data.qr,
        status: connResult.data.status || data?.status || "PENDING_QR",
        phoneNumber: data?.phone_number || null,
      })
    }
    // Connector unavailable or no QR yet — fall through to DB value below
  }

  return NextResponse.json({
    qr: data?.qr_value || null,
    status: data?.status || "UNKNOWN",
    phoneNumber: data?.phone_number || null,
  })
}
