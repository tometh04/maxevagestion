/**
 * Simula escenarios día 8:
 *   A) PAST_DUE — MP rechazó el cobro
 *   B) ACTIVE — MP cobró OK (simula cobro mes 1)
 *   C) CANCELLED + expirado — acceso bloqueado
 *
 * Uso: npx tsx scripts/simulate-day8.ts <scenario>
 *   scenario: PAST_DUE | ACTIVE | CANCELLED_EXPIRED
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

async function main() {
  const scenario = process.argv[2] || "PAST_DUE"
  const now = new Date()
  const past = new Date(now.getTime() - 86400_000).toISOString()
  const nextMonth = new Date(now.getTime() + 30 * 86400_000).toISOString()

  let updates: Record<string, any>
  let eventType: string
  let eventStatus: string

  switch (scenario) {
    case "PAST_DUE":
      // Day 8: MP intentó cobrar y falló
      updates = {
        subscription_status: "PAST_DUE",
        trial_ends_at: past,
        // current_period_ends_at se queda igual (gracia de MP)
      }
      eventType = "PAYMENT_REJECTED"
      eventStatus = "rejected"
      break
    case "ACTIVE":
      // Day 8: MP cobró el primer ciclo OK
      updates = {
        subscription_status: "ACTIVE",
        trial_ends_at: null,
        current_period_ends_at: nextMonth,
      }
      eventType = "PAYMENT_APPROVED"
      eventStatus = "approved"
      break
    case "CANCELLED_EXPIRED":
      // Usuario canceló + pasó la fecha de corte
      updates = {
        subscription_status: "CANCELLED",
        current_period_ends_at: past,
      }
      eventType = "SUBSCRIPTION_CANCELLED"
      eventStatus = "cancelled"
      break
    default:
      console.error("Invalid scenario")
      process.exit(1)
  }

  const { data, error } = await supabase
    .from("organizations")
    .update(updates)
    .eq("id", ORG_ID)
    .select("id, subscription_status, trial_ends_at, current_period_ends_at")

  if (error) { console.error(error); process.exit(1) }

  await supabase.from("billing_events").insert({
    org_id: ORG_ID,
    event_type: eventType,
    external_id: `sim-day8-${Date.now()}`,
    amount_cents: scenario === "ACTIVE" ? 119000 * 100 : null,
    currency: "ARS",
    status: eventStatus,
    payload: { simulated: true, scenario },
  })

  console.log(`Scenario: ${scenario}`)
  console.log("Updated:", data)
}
main()
