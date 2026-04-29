/**
 * Cleanup: borra rows huérfanos de victoria@erplozada.com (public.users y auth.users)
 * para poder reintentar create-victoria-seller.ts.
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import * as path from "path"

config({ path: path.join(__dirname, "../.env.local") })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EMAIL = "victoria@erplozada.com"

async function main() {
  // 1. Borrar public.users.
  const { data: pubUser } = await supabase
    .from("users")
    .select("id, auth_id")
    .eq("email", EMAIL)
    .maybeSingle()
  if (pubUser) {
    // Borrar FK downstream primero si hay.
    await supabase.from("user_agencies").delete().eq("user_id", pubUser.id)
    await supabase.from("organization_members").delete().eq("user_id", pubUser.auth_id)
    const { error: delErr } = await supabase.from("users").delete().eq("id", pubUser.id)
    if (delErr) {
      console.error("❌ DELETE public.users falló:", delErr.message)
      process.exit(1)
    }
    console.log(`✅ public.users borrado: ${pubUser.id}`)
  } else {
    console.log("ℹ️ No hay row en public.users")
  }

  // 2. Borrar auth.users si existe.
  const { data: allAuth } = await supabase.auth.admin.listUsers({ perPage: 200 })
  const victoriaAuth = allAuth?.users?.find((u) => u.email === EMAIL)
  if (victoriaAuth) {
    const { error: authDelErr } = await supabase.auth.admin.deleteUser(victoriaAuth.id)
    if (authDelErr) {
      console.error("❌ DELETE auth.users falló:", authDelErr.message)
      process.exit(1)
    }
    console.log(`✅ auth.users borrado: ${victoriaAuth.id}`)
  } else {
    console.log("ℹ️ No hay row en auth.users")
  }

  console.log("\n✅ Cleanup OK — podés correr create-victoria-seller.ts")
}

main().catch((err) => {
  console.error("❌ Fatal:", err)
  process.exit(1)
})
