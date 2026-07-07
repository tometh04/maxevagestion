import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

// TEMPORAL — replica el flujo de /api/announcements capturando el error de cada
// paso, para diagnosticar el 500. Abrir desde el browser autenticado. Borrar después.
export async function GET() {
  const steps: Record<string, unknown> = {}

  let userId: string | null = null
  try {
    const { user } = await getCurrentUser()
    userId = user.id
    steps.user = { id: user.id, org_id: (user as any).org_id ?? null }
  } catch (e: any) {
    steps.getCurrentUser = { error: e?.message ?? String(e), digest: e?.digest ?? null }
    return NextResponse.json(steps)
  }

  const supabase = await createServerClient()

  try {
    const { data, error } = await supabase
      .from("announcements")
      .select("id, title, type, published_at")
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(20)
    steps.announcements = { count: data?.length ?? 0, error: error?.message ?? null }

    const ids = (data ?? []).map((a: any) => a.id)
    if (ids.length > 0 && userId) {
      const { data: reads, error: readsErr } = await supabase
        .from("announcement_reads")
        .select("announcement_id")
        .eq("user_id", userId)
        .in("announcement_id", ids)
      steps.announcement_reads = { count: reads?.length ?? 0, error: readsErr?.message ?? null }
    }
  } catch (e: any) {
    steps.thrown = e?.message ?? String(e)
  }

  return NextResponse.json(steps)
}
