/**
 * Script mejorado para sincronización completa de Trello
 * Trae TODA la información de Trello tal cual está:
 * - Listas mapeadas a estados
 * - Miembros asignados mapeados a vendedores
 * - Nombre exacto de la tarjeta
 * - Descripción completa
 * - Labels
 * - URLs de Trello
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

async function syncTrelloComplete() {
  console.log("🔄 Iniciando sincronización completa mejorada de Trello...")
  console.log("")

  // 1. Obtener agencia Rosario
  console.log("1. Obteniendo agencia Rosario...")
  const { data: agencies } = await supabase
    .from("agencies")
    .select("id, name")
    .eq("name", "Rosario")
    .single()

  if (!agencies) {
    console.error("❌ No se encontró agencia Rosario")
    process.exit(1)
  }

  const agencyId = agencies.id
  console.log(`   ✓ Agencia: ${agencies.name} (${agencyId})`)

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

  // 3. Obtener todos los vendedores para mapeo de miembros
  console.log("")
  console.log("3. Obteniendo vendedores para mapeo...")
  const { data: sellers } = await supabase
    .from("users")
    .select("id, name, email")
    .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
    .eq("is_active", true)

  const sellerMap = new Map<string, string>()
  if (sellers) {
    sellers.forEach((seller: any) => {
      // Mapear por nombre (sin espacios, lowercase)
      const key = seller.name.toLowerCase().replace(/\s+/g, "")
      sellerMap.set(key, seller.id)
      // También mapear por email
      if (seller.email) {
        sellerMap.set(seller.email.toLowerCase(), seller.id)
      }
    })
  }
  console.log(`   ✓ ${sellerMap.size} vendedores encontrados para mapeo`)

  // 4. Obtener todas las listas del board con sus IDs
  console.log("")
  console.log("4. Obteniendo listas del board...")
  const listsResponse = await fetch(
    `https://api.trello.com/1/boards/${BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,name`
  )

  if (!listsResponse.ok) {
    console.error("   ❌ Error obteniendo listas")
    process.exit(1)
  }

  const lists = await listsResponse.json()
  console.log(`   ✓ ${lists.length} listas encontradas`)

  // Crear mapeo de lista ID -> nombre
  const listNameMap = new Map<string, string>()
  lists.forEach((list: any) => {
    listNameMap.set(list.id, list.name)
  })

  // 5. Obtener todos los miembros del board
  console.log("")
  console.log("5. Obteniendo miembros del board...")
  const membersResponse = await fetch(
    `https://api.trello.com/1/boards/${BOARD_ID}/members?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,username,fullName,email`
  )

  if (!membersResponse.ok) {
    console.error("   ⚠️  Error obteniendo miembros, continuando sin mapeo de vendedores")
  } else {
    const members = await membersResponse.json()
    console.log(`   ✓ ${members.length} miembros encontrados`)
    // Mapear miembros de Trello a vendedores
    members.forEach((member: any) => {
      const key = (member.fullName || member.username || "").toLowerCase().replace(/\s+/g, "")
      if (key && sellerMap.has(key)) {
        // Ya está mapeado
      }
    })
  }

  // 6. Eliminar todos los leads existentes de Rosario
  console.log("")
  console.log("6. Eliminando leads existentes de Rosario...")
  const { count: existingCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("agency_id", agencyId)

  if (existingCount && existingCount > 0) {
    const { error: deleteError } = await supabase
      .from("leads")
      .delete()
      .eq("agency_id", agencyId)

    if (deleteError) {
      console.error("   ❌ Error eliminando leads:", deleteError)
      process.exit(1)
    }
    console.log(`   ✓ ${existingCount} leads eliminados`)
  } else {
    console.log("   ✓ No hay leads para eliminar")
  }

  // 7. Obtener TODAS las tarjetas con TODA su información
  console.log("")
  console.log("7. Obteniendo tarjetas de Trello con toda su información...")
  
  const cardsResponse = await fetch(
    `https://api.trello.com/1/boards/${BOARD_ID}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=name,desc,url,idList,labels,idMembers,dateLastActivity&members=true&member_fields=fullName,username,email`
  )

  if (!cardsResponse.ok) {
    const errorText = await cardsResponse.text()
    console.error("   ❌ Error obteniendo tarjetas:", errorText)
    process.exit(1)
  }

  const cards = await cardsResponse.json()
  console.log(`   ✓ ${cards.length} tarjetas encontradas`)

  if (cards.length === 0) {
    console.log("")
    console.log("⚠️  No hay tarjetas en el board de Trello")
    return
  }

  // 8. Procesar cada tarjeta
  console.log("")
  console.log("8. Procesando tarjetas y creando leads...")
  
  let created = 0
  let updated = 0
  let errors = 0

  for (const card of cards) {
    try {
      // Obtener nombre de la lista
      const listName = listNameMap.get(card.idList) || "Sin lista"
      
      // Determinar status basado en el mapeo de listas
      const status = listStatusMapping[card.idList] || "NEW"
      
      // Determinar región basado en el mapeo de listas
      const region = listRegionMapping[card.idList] || "OTROS"

      // Nombre exacto de la tarjeta (sin modificar)
      const contactName = card.name.trim()

      // Descripción completa (tal cual está en Trello)
      const notes = card.desc || null

      // Extraer información de la descripción (opcional, para campos adicionales)
      const phoneMatch = card.desc?.match(/(?:tel|phone|cel|whatsapp)[:\s]*([\d\s\-\+\(\)]+)/i)
      const emailMatch = card.desc?.match(/(?:email|correo)[:\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)
      const instagramMatch = card.desc?.match(/(?:instagram|ig)[:\s]*@?([a-zA-Z0-9._]+)/i)

      const contact_phone = phoneMatch ? phoneMatch[1].replace(/\s/g, "") : ""
      const contact_email = emailMatch ? emailMatch[1] : null
      const contact_instagram = instagramMatch ? instagramMatch[1] : null

      // Intentar extraer destino de labels o nombre de tarjeta
      let destination = "Sin destino"
      if (card.labels && card.labels.length > 0) {
        // Usar el primer label como destino si existe
        destination = card.labels[0].name
      } else {
        // Intentar extraer del nombre (formato: "Nombre - Destino")
        const parts = card.name.split(/[-:,\n]/)
        if (parts.length > 1) {
          destination = parts.slice(1).join(" ").trim() || "Sin destino"
        }
      }

      // Mapear miembros de Trello a vendedores
      let assigned_seller_id: string | null = null
      if (card.idMembers && card.idMembers.length > 0 && card.members) {
        // Buscar el primer miembro asignado
        const member = card.members[0]
        const memberName = (member.fullName || member.username || "").trim()
        const normalizedMemberName = memberName.toLowerCase().replace(/\s+/g, "")
        
        // Intentar mapear por nombre normalizado
        if (normalizedMemberName && sellerMap.has(normalizedMemberName)) {
          assigned_seller_id = sellerMap.get(normalizedMemberName)!
        } else if (member.email && sellerMap.has(member.email.toLowerCase())) {
          assigned_seller_id = sellerMap.get(member.email.toLowerCase())!
        } else {
          // Buscar por coincidencia parcial
          for (const [key, sellerId] of Array.from(sellerMap.entries())) {
            if (normalizedMemberName.includes(key) || key.includes(normalizedMemberName)) {
              assigned_seller_id = sellerId
              break
            }
          }
        }
      }

      const leadData = {
        agency_id: agencyId,
        source: "Trello" as const,
        external_id: card.id,
        trello_url: card.url,
        trello_list_id: card.idList, // Guardar el ID de la lista de Trello
        status: status as any,
        region: region as any,
        destination,
        contact_name: contactName, // Nombre exacto de la tarjeta
        contact_phone,
        contact_email,
        contact_instagram,
        assigned_seller_id,
        notes: notes, // Descripción completa de Trello
        updated_at: new Date().toISOString(),
      }

      const { error: insertError } = await (supabase.from("leads") as any)
        .insert(leadData)
        .select()
        .single()

      if (insertError) {
        console.error(`   ❌ Error creando lead ${card.id}:`, insertError.message)
        errors++
      } else {
        created++
        if (created % 100 === 0) {
          console.log(`   📊 Procesadas ${created} tarjetas...`)
        }
      }
    } catch (error: any) {
      console.error(`   ❌ Error procesando tarjeta ${card.id}:`, error.message)
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
  console.log("")
  console.log("📋 Listas encontradas:")
  lists.forEach((list: any) => {
    const status = listStatusMapping[list.id] || "NEW"
    const region = listRegionMapping[list.id] || "OTROS"
    console.log(`   - ${list.name} → Estado: ${status}, Región: ${region}`)
  })
}

syncTrelloComplete().catch(console.error)

