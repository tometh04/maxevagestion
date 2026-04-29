/**
 * Simula el webhook MP authorized: org pasa de PENDING_PAYMENT → TRIALING
 * con trial_ends_at + 7 días y mp_preapproval_id seteado.
 *
 * Esto imita exactamente lo que haría transitionFromMP() cuando llega un
 * webhook con status=authorized + free_trial activo.
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import * as path from "path"

config({ path: path.join(__dirname, "../.env.local") })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ORG_ID = "5f26d2a1-af61-4ab6-805f-5f55b7029e35"
const PREAPPROVAL_ID = "eb2fcd5a44d14e6ba0c58be92b271436"

async function main() {
  const trialEndsAt = new Date()
  trialEndsAt.setDate(trialEndsAt.getDate() + 7)

  const { data, error } = await supabase
    .from("organizations")
    .update({
      subscription_status: "TRIALING",
      has_used_trial: true,
      trial_ends_at: trialEndsAt.toISOString(),
      current_period_ends_at: trialEndsAt.toISOString(),
      mp_preapproval_id: PREAPPROVAL_ID,
      mp_last_synced_at: new Date().toISOString(),
    })
    .eq("id", ORG_ID)
    .select("id, name, subscription_status, trial_ends_at, current_period_ends_at, mp_preapproval_id")

  if (error) { console.error(error); process.exit(1) }

  // Log evento en billing_events imitando lo que el webhook haría
  await supabase.from("billing_events").insert({
    org_id: ORG_ID,
    event_type: "SUBSCRIPTION_AUTHORIZED",
    external_id: PREAPPROVAL_ID,
    amount_cents: 119000 * 100,
    currency: "ARS",
    status: "authorized",
    payload: {
      simulated: true,
      note: "Simulación del webhook MP por E2E testing (reCAPTCHA bloqueó el checkout UI)",
      preapproval_id: PREAPPROVAL_ID,
    },
  })

  console.log("Updated org:", data)
  console.log(`Trial expires: ${trialEndsAt.toISOString()}`)
}
main()
