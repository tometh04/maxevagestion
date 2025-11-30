import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient() as any
    const body = await request.json()
    const { leadId, status, trelloListId } = body

    if (!leadId) {
      return NextResponse.json({ error: "Falta leadId" }, { status: 400 })
    }

    // Obtener el lead para ver si tiene external_id (tarjeta de Trello)
    const { data: leadData, error: leadError } = await supabase
      .from("leads")
      .select("external_id, agency_id, trello_list_id")
      .eq("id", leadId)
      .single()

    if (leadError || !leadData) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
    }

    const lead = leadData as { external_id: string | null; agency_id: string; trello_list_id: string | null }

    // Si es un lead de Trello y tenemos trelloListId, mover la tarjeta en Trello
    if (lead.external_id && trelloListId && trelloListId !== lead.trello_list_id) {
      // Obtener configuración de Trello para esta agencia
      const { data: trelloSettingsData } = await supabase
        .from("settings_trello")
        .select("trello_api_key, trello_token")
        .eq("agency_id", lead.agency_id)
        .single()

      const trelloSettings = trelloSettingsData as { trello_api_key: string; trello_token: string } | null

      if (trelloSettings) {
        // Mover la tarjeta en Trello
        const moveResponse = await fetch(
          `https://api.trello.com/1/cards/${lead.external_id}?key=${trelloSettings.trello_api_key}&token=${trelloSettings.trello_token}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idList: trelloListId }),
          }
        )

        if (!moveResponse.ok) {
          const errorText = await moveResponse.text()
          console.error("Error moviendo tarjeta en Trello:", errorText)
          return NextResponse.json({ error: "Error al mover tarjeta en Trello" }, { status: 500 })
        }

        console.log(`✅ Tarjeta ${lead.external_id} movida a lista ${trelloListId} en Trello`)

        // El webhook de Trello actualizará la BD automáticamente,
        // pero también actualizamos localmente para respuesta inmediata
        await supabase
          .from("leads")
          .update({ 
            trello_list_id: trelloListId,
            updated_at: new Date().toISOString() 
          })
          .eq("id", leadId)

        return NextResponse.json({ success: true, movedInTrello: true })
      }
    }

    // Si no es Trello o solo queremos actualizar status local
    if (status) {
      await supabase
        .from("leads")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", leadId)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error en update-status:", error)
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 })
  }
}
