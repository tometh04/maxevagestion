import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function check() {
  const { data: leads } = await supabase
    .from("leads")
    .select("id, source, trello_list_id, contact_name")
    .eq("source", "Trello")
    .limit(10)

  console.log("Sample Trello leads:")
  leads?.forEach((lead: any) => {
    console.log(`- ${lead.contact_name}: trello_list_id = ${lead.trello_list_id || "NULL"}`)
  })

  const { count: withListId } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("source", "Trello")
    .not("trello_list_id", "is", null)

  const { count: withoutListId } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("source", "Trello")
    .is("trello_list_id", null)

  console.log(`\nLeads con trello_list_id: ${withListId}`)
  console.log(`Leads sin trello_list_id: ${withoutListId}`)
}

check().catch(console.error)

