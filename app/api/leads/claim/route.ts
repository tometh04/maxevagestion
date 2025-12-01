import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * POST /api/leads/claim
 * Permite a un vendedor "agarrar" un lead sin asignar
 * 
 * Lógica:
 * 1. Verificar que el lead está sin asignar
 * 2. Buscar la lista de Trello del vendedor (lista con su nombre)
 * 3. Mover la card en Trello a la lista del vendedor
 * 4. Actualizar assigned_seller_id y trello_list_id en la DB
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Solo vendedores pueden "agarrar" leads
    if (user.role !== "SELLER" && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { leadId } = await request.json()

    if (!leadId) {
      return NextResponse.json({ error: "Falta el ID del lead" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // 1. Obtener el lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, agency_id, assigned_seller_id, external_id")
      .eq("id", leadId)
      .single()

    if (leadError || !lead) {
      console.error("❌ Error getting lead:", leadError)
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
    }

    // 2. Verificar que el lead está sin asignar
    if ((lead as any).assigned_seller_id) {
      return NextResponse.json({ 
        error: "Este lead ya está asignado a otro vendedor" 
      }, { status: 400 })
    }

    // 3. Obtener el nombre del vendedor para buscar su lista
    const { data: seller, error: sellerError } = await supabase
      .from("users")
      .select("name")
      .eq("id", user.id)
      .single()

    if (sellerError || !seller) {
      console.error("❌ Error getting seller:", sellerError)
      return NextResponse.json({ error: "Error al obtener datos del vendedor" }, { status: 500 })
    }

    const sellerName = (seller as any).name

    // 4. Obtener configuración de Trello de la agencia
    const { data: trelloConfig, error: configError } = await supabase
      .from("settings_trello")
      .select("trello_api_key, trello_token, board_id")
      .eq("agency_id", (lead as any).agency_id)
      .single()

    if (configError || !trelloConfig) {
      // Si no hay config de Trello, solo asignar en la DB sin mover en Trello
      console.log("⚠️ No Trello config, assigning only in DB")
      
      const { error: updateError } = await (supabase
        .from("leads") as any)
        .update({
          assigned_seller_id: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", leadId)

      if (updateError) {
        console.error("❌ Error updating lead:", updateError)
        return NextResponse.json({ error: "Error al asignar el lead" }, { status: 500 })
      }

      return NextResponse.json({ 
        success: true, 
        message: "Lead asignado correctamente (sin Trello)" 
      })
    }

    const config = trelloConfig as any

    // 5. Buscar la lista del vendedor en Trello
    // Primero obtenemos todas las listas del board
    const listsResponse = await fetch(
      `https://api.trello.com/1/boards/${config.board_id}/lists?key=${config.trello_api_key}&token=${config.trello_token}`
    )

    if (!listsResponse.ok) {
      console.error("❌ Error fetching Trello lists:", await listsResponse.text())
      return NextResponse.json({ error: "Error al obtener listas de Trello" }, { status: 500 })
    }

    const lists = await listsResponse.json()

    // Buscar lista que coincida con el nombre del vendedor
    // Normalizamos para comparar (sin tildes, lowercase)
    const normalizeString = (str: string) => 
      str.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()

    const sellerNameNormalized = normalizeString(sellerName)
    
    const sellerList = lists.find((list: any) => {
      const listNameNormalized = normalizeString(list.name)
      // Coincidencia exacta o contiene el nombre del vendedor
      return listNameNormalized === sellerNameNormalized || 
             listNameNormalized.includes(sellerNameNormalized) ||
             sellerNameNormalized.includes(listNameNormalized)
    })

    if (!sellerList) {
      // No hay lista para este vendedor, solo asignar en DB
      console.log(`⚠️ No Trello list found for seller: ${sellerName}`)
      
      const { error: updateError } = await (supabase
        .from("leads") as any)
        .update({
          assigned_seller_id: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", leadId)

      if (updateError) {
        console.error("❌ Error updating lead:", updateError)
        return NextResponse.json({ error: "Error al asignar el lead" }, { status: 500 })
      }

      return NextResponse.json({ 
        success: true, 
        message: `Lead asignado. Nota: No se encontró lista "${sellerName}" en Trello.`,
        warning: `Crea una lista llamada "${sellerName}" en Trello para sincronizar automáticamente.`
      })
    }

    // 6. Mover la card en Trello a la lista del vendedor
    if ((lead as any).external_id) {
      const moveResponse = await fetch(
        `https://api.trello.com/1/cards/${(lead as any).external_id}?key=${config.trello_api_key}&token=${config.trello_token}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idList: sellerList.id }),
        }
      )

      if (!moveResponse.ok) {
        console.error("❌ Error moving card in Trello:", await moveResponse.text())
        // Continuar de todas formas, asignar en DB
      } else {
        console.log(`✅ Card moved to list "${sellerList.name}" in Trello`)
      }
    }

    // 7. Actualizar la DB con assigned_seller_id y nuevo trello_list_id
    const { error: updateError } = await (supabase
      .from("leads") as any)
      .update({
        assigned_seller_id: user.id,
        trello_list_id: sellerList.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId)

    if (updateError) {
      console.error("❌ Error updating lead:", updateError)
      return NextResponse.json({ error: "Error al asignar el lead" }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: `Lead asignado a ${sellerName} y movido a su lista en Trello`,
      trelloListId: sellerList.id,
      trelloListName: sellerList.name
    })

  } catch (error: any) {
    console.error("❌ Error in claim lead:", error)
    return NextResponse.json({ 
      error: error.message || "Error al agarrar el lead" 
    }, { status: 500 })
  }
}

