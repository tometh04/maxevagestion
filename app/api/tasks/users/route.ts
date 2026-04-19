import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET() {
  try {
    const { user } = await getCurrentUser()

    const supabase = await createServerClient()
    let query = supabase
      .from("users")
      .select("id, name, email")
      .eq("is_active", true)
      .order("name")

    // Multi-tenant: solo users de la misma org
    if (user.org_id) query = query.eq("org_id", user.org_id)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const users = (data || []).map((u: { id: string; name: string | null; email: string | null }) => ({
      id: u.id,
      name: u.name || u.email,
    }))

    return NextResponse.json({ users })
  } catch {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }
}
