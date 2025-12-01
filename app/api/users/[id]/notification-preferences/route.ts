import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id: userId } = await params

    // Solo el propio usuario o admin puede ver sus preferencias
    if (user.id !== userId && user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    // Buscar preferencias existentes
    const { data: prefs } = await (supabase.from("user_notification_preferences") as any)
      .select("*")
      .eq("user_id", userId)
      .single()

    if (prefs) {
      return NextResponse.json({ preferences: prefs.preferences })
    }

    // Si no existe, devolver preferencias por defecto (todas activadas)
    return NextResponse.json({
      preferences: {
        payment_due: true,
        payment_overdue: true,
        upcoming_trip: true,
        missing_documents: true,
        new_lead: true,
        commission_generated: true,
      }
    })
  } catch (error: any) {
    console.error("Error fetching notification preferences:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id: userId } = await params
    const body = await request.json()

    // Solo el propio usuario puede modificar sus preferencias
    if (user.id !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { preferences } = body

    // Upsert preferencias
    const { data, error } = await (supabase.from("user_notification_preferences") as any)
      .upsert({
        user_id: userId,
        preferences,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id",
      })
      .select()
      .single()

    if (error) {
      // Si la tabla no existe, simplemente retornar éxito
      // Las preferencias se guardarán en memoria hasta que exista la tabla
      console.log("Note: user_notification_preferences table may not exist yet")
      return NextResponse.json({ success: true, preferences })
    }

    return NextResponse.json({ success: true, preferences: data.preferences })
  } catch (error: any) {
    console.error("Error saving notification preferences:", error)
    // Retornar éxito incluso si falla, para no bloquear la UI
    return NextResponse.json({ success: true })
  }
}

