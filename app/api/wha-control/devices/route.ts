import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { callConnector } from "@/lib/wha-control/connector-client"

// Prioridad para elegir el "mejor" device de un mismo teléfono.
function deviceRank(d: any): number {
  if (d.status === "CONNECTED") return 3
  if (d.status === "PENDING_QR" || d.status === "RECONNECTING") return 2
  return 1
}

// Dedupe por phone_number: deja un solo device por teléfono (el mejor). Los que
// no tienen teléfono (sin parear todavía) se mantienen todos.
function dedupeByPhone(devices: any[]): any[] {
  const byPhone = new Map<string, any>()
  const noPhone: any[] = []
  for (const d of devices) {
    if (!d.phone_number) {
      noPhone.push(d)
      continue
    }
    const cur = byPhone.get(d.phone_number)
    if (!cur) {
      byPhone.set(d.phone_number, d)
      continue
    }
    const better =
      deviceRank(d) !== deviceRank(cur)
        ? deviceRank(d) > deviceRank(cur)
        : Date.parse(d.last_connection_at || 0) > Date.parse(cur.last_connection_at || 0)
    if (better) byPhone.set(d.phone_number, d)
  }
  return [...Array.from(byPhone.values()), ...noPhone]
}

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
    .eq("org_id", auth.orgId) // SaaS: acotar al tenant del caller
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

  // Dedupe: cada re-pareo crea un device row NUEVO con el mismo teléfono, dejando
  // duplicados vacíos que ensucian el selector. Por teléfono dejamos solo el
  // "mejor" (conectado > más reciente). Los null-phone (sin parear) se mantienen.
  // El management (includeInactive) ve todo para poder limpiar.
  const deduped = includeInactive ? devices || [] : dedupeByPhone(devices || [])

  // Estado en vivo desde el connector. Es una llamada HTTP POR dispositivo, así
  // que con el connector caído el listado tardaba lo que tardara el timeout más
  // largo (10s por defecto). Se acota a 3s: si no contesta en ese lapso, se usa
  // el estado guardado, que es lo que se mostraba igual.
  const STATUS_TIMEOUT_MS = 3000
  const enriched = await Promise.all(
    deduped.map(async (device: any) => {
      // Un device dado de baja en WhatsApp no vuelve solo: preguntar por él es
      // gastar un round-trip para confirmar lo que ya sabemos.
      if (device.status === "LOGGED_OUT") return device
      try {
        const result = await callConnector(
          `/devices/${device.id}/status`,
          "GET",
          undefined,
          STATUS_TIMEOUT_MS
        )
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

  // adminDb justificado: wa_devices se usa por panel admin de la org.
  // El insert inyecta org_id del caller — el agencyId del body se valida abajo
  // contra el org para evitar forge (asignar device a agency de otro tenant).
  const supabase = createAdminClient() as any

  // Validar agencyId del body contra el org del caller (anti-forge)
  if (agencyId) {
    const { data: agencyRow } = await supabase
      .from("agencies")
      .select("id")
      .eq("id", agencyId)
      .eq("org_id", auth.orgId)
      .maybeSingle()
    if (!agencyRow) {
      return NextResponse.json({ error: "Agency no pertenece al tenant" }, { status: 400 })
    }
  }

  // Create device record (SaaS: inyecta org_id del caller)
  const insertData: any = {
    display_name: displayName.trim(),
    status: "PENDING_QR",
    org_id: auth.orgId,
  }
  if (agencyId) insertData.agency_id = agencyId

  const { data: device, error } = await supabase
    .from("wa_devices")
    .insert(insertData)
    .select("*, agencies:agency_id(id, name)")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Tell connector to start the device (begin QR generation).
  // Use longer timeout (20s) since starting a new device session can be slow.
  const connResult = await callConnector(`/devices/${device.id}/start`, "POST", undefined, 20000)
  if (!connResult.ok) {
    // Rollback: delete device from DB — the user will need to retry from scratch
    await supabase.from("wa_devices").delete().eq("id", device.id)
    return NextResponse.json(
      { error: `No se pudo iniciar el dispositivo: ${connResult.error}` },
      { status: 502 }
    )
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

  // Soft delete (acotado por org_id del caller — defensa contra IDs ajenos)
  const { error } = await supabase
    .from("wa_devices")
    .update({ is_active: false, status: "DISCONNECTED" })
    .eq("id", id)
    .eq("org_id", auth.orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
