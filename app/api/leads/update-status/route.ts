import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()
    const { leadId, status } = body

    if (!leadId || !status) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 })
    }

    // @ts-ignore - Supabase type inference issue
    await supabase.from("leads").update({ status, updated_at: new Date().toISOString() } as any).eq("id", leadId)

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 })
  }
}

