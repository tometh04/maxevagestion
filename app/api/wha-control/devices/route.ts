import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { callConnector } from "@/lib/wha-control/connector-client"

export async function GET() {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response


  const supabase = createAdminClient() as any
  const { data: devices, error } = await supabase
    .from("wa_devices")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrich with live connector status
  const enriched = await Promise.all(
    (devices || []).map(async (device: any) => {
      try {
        const liveStatus = await callConnector(`/devices/${device.id}/status`)
        if (liveStatus?.isRunning && device.status !== "CONNECTED") {
          // Connector says it's running but DB is stale — fix it
          await supabase
            .from("wa_devices")
            .update({ status: "CONNECTED" })
            .eq("id", device.id)
          return { ...device, status: "CONNECTED" }
        }
        if (liveStatus && !liveStatus.isRunning && device.status === "CONNECTED") {
          // DB says connected but connector says it's not running
          await supabase
            .from("wa_devices")
            .update({ status: "DISCONNECTED" })
            .eq("id", device.id)
          return { ...device, status: "DISCONNECTED" }
        }
      } catch {
        // Connector unreachable — fall back to DB status
      }
      return device
    })
  )

  return NextResponse.json({ devices: enriched })
}

export async function POST(request: Request) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const body = await request.json()
  const { displayName } = body

  if (!displayName) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 })
  }

  
  const supabasePost = createAdminClient() as any

  // Create device record
  const { data: device, error } = await supabasePost
    .from("wa_devices")
    .insert({ display_name: displayName, status: "PENDING_QR" })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Tell connector to start the device (begin QR generation)
  await callConnector(`/devices/${device.id}/start`, "POST")

  return NextResponse.json({ device })
}

export async function DELETE(request: Request) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }

  
  const supabaseDel = createAdminClient() as any

  // Stop connector socket first
  await callConnector(`/devices/${id}/stop`, "POST")

  // Soft delete
  await supabaseDel.from("wa_devices").update({ is_active: false }).eq("id", id)

  return NextResponse.json({ ok: true })
}
