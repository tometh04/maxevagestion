import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()
    const { agencyId, webhookUrl } = body

    if (!agencyId || !webhookUrl) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
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

    // Get the full board ID (not the short ID)
    // First, try to get the board to get its full ID
    let boardIdModel = settings.board_id
    try {
      const boardResponse = await fetch(
        `https://api.trello.com/1/boards/${settings.board_id}?key=${settings.trello_api_key}&token=${settings.trello_token}`
      )
      if (boardResponse.ok) {
        const boardData = await boardResponse.json()
        boardIdModel = boardData.id // Use the full ID, not the short ID
      }
    } catch (error) {
      console.error("Error fetching board:", error)
      // Continue with the short ID, it might work
    }

    // Register webhook with Trello
    const webhookResponse = await fetch("https://api.trello.com/1/webhooks/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description: `MAXEVA GESTION - ${settings.board_id}`,
        callbackURL: webhookUrl,
        idModel: boardIdModel, // Use full board ID
        key: settings.trello_api_key,
        token: settings.trello_token,
      }),
    })

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText || "Error al registrar webhook en Trello" }
      }
      console.error("Trello webhook registration error:", errorData)
      return NextResponse.json(
        { error: errorData.message || errorData.error || "Error al registrar webhook en Trello" },
        { status: 400 }
      )
    }

    const webhookData = await webhookResponse.json()

    // Store webhook ID in settings
    // Try to update, but don't fail if columns don't exist yet
    try {
      const { error: updateError } = await (supabase.from("settings_trello") as any)
        .update({
          webhook_id: webhookData.id,
          webhook_url: webhookUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settings.id)

      if (updateError) {
        console.error("Error saving webhook ID (columns may not exist yet):", updateError)
        // Continue anyway, webhook is registered in Trello
      }
    } catch (error) {
      console.error("Error updating webhook fields:", error)
      // Continue anyway, webhook is registered in Trello
    }

    return NextResponse.json({
      success: true,
      webhook: {
        id: webhookData.id,
        url: webhookUrl,
        active: webhookData.active,
      },
    })
  } catch (error) {
    console.error("Error registering webhook:", error)
    return NextResponse.json({ error: "Error al registrar webhook" }, { status: 500 })
  }
}

