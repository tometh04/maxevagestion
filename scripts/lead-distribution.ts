import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const { data: leads } = await admin
    .from("leads")
    .select("assigned_seller_id, users:assigned_seller_id(name)")
    .eq("org_id", "586bca09-029e-4cc9-8762-2ad01d468428")

  const counts: Record<string, number> = {}
  let unassigned = 0
  for (const l of (leads ?? []) as any[]) {
    if (!l.assigned_seller_id) {
      unassigned++
      continue
    }
    const name = l.users?.name ?? "(?)"
    counts[name] = (counts[name] ?? 0) + 1
  }

  console.log(`📊 Distribución de leads VICO (${leads?.length} total)`)
  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a)
  for (const [name, n] of sorted) {
    console.log(`  ${name.padEnd(30)} ${n}`)
  }
  console.log(`  ${"(sin asignar)".padEnd(30)} ${unassigned}`)
})()
