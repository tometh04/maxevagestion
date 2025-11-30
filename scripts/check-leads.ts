import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkLeads() {
  // Get Rosario agency
  const { data: agencies } = await supabase
    .from("agencies")
    .select("id, name")
    .eq("name", "Rosario")
    .single()

  if (!agencies) {
    console.log("No se encontró agencia Rosario")
    return
  }

  const rosarioAgencyId = agencies.id
  console.log(`Agencia Rosario ID: ${rosarioAgencyId}`)

  const { data: leads } = await supabase
    .from("leads")
    .select("id, contact_name, source, agency_id, agencies(name)")
    .eq("agency_id", rosarioAgencyId)
    .limit(10)
    .order("created_at", { ascending: false })

  console.log("\nPrimeros 10 leads de Rosario:")
  console.log(JSON.stringify(leads, null, 2))

  const { count } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("agency_id", rosarioAgencyId)

  console.log(`\nTotal leads en Rosario: ${count}`)

  // Count by source for Rosario
  const { data: bySource } = await supabase
    .from("leads")
    .select("source")
    .eq("agency_id", rosarioAgencyId)
  
  const sourceCounts = (bySource || []).reduce((acc: any, lead: any) => {
    acc[lead.source] = (acc[lead.source] || 0) + 1
    return acc
  }, {})

  console.log("\nLeads por fuente (Rosario):")
  console.log(JSON.stringify(sourceCounts, null, 2))
}

checkLeads().catch(console.error)

