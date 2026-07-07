import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

// GET /api/announcements
// Novedades del producto (changelog global). Son globales a todas las orgs, así
// que NO se filtran por org_id. Devuelve las publicadas + el estado de "leído"
// por usuario (tabla announcement_reads) y el contador de no leídas.
export async function GET() {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    const { data: announcements, error } = await supabase
      .from("announcements")
      .select("id, title, body, type, published_at")
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(20)

    if (error) throw error

    const list = announcements || []

    // Estado de leído del usuario actual sobre las novedades devueltas.
    let readIds = new Set<string>()
    if (list.length > 0) {
      const { data: reads } = await supabase
        .from("announcement_reads")
        .select("announcement_id")
        .eq("user_id", user.id)
        .in("announcement_id", list.map((a) => a.id))
      readIds = new Set((reads || []).map((r: { announcement_id: string }) => r.announcement_id))
    }

    const announcementsWithRead = list.map((a) => ({
      ...a,
      read: readIds.has(a.id),
    }))
    const unreadCount = announcementsWithRead.filter((a) => !a.read).length

    return NextResponse.json({ announcements: announcementsWithRead, unreadCount })
  } catch (error) {
    console.error("Error fetching announcements:", error)
    return NextResponse.json({ error: "Error al obtener novedades" }, { status: 500 })
  }
}
