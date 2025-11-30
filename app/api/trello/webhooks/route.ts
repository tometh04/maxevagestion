import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const agencyId = searchParams.get("agencyId")

    if (!agencyId) {
      return NextResponse.json({ error: "Falta agencyId" }, { status: 400 })
    }

    // Get Trello settings
    const { data: trelloSettings } = await supabase
      .from("settings_trello")
      .select("*")
      .eq("agency_id", agencyId)
      .single()

    if (!trelloSettings) {
      return NextResponse.json({ webhooks: [] })
    }

    const settings = trelloSettings as any

    // Get webhooks from Trello API
    try {
      const webhooksResponse = await fetch(
        `https://api.trello.com/1/tokens/${settings.trello_token}/webhooks?key=${settings.trello_api_key}`
      )

      if (!webhooksResponse.ok) {
        return NextResponse.json({ webhooks: [] })
      }

      const webhooks = await webhooksResponse.json()

      // Filter webhooks for this board
      const boardWebhooks = webhooks.filter(
        (wh: any) => wh.idModel === settings.board_id || wh.callbackURL?.includes("/api/trello/webhook")
      )

      return NextResponse.json({ webhooks: boardWebhooks })
    } catch (error) {
      console.error("Error fetching webhooks:", error)
      return NextResponse.json({ webhooks: [] })
    }
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Error al obtener webhooks" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const webhookId = searchParams.get("id")
    const agencyId = searchParams.get("agencyId")

    if (!webhookId || !agencyId) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 })
    }

    // Get Trello settings
    const { data: trelloSettings } = await supabase
      .from("settings_trello")
      .select("*")
      .eq("agency_id", agencyId)
      .single()

    if (!trelloSettings) {
      return NextResponse.json({ error: "No hay configuración de Trello" }, { status: 400 })
    }

    const settings = trelloSettings as any

    // Delete webhook from Trello
    const deleteResponse = await fetch(
      `https://api.trello.com/1/webhooks/${webhookId}?key=${settings.trello_api_key}&token=${settings.trello_token}`,
      {
        method: "DELETE",
      }
    )

    if (!deleteResponse.ok) {
      return NextResponse.json({ error: "Error al eliminar webhook" }, { status: 400 })
    }

    // Clear webhook_id from settings
    await (supabase.from("settings_trello") as any)
      .update({
        webhook_id: null,
        webhook_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settings.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting webhook:", error)
    return NextResponse.json({ error: "Error al eliminar webhook" }, { status: 500 })
  }
}

