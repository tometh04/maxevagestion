import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import * as path from "path"

config({ path: path.join(__dirname, "../.env.local") })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data, error } = await supabase
    .from("organizations")
    .update({ subscription_status: "PENDING_PAYMENT", trial_ends_at: null })
    .eq("name", "E2E Test Agency")
    .select("id, name, subscription_status, trial_ends_at")
  console.log("Updated:", data, "Error:", error)
}
main()
