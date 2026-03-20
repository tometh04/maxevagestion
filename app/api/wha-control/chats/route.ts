import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"

export async function GET(request: Request) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { searchParams } = new URL(request.url)
  const deviceId = searchParams.get("deviceId")
  const search = searchParams.get("search")
  const limit = parseInt(searchParams.get("limit") || "100")
  const offset = parseInt(searchParams.get("offset") || "0")

  if (!deviceId) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 })
  }

  
  const supabase = createAdminClient() as any

  let query = supabase
    .from("wa_chats")
    .select("*")
    .eq("device_id", deviceId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.or(
      `contact_name.ilike.%${search}%,push_name.ilike.%${search}%,contact_phone.ilike.%${search}%,remote_jid.ilike.%${search}%`
    )
  }

  const { data: chats, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ chats: chats || [] })
}
