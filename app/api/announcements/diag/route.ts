import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// TEMPORAL — diagnóstico del 500 en /api/announcements en prod. Borrar después.
// No expone secretos: la URL es NEXT_PUBLIC y el count no es sensible.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || null
  const projectRef = url ? url.replace(/^https:\/\//, "").split(".")[0] : null
  const anonKeyKind = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").startsWith("sb_")
    ? "new(sb_)"
    : "legacy(jwt)"
  try {
    const supabase = await createServerClient()
    const { data, error } = await supabase
      .from("announcements")
      .select("id, published")
      .eq("published", true)
    return NextResponse.json({
      projectRef,
      anonKeyKind,
      count: data?.length ?? 0,
      queryError: error ? { message: error.message, code: (error as any).code } : null,
    })
  } catch (e: any) {
    return NextResponse.json({ projectRef, anonKeyKind, thrown: e?.message ?? String(e) })
  }
}
