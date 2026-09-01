import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { elegirModal } from "@/lib/announcements/modal-visibility"

/**
 * El anuncio que le corresponde ver a este usuario como modal, o null.
 *
 * Global como el resto de las novedades: no se filtra por `org_id` porque el
 * changelog del producto es el mismo para todas las agencias.
 *
 * El filtro por rol se resuelve acá y no en la consulta: `user.roles` ya viene
 * fusionado (`role` + `additional_roles`) desde `getCurrentUser()`, y la regla
 * —a un multi-rol le alcanza con que uno coincida— vive probada en
 * `lib/announcements/modal-visibility.ts`.
 */
export async function GET() {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Pocos por definición: un modal vigente es algo excepcional. Se traen los
    // últimos y se elige entre ellos.
    const { data, error } = await (supabase.from("announcements") as any)
      .select(
        "id, title, body, type, published_at, release_version, modal, modal_starts_at, modal_ends_at, modal_roles, modal_cta_label, modal_cta_href"
      )
      .eq("published", true)
      .eq("modal", true)
      .order("published_at", { ascending: false })
      .limit(10)

    if (error) throw error

    const candidatos = (data ?? []) as any[]
    if (candidatos.length === 0) return NextResponse.json({ announcement: null })

    const { data: descartes } = await (supabase as any).from("announcement_modal_dismissals")
      .select("announcement_id")
      .eq("user_id", user.id)
      .in(
        "announcement_id",
        candidatos.map((a) => a.id)
      )

    const descartados = new Set<string>(
      ((descartes ?? []) as { announcement_id: string }[]).map((d) => d.announcement_id)
    )

    const elegido = elegirModal(
      candidatos,
      {
        ahora: new Date().toISOString(),
        rolesDelUsuario: ((user as any).roles ?? [user.role]).filter(Boolean),
        descartado: false,
      },
      descartados,
      (a) => a.id
    )

    return NextResponse.json({ announcement: elegido })
  } catch (error) {
    console.error("Error obteniendo el modal de novedades:", error)
    // Un aviso que falla no puede romper el dashboard: el componente trata la
    // ausencia de anuncio como "no hay nada que mostrar".
    return NextResponse.json({ announcement: null })
  }
}

/**
 * "No volver a mostrar".
 *
 * Escribe en `announcement_modal_dismissals` y NO en `announcement_reads`: abrir
 * la campana marca todas las novedades como leídas de una, así que compartir
 * tabla haría que cualquiera que la abre pierda el modal sin haberlo visto.
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    const body = await request.json().catch(() => ({}))
    const announcementId = typeof body?.id === "string" ? body.id : null
    if (!announcementId) {
      return NextResponse.json({ error: "Falta el id de la novedad" }, { status: 400 })
    }

    const { error } = await (supabase as any).from("announcement_modal_dismissals").upsert(
      { announcement_id: announcementId, user_id: user.id },
      { onConflict: "announcement_id,user_id", ignoreDuplicates: true }
    )

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error descartando el modal de novedades:", error)
    return NextResponse.json({ error: "No se pudo guardar la preferencia" }, { status: 500 })
  }
}
