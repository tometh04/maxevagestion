import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * POST /api/push/subscribe
 * Guarda o actualiza una push subscription para el usuario actual
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    const body = await request.json()
    const { endpoint, keys } = body

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: "Faltan campos: endpoint, keys.p256dh, keys.auth" },
        { status: 400 }
      )
    }

    // Upsert: si ya existe la combinación user_id + endpoint, actualizar keys
    const { error } = await (supabase as any)
      .from("push_subscriptions")
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        {
          onConflict: "user_id,endpoint",
        }
      )

    if (error) {
      console.error("Error guardando push subscription:", error)
      return NextResponse.json(
        { error: "Error al guardar subscription", detail: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error en POST /api/push/subscribe:", error)
    return NextResponse.json(
      { error: "Error interno", detail: error?.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/push/subscribe
 * Elimina una push subscription del usuario actual
 */
export async function DELETE(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    const body = await request.json()
    const { endpoint } = body

    if (!endpoint) {
      return NextResponse.json({ error: "Falta endpoint" }, { status: 400 })
    }

    const { error } = await (supabase as any)
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", endpoint)

    if (error) {
      console.error("Error eliminando push subscription:", error)
      return NextResponse.json(
        { error: "Error al eliminar subscription", detail: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error en DELETE /api/push/subscribe:", error)
    return NextResponse.json(
      { error: "Error interno", detail: error?.message },
      { status: 500 }
    )
  }
}
