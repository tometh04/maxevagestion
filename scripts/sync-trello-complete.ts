/**
 * Script para sincronización completa de Trello
 * 1. Elimina todos los leads existentes (mockup)
 * 2. Obtiene todas las tarjetas del board de Trello
 * 3. Crea leads para cada tarjeta
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Credenciales de Trello desde variables de entorno
const TRELLO_API_KEY = process.env.TRELLO_API_KEY || ""
const TRELLO_TOKEN = process.env.TRELLO_TOKEN || ""

if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
  console.error("Missing Trello environment variables (TRELLO_API_KEY, TRELLO_TOKEN)")
  process.exit(1)
}
const BOARD_ID = "kZh4zJ0J"
const BOARD_FULL_ID = "680965f3edccf6f26eda61ef"

async function syncTrelloComplete() {
  console.log("🔄 Iniciando sincronización completa de Trello...")
  console.log("")

  // 1. Obtener agencia
  console.log("1. Obteniendo agencia...")
  const { data: agencies } = await supabase
    .from("agencies")
    .select("id, name")
    .limit(1)

  if (!agencies || agencies.length === 0) {
    console.error("❌ No se encontraron agencias")
    process.exit(1)
  }

  const agencyId = agencies[0].id
  console.log(`   ✓ Agencia: ${agencies[0].name} (${agencyId})`)

  // 2. Obtener configuración de Trello
  console.log("")
  console.log("2. Obteniendo configuración de Trello...")
  const { data: trelloSettings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agencyId)
    .single()

  if (!trelloSettings) {
    console.error("❌ No se encontró configuración de Trello")
    process.exit(1)
  }

  const settings = trelloSettings as any
  const listStatusMapping = (settings.list_status_mapping || {}) as Record<string, string>
  const listRegionMapping = (settings.list_region_mapping || {}) as Record<string, string>

  console.log("   ✓ Configuración encontrada")

  // 3. Eliminar todos los leads existentes
  console.log("")
  console.log("3. Eliminando leads existentes (mockup)...")
  
  const { data: existingLeads, error: fetchError } = await supabase
    .from("leads")
    .select("id")
    .eq("agency_id", agencyId)

  if (fetchError) {
    console.error("   ❌ Error obteniendo leads:", fetchError)
    process.exit(1)
  }

  const leadCount = existingLeads?.length || 0
  console.log(`   📊 Encontrados ${leadCount} leads existentes`)

  if (leadCount > 0) {
    const { error: deleteError } = await supabase
      .from("leads")
      .delete()
      .eq("agency_id", agencyId)

    if (deleteError) {
      console.error("   ❌ Error eliminando leads:", deleteError)
      process.exit(1)
    }
    console.log(`   ✓ ${leadCount} leads eliminados`)
  } else {
    console.log("   ✓ No hay leads para eliminar")
  }

  // 4. Obtener todas las tarjetas del board
  console.log("")
  console.log("4. Obteniendo tarjetas de Trello...")
  
  try {
    const cardsResponse = await fetch(
      `https://api.trello.com/1/boards/${BOARD_ID}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=name,desc,url,idList,labels`
    )

    if (!cardsResponse.ok) {
      const errorText = await cardsResponse.text()
      console.error("   ❌ Error obteniendo tarjetas:", errorText)
      process.exit(1)
    }

    const cards = await cardsResponse.json()
    console.log(`   ✓ ${cards.length} tarjetas encontradas en Trello`)

    if (cards.length === 0) {
      console.log("")
      console.log("⚠️  No hay tarjetas en el board de Trello")
      return
    }

    // 5. Obtener listas para mapeo
    console.log("")
    console.log("5. Obteniendo listas del board...")
    const listsResponse = await fetch(
      `https://api.trello.com/1/boards/${BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,name`
    )

    if (!listsResponse.ok) {
      console.error("   ⚠️  Error obteniendo listas, usando mapeo por defecto")
    } else {
      const lists = await listsResponse.json()
      console.log(`   ✓ ${lists.length} listas encontradas`)
    }

    // 6. Procesar cada tarjeta y crear lead
    console.log("")
    console.log("6. Procesando tarjetas y creando leads...")
    
    let created = 0
    let updated = 0
    let errors = 0

    for (const card of cards) {
      try {
        // Determinar status y región basado en la lista
        const status = listStatusMapping[card.idList] || "NEW"
        const region = listRegionMapping[card.idList] || "OTROS"

        // Parse contact name from card name (first part before - or : or ,)
        const contactName = card.name.split(/[-:,\n]/)[0].trim()

        // Try to extract destination from card name or labels
        const destination = card.labels?.[0]?.name || card.name.split(/[-:,\n]/)[1]?.trim() || "Sin destino"

        // Extract phone, email, instagram from description
        const phoneMatch = card.desc?.match(/(?:tel|phone|cel)[:\s]*([\d\s\-\+\(\)]+)/i)
        const emailMatch = card.desc?.match(/(?:email|correo)[:\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)
        const instagramMatch = card.desc?.match(/(?:instagram|ig)[:\s]*@?([a-zA-Z0-9._]+)/i)

        const contact_phone = phoneMatch ? phoneMatch[1].replace(/\s/g, "") : ""
        const contact_email = emailMatch ? emailMatch[1] : null
        const contact_instagram = instagramMatch ? instagramMatch[1] : null

        // Check if lead already exists (by external_id)
        const { data: existingLead } = await supabase
          .from("leads")
          .select("id")
          .eq("external_id", card.id)
          .maybeSingle()

        const leadData = {
          agency_id: agencyId,
          source: "Trello" as const,
          external_id: card.id,
          trello_url: card.url,
          status: status as any,
          region: region as any,
          destination,
          contact_name: contactName,
          contact_phone,
          contact_email,
          contact_instagram,
          assigned_seller_id: null,
          notes: card.desc || null,
          updated_at: new Date().toISOString(),
        }

        if (existingLead) {
          const { error: updateError } = await (supabase.from("leads") as any)
            .update(leadData)
            .eq("id", existingLead.id)
          if (updateError) {
            console.error(`   ❌ Error actualizando lead ${card.id}:`, updateError)
            errors++
          } else {
            updated++
          }
        } else {
          const { error: insertError } = await (supabase.from("leads") as any)
            .insert(leadData)
            .select()
            .single()
          if (insertError) {
            console.error(`   ❌ Error creando lead ${card.id}:`, insertError)
            errors++
          } else {
            created++
          }
        }
      } catch (error) {
        console.error(`   ❌ Error procesando tarjeta ${card.id}:`, error)
        errors++
      }
    }

    console.log("")
    console.log("✅ Sincronización completada!")
    console.log("")
    console.log("Resumen:")
    console.log(`   - Tarjetas procesadas: ${cards.length}`)
    console.log(`   - Leads creados: ${created}`)
    console.log(`   - Leads actualizados: ${updated}`)
    if (errors > 0) {
      console.log(`   - Errores: ${errors}`)
    }
  } catch (error) {
    console.error("❌ Error en sincronización:", error)
    process.exit(1)
  }
}

syncTrelloComplete().catch(console.error)

