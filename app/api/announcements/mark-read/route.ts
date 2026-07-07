import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

// POST /api/announcements/mark-read
// Marca novedades como leídas para el usuario actual. Body opcional
// { ids?: string[] }; sin ids → marca TODAS las publicadas. Upsert idempotente
// sobre announcement_reads (PK compuesta announcement_id + user_id).
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    const body = await request.json().catch(() => ({}))
    let ids: string[] = Array.isArray(body?.ids) ? body.ids : []

    if (ids.length === 0) {
      // Sin ids explícitos: marcar todas las novedades publicadas.
      const { data: published } = await supabase
        .from("announcements")
        .select("id")
        .eq("published", true)
      ids = (published || []).map((a: { id: string }) => a.id)
    }

    if (ids.length === 0) {
      return NextResponse.json({ success: true, marked: 0 })
    }

    const rows = ids.map((announcement_id) => ({
      announcement_id,
      user_id: user.id,
    }))

    const readsTable = supabase.from("announcement_reads") as any
    const { error } = await readsTable.upsert(rows, {
      onConflict: "announcement_id,user_id",
      ignoreDuplicates: true,
    })

    if (error) throw error

    return NextResponse.json({ success: true, marked: rows.length })
  } catch (error) {
    console.error("Error marking announcements as read:", error)
    return NextResponse.json({ error: "Error al marcar como leídas" }, { status: 500 })
  }
}
