import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { sendPushToUser } from "@/lib/push"

/**
 * POST /api/push/send
 * Envía una push notification a un usuario específico
 * (para uso interno/cron — no expuesta públicamente)
 */
export async function POST(request: Request) {
  try {
    // Verificar autorización con CRON_SECRET
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const supabase = await createServerClient()
    const body = await request.json()
    const { userId, title, body: notifBody, url } = body

    if (!userId || !title) {
      return NextResponse.json(
        { error: "Faltan campos: userId, title" },
        { status: 400 }
      )
    }

    const result = await sendPushToUser(supabase, userId, {
      title,
      body: notifBody || "",
      url: url || "/dashboard",
    })

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error: any) {
    console.error("Error en POST /api/push/send:", error)
    return NextResponse.json(
      { error: "Error interno", detail: error?.message },
      { status: 500 }
    )
  }
}
