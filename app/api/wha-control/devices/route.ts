import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { callConnector } from "@/lib/wha-control/connector-client"

export async function GET(request: Request) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { searchParams } = new URL(request.url)
  const includeInactive = searchParams.get("includeInactive") === "true"
  const agencyId = searchParams.get("agencyId")

  const supabase = createAdminClient() as any
  let devicesQuery = supabase
    .from("wa_devices")
    .select("*, agencies:agency_id(id, name)")
    .order("created_at", { ascending: false })

  if (!includeInactive) {
    devicesQuery = devicesQuery.eq("is_active", true)
  }

  if (agencyId && agencyId !== "all") {
    devicesQuery = devicesQuery.eq("agency_id", agencyId)
  }

  const { data: devices, error } = await devicesQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrich with live connector status — single batch attempt
  // If connector is unreachable, skip enrichment entirely (use DB status)
  const enriched = await Promise.all(
    (devices || []).map(async (device: any) => {
      try {
        const result = await callConnector(`/devices/${device.id}/status`)
        if (!result.ok) return device // Connector unreachable, use DB status as-is

        const liveStatus = result.data
        if (liveStatus?.isRunning && device.status !== "CONNECTED" && device.status !== "PENDING_QR") {
          await supabase
            .from("wa_devices")
            .update({ status: "CONNECTED" })
            .eq("id", device.id)
          return { ...device, status: "CONNECTED" }
        }
        if (liveStatus && !liveStatus.isRunning && device.status === "CONNECTED") {
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
  const { displayName, agencyId } = body

  if (!displayName?.trim()) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 })
  }

  const supabase = createAdminClient() as any

  // Create device record
  const insertData: any = { display_name: displayName.trim(), status: "PENDING_QR" }
  if (agencyId) insertData.agency_id = agencyId

  const { data: device, error } = await supabase
    .from("wa_devices")
    .insert(insertData)
    .select("*, agencies:agency_id(id, name)")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Tell connector to start the device (begin QR generation)
  const connResult = await callConnector(`/devices/${device.id}/start`, "POST")
  if (!connResult.ok) {
    return NextResponse.json({
      device,
      warning: `Dispositivo creado pero el conector no respondió: ${connResult.error}`,
    })
  }

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

  const supabase = createAdminClient() as any

  // Stop connector socket first (best effort)
  await callConnector(`/devices/${id}/stop`, "POST")

  // Soft delete
  const { error } = await supabase
    .from("wa_devices")
    .update({ is_active: false, status: "DISCONNECTED" })
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
