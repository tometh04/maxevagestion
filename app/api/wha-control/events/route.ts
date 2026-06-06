import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

/**
 * Webhook receiver for events pushed by the WHA Connector (Railway).
 * The connector calls this endpoint whenever something changes on a device:
 * QR rotation, connection status change, phone number assigned.
 *
 * Auth: Bearer token matching WHA_CONNECTOR_SECRET (same secret the app uses
 * to call the connector — shared secret, no user session involved).
 *
 * Event types:
 *   qr         — new QR generated (data.qr: string)
 *   connected  — device authenticated (data.phoneNumber: string)
 *   disconnected — device session lost
 *   logged_out — device was explicitly logged out
 *   pairing    — QR scanned, waiting for confirmation
 */

interface ConnectorEvent {
  deviceId: string
  event: "qr" | "connected" | "disconnected" | "logged_out" | "pairing"
  data?: {
    qr?: string
    phoneNumber?: string
    reason?: string
  }
}

export async function POST(request: Request) {
  // Validate connector secret — same token the app uses to call the connector
  const secret = process.env.WHA_CONNECTOR_SECRET
  if (!secret) {
    console.error("[wha-events] WHA_CONNECTOR_SECRET not set")
    return NextResponse.json({ error: "Misconfigured" }, { status: 500 })
  }

  const authHeader = request.headers.get("Authorization")
  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    console.warn("[wha-events] Unauthorized event webhook attempt")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: ConnectorEvent
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { deviceId, event, data } = body
  if (!deviceId || !event) {
    return NextResponse.json({ error: "deviceId and event are required" }, { status: 400 })
  }

  const supabase = createAdminClient() as any

  switch (event) {
    case "qr": {
      if (!data?.qr) {
        return NextResponse.json({ error: "data.qr required for qr event" }, { status: 400 })
      }
      const { error } = await supabase
        .from("wa_devices")
        .update({ qr_value: data.qr, status: "PENDING_QR" })
        .eq("id", deviceId)
      if (error) {
        console.error("[wha-events] qr update error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      console.log(`[wha-events] QR updated for device ${deviceId}`)
      break
    }

    case "pairing": {
      const { error } = await supabase
        .from("wa_devices")
        .update({ status: "PAIRING", qr_value: null })
        .eq("id", deviceId)
      if (error) console.error("[wha-events] pairing update error:", error)
      console.log(`[wha-events] Device ${deviceId} pairing`)
      break
    }

    case "connected": {
      const updatePayload: any = {
        status: "CONNECTED",
        qr_value: null,
        last_connection_at: new Date().toISOString(),
      }
      if (data?.phoneNumber) updatePayload.phone_number = data.phoneNumber
      const { error } = await supabase
        .from("wa_devices")
        .update(updatePayload)
        .eq("id", deviceId)
      if (error) {
        console.error("[wha-events] connected update error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      console.log(`[wha-events] Device ${deviceId} connected (${data?.phoneNumber ?? "no phone"})`)
      break
    }

    case "disconnected": {
      const { error } = await supabase
        .from("wa_devices")
        .update({ status: "DISCONNECTED", qr_value: null })
        .eq("id", deviceId)
      if (error) console.error("[wha-events] disconnected update error:", error)
      console.log(`[wha-events] Device ${deviceId} disconnected`)
      break
    }

    case "logged_out": {
      const { error } = await supabase
        .from("wa_devices")
        .update({ status: "LOGGED_OUT", qr_value: null, phone_number: null })
        .eq("id", deviceId)
      if (error) console.error("[wha-events] logged_out update error:", error)
      console.log(`[wha-events] Device ${deviceId} logged out`)
      break
    }

    default:
      return NextResponse.json({ error: `Unknown event: ${event}` }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
