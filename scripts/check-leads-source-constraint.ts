import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data, error } = await admin.rpc("exec_sql" as any, {
    sql: "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'leads_source_check';",
  } as any)
  if (error) {
    // Fallback: query pg_catalog vía postgres meta
    console.log("RPC failed, trying direct distinct values from existing leads:")
    const { data: leads } = await admin
      .from("leads")
      .select("source")
      .not("source", "is", null)
      .limit(500)
    const sources = new Set((leads as any[] ?? []).map((l) => l.source))
    console.log("Distinct sources used in DB:", Array.from(sources))
    return
  }
  console.log("Constraint definition:", data)
}

main().catch((e) => { console.error(e); process.exit(1) })
