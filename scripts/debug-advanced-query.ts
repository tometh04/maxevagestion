import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const orgId = "586bca09-029e-4cc9-8762-2ad01d468428"

;(async () => {
  // Query EXACTA que usa advanced-crm-kanban.tsx
  const r = await admin
    .from("leads")
    .select(
      `id, contact_name, contact_phone, contact_email, contact_instagram,
       destination, region, status, source,
       trello_url, trello_list_id, trello_full_data,
       assigned_seller_id, agency_id,
       created_at, updated_at, notes,
       quoted_price, has_deposit, deposit_amount, deposit_currency,
       deposit_method, deposit_date,
       archived_at, funnel_id,
       agencies(name),
       users:assigned_seller_id(name, email),
       assigned_seller:assigned_seller_id(name),
       tag_assignments:lead_tag_assignments(tag:tag_id(id, label, category:category_id(name, color))),
       operations(id, file_code, destination, status, created_at, departure_date, sale_amount_total)`
    )
    .eq("org_id", orgId)
    .not("funnel_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(500)

  console.log("Error:", r.error)
  console.log("Count:", r.data?.length)
  console.log("First lead:", JSON.stringify(r.data?.[0], null, 2))
})()
