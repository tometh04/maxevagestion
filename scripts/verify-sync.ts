import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function verify() {
  const { data: sample } = await supabase
    .from("leads")
    .select("contact_name, status, region, destination, notes, assigned_seller_id, users:assigned_seller_id(name)")
    .eq("source", "Trello")
    .limit(5)
    .order("created_at", { ascending: false })

  console.log("Ejemplos de leads sincronizados:")
  console.log(JSON.stringify(sample, null, 2))

  const { count } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("source", "Trello")

  console.log(`\nTotal leads de Trello: ${count}`)
}

verify().catch(console.error)

