import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
config({ path: ".env.local" })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function q(label, sql) {
  const { data, error } = await sb.rpc("execute_readonly_query", { query_text: sql })
  console.log(`\n=== ${label} ===`)
  if (error) console.error("ERR:", error.message)
  else console.log(JSON.stringify(data, null, 2))
}
await q("estado actual: quotations uniques",
  "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'quotations'::regclass AND contype = 'u'")
await q("tax_withholdings tiene org_id ahora?",
  "SELECT column_name FROM information_schema.columns WHERE table_name = 'tax_withholdings' AND column_name IN ('org_id','agency_id')")
await q("generate_quotation_number existe?",
  "SELECT pg_get_function_identity_arguments(oid) AS args FROM pg_proc WHERE proname = 'generate_quotation_number'")
await q("users.commission_percentage existe?",
  "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name LIKE '%commission%'")
