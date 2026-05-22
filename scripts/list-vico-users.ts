import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const { data: users } = await admin
    .from("users")
    .select("id, name, email, role, is_active")
    .eq("org_id", "586bca09-029e-4cc9-8762-2ad01d468428")
    .order("role")
    .order("email")

  console.log("USERS VICO en Vibook:")
  for (const u of (users ?? []) as any[]) {
    console.log(
      `  ${u.role.padEnd(12)} | ${u.email.padEnd(35)} | ${u.name}${u.is_active ? "" : " (INACTIVE)"}`
    )
  }
})()
