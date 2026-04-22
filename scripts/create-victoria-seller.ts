/**
 * One-off: crear user victoria@erplozada.com como SELLER en Lozada (Rosario).
 *
 * Run: npx tsx scripts/create-victoria-seller.ts
 *
 * Crea:
 *  - auth.users (email + password)
 *  - public.users (role SELLER, default_commission_percentage=13, org_id=Lozada)
 *  - organization_members (role MEMBER, status ACTIVE)
 *  - user_agencies (link a agencia Rosario)
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import * as path from "path"

config({ path: path.join(__dirname, "../.env.local") })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing Supabase env vars")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const EMAIL = "victoria@erplozada.com"
const PASSWORD = "lozada123"
const NAME = "Victoria"
const COMMISSION_PCT = 13

async function main() {
  // 1. Buscar la org de Lozada. El owner es Maxi — busco por nombre.
  console.log("🔍 Buscando org de Lozada…")
  const { data: orgs, error: orgErr } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .or("name.ilike.%lozada%,slug.ilike.%lozada%")
  if (orgErr) throw orgErr
  if (!orgs || orgs.length === 0) {
    console.error("❌ No se encontró org de Lozada")
    console.log("Orgs disponibles:")
    const { data: allOrgs } = await supabase.from("organizations").select("id, name, slug")
    console.table(allOrgs)
    process.exit(1)
  }
  if (orgs.length > 1) {
    console.warn("⚠️ Más de una org matchea 'lozada':", orgs)
  }
  const org = orgs[0]
  console.log(`✅ Org: ${org.name} (${org.id})`)

  // 2. Buscar agencia de Rosario dentro de esa org.
  console.log("🔍 Buscando agencia Rosario…")
  const { data: agencies, error: agErr } = await supabase
    .from("agencies")
    .select("id, name, city, org_id")
    .eq("org_id", org.id)
  if (agErr) throw agErr
  console.log("Agencias encontradas:")
  console.table(agencies)
  const rosario = agencies?.find(
    (a: any) =>
      (a.name || "").toLowerCase().includes("rosario") ||
      (a.city || "").toLowerCase().includes("rosario")
  )
  if (!rosario) {
    console.error("❌ No se encontró agencia con nombre/ciudad 'Rosario'")
    process.exit(1)
  }
  console.log(`✅ Agencia: ${rosario.name} / ${rosario.city} (${rosario.id})`)

  // 3. Chequeo de duplicados.
  const { data: existing } = await supabase
    .from("users")
    .select("id, email, org_id")
    .eq("email", EMAIL)
    .maybeSingle()
  if (existing) {
    console.error(`❌ Ya existe user con email ${EMAIL} (id ${existing.id})`)
    process.exit(1)
  }

  // 4. Crear auth user.
  console.log("🔨 Creando auth user…")
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: NAME },
  })
  if (authErr || !authData.user) {
    console.error("❌ Auth createUser falló:", authErr?.message)
    process.exit(1)
  }
  const authId = authData.user.id
  console.log(`✅ Auth user creado (auth_id=${authId})`)

  try {
    // 5. Crear public.users con role SELLER + commission.
    console.log("🔨 Insertando public.users…")
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .insert({
        auth_id: authId,
        org_id: org.id,
        name: NAME,
        email: EMAIL,
        role: "SELLER",
        is_active: true,
        default_commission_percentage: COMMISSION_PCT,
      })
      .select()
      .single()
    if (userErr || !userRow) throw new Error(`users insert: ${userErr?.message}`)
    console.log(`✅ public.users id=${userRow.id}`)

    // 6. organization_members (SELLER / ACTIVE).
    // CHECK acepta: 'OWNER' | 'ADMIN' | 'CONTABLE' | 'SELLER' | 'VIEWER'.
    console.log("🔨 Insertando organization_members…")
    const { error: memberErr } = await supabase.from("organization_members").insert({
      organization_id: org.id,
      user_id: authId,
      role: "SELLER",
      status: "ACTIVE",
    })
    if (memberErr) throw new Error(`organization_members: ${memberErr.message}`)
    console.log("✅ organization_members OK")

    // 7. user_agencies link a Rosario.
    console.log("🔨 Insertando user_agencies…")
    const { error: uaErr } = await supabase.from("user_agencies").insert({
      user_id: userRow.id,
      agency_id: rosario.id,
    })
    if (uaErr) throw new Error(`user_agencies: ${uaErr.message}`)
    console.log("✅ user_agencies OK")

    console.log("\n🎉 User creado con éxito")
    console.log(`   email: ${EMAIL}`)
    console.log(`   password: ${PASSWORD}`)
    console.log(`   rol: SELLER`)
    console.log(`   org: ${org.name}`)
    console.log(`   agencia: ${rosario.name} / ${rosario.city}`)
    console.log(`   comisión: ${COMMISSION_PCT}%`)
  } catch (err: any) {
    console.error("❌ Falló un insert post-auth. Intento rollback auth user…")
    try {
      await supabase.auth.admin.deleteUser(authId)
      console.log("✅ Rollback auth OK")
    } catch (cleanupErr: any) {
      console.error("⚠️ Rollback auth falló:", cleanupErr?.message)
    }
    console.error(err?.message || err)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("❌ Fatal:", err)
  process.exit(1)
})
