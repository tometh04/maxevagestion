/**
 * Setea trial_ends_at = mañana para la org "oficial testing vibook".
 * Útil para probar el flujo de vencimiento de trial en un caso real.
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import * as path from "path"

config({ path: path.join(__dirname, "../.env.local") })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // Buscar la org por nombre
  const { data: orgs, error: fetchError } = await supabase
    .from("organizations")
    .select("id, name, subscription_status, trial_ends_at, current_period_ends_at")
    .ilike("name", "%oficial testing vibook%")

  if (fetchError) {
    console.error("Error buscando org:", fetchError.message)
    process.exit(1)
  }

  if (!orgs || orgs.length === 0) {
    console.error("No se encontró ninguna org con ese nombre.")
    process.exit(1)
  }

  if (orgs.length > 1) {
    console.log("Múltiples orgs encontradas:")
    orgs.forEach(o => console.log(`  ${o.id} — ${o.name} (${o.subscription_status})`))
    console.error("Refiná el nombre.")
    process.exit(1)
  }

  const org = orgs[0]
  console.log(`Org encontrada: ${org.name} (${org.id})`)
  console.log(`  Status actual:       ${org.subscription_status}`)
  console.log(`  trial_ends_at actual: ${org.trial_ends_at ?? "null"}`)

  // Mañana a las 23:59:59 hora local Argentina (UTC-3)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(23, 59, 59, 0)
  const tomorrowIso = tomorrow.toISOString()

  const { error: updateError } = await supabase
    .from("organizations")
    .update({
      trial_ends_at: tomorrowIso,
      current_period_ends_at: tomorrowIso,
      subscription_status: "TRIALING",
    })
    .eq("id", org.id)

  if (updateError) {
    console.error("Error actualizando org:", updateError.message)
    process.exit(1)
  }

  console.log(`\n✓ trial_ends_at seteado a: ${tomorrowIso}`)
  console.log("  La org quedó en TRIALING. El billing-reconcile la pasará a PAST_DUE mañana.")
}

main()
