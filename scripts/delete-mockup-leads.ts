/**
 * Script para eliminar todos los leads de mockup
 * Solo deja los leads que vienen de Trello (source = "Trello")
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function deleteMockupLeads() {
  console.log("🔄 Eliminando leads de mockup...")
  console.log("")

  // 1. Contar leads antes
  const { count: totalBefore } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })

  const { count: trelloLeads } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("source", "Trello")

  const { count: mockupLeads } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .neq("source", "Trello")

  console.log("Estado actual:")
  console.log(`   - Total leads: ${totalBefore}`)
  console.log(`   - Leads de Trello: ${trelloLeads}`)
  console.log(`   - Leads de mockup: ${mockupLeads}`)
  console.log("")

  if (mockupLeads === 0) {
    console.log("✅ No hay leads de mockup para eliminar")
    return
  }

  // 2. Eliminar todos los leads que NO son de Trello
  console.log("2. Eliminando leads de mockup...")
  
  const { error: deleteError, count: deletedCount } = await supabase
    .from("leads")
    .delete({ count: "exact" })
    .neq("source", "Trello")

  if (deleteError) {
    console.error("   ❌ Error eliminando leads:", deleteError)
    process.exit(1)
  }

  console.log(`   ✓ ${deletedCount} leads de mockup eliminados`)

  // 3. Verificar estado final
  console.log("")
  console.log("3. Verificando estado final...")
  
  const { count: totalAfter } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })

  const { count: trelloLeadsAfter } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("source", "Trello")

  console.log("Estado final:")
  console.log(`   - Total leads: ${totalAfter}`)
  console.log(`   - Leads de Trello: ${trelloLeadsAfter}`)
  console.log("")

  // 4. Mostrar algunos ejemplos de leads de Trello
  const { data: sampleLeads } = await supabase
    .from("leads")
    .select("id, contact_name, source, destination, status, agencies(name)")
    .eq("source", "Trello")
    .limit(5)
    .order("created_at", { ascending: false })

  if (sampleLeads && sampleLeads.length > 0) {
    console.log("Ejemplos de leads de Trello:")
    sampleLeads.forEach((lead: any) => {
      console.log(`   - ${lead.contact_name} | ${lead.destination} | ${lead.status} | ${lead.agencies?.name || "N/A"}`)
    })
  }

  console.log("")
  console.log("✅ ¡Limpieza completada!")
}

deleteMockupLeads().catch(console.error)

