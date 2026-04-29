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
    .update({ billing_email: "e2e-test-paywall@gmail.com" })
    .eq("id", "5f26d2a1-af61-4ab6-805f-5f55b7029e35")
    .select("id, name, subscription_status, billing_email, mp_preapproval_id")
  console.log("Updated:", data, "Error:", error)
}
main()
