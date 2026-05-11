/**
 * scripts/bootstrap-vico.ts
 *
 * One-off, idempotente. Crea TODA la infra de VICO en Vibook:
 *   1. Org "VICO Travel Group"
 *   2. Agency "VICO Travel Group"
 *   3. 10 users (auth + public.users + user_agencies)
 *   4. crm_mode = 'advanced' + seed (4 categorías + 60 tags + 7 funnels)
 *   5. org_integrations (manychat + callbell-in + callbell-out)
 *
 * Uso:
 *   CALLBELL_API_TOKEN='<token>' npx tsx scripts/bootstrap-vico.ts
 *
 * Idempotente: correrlo dos veces no duplica nada.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import crypto from "crypto"
import { seedAdvancedMode } from "../lib/crm-presets/seed-advanced-mode"
import {
  VICO_TAG_CATEGORIES,
  VICO_FUNNELS,
} from "../lib/crm-presets/vico-preset"
import { encryptSecret } from "../lib/integrations/secrets"

loadEnv({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const CALLBELL_API_TOKEN = process.env.CALLBELL_API_TOKEN

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing SUPABASE env vars")
  process.exit(1)
}
if (!CALLBELL_API_TOKEN) {
  console.error("Missing CALLBELL_API_TOKEN env var (pass inline)")
  process.exit(1)
}
if (!process.env.WEBHOOK_SECRET_ENCRYPTION_KEY) {
  console.error("Missing WEBHOOK_SECRET_ENCRYPTION_KEY")
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

const ORG_SLUG = "vico-travel"
const ORG_NAME = "VICO Travel Group"
const AGENCY_NAME = "VICO Travel Group"
const SHARED_PASSWORD = "VicoTravel2026"

type UserSpec = { email: string; name: string; role: string }

const USERS: UserSpec[] = [
  { email: "e.maineri@vicotravelgroup.com", name: "Enzo Maineri", role: "ORG_OWNER" },
  { email: "a.lagos@vicotravelgroup.com", name: "Andres Lagos", role: "ADMIN" },
  { email: "m.cassano@vicotravelgroup.com", name: "Manuela Cassano", role: "CONTABLE" },
  { email: "f.gudino@vicotravelgroup.com", name: "Florencia Gudiño", role: "SELLER" },
  { email: "ae.ibarra@vicotravelgroup.com", name: "Aldana Estefania Ibarra", role: "SELLER" },
  { email: "d.araujo@vicotravelgroup.com", name: "Daniela Araujo", role: "SELLER" },
  { email: "e.laporte@vicotravelgroup.com", name: "Emilia Laporte", role: "SELLER" },
  { email: "l.marchiori.vtg@gmail.com", name: "Luz Marchiori", role: "SELLER" },
  { email: "J.ahumada.vtg@gmail.com", name: "Julieta Ahumada", role: "SELLER" },
  { email: "a.sanchez.vtg@gmail.com", name: "Aldana Sanchez", role: "SELLER" },
]

async function main() {
  console.log("=".repeat(60))
  console.log("VICO Bootstrap — idempotente")
  console.log("=".repeat(60))

  // ───── Step 1: org ─────
  console.log("\n[1/5] Org…")
  let { data: org } = await admin
    .from("organizations")
    .select("id, name, crm_mode")
    .eq("slug", ORG_SLUG)
    .maybeSingle()

  if (org) {
    console.log(`  ✓ ya existe: ${(org as any).name} (id=${(org as any).id})`)
  } else {
    const { data: created, error } = await admin
      .from("organizations")
      .insert({
        name: ORG_NAME,
        slug: ORG_SLUG,
        plan: "PRO",
        subscription_status: "ACTIVE",
        max_users: 20,
        max_agencies: 3,
      } as any)
      .select("id, name, crm_mode")
      .single()
    if (error) throw error
    org = created
    console.log(`  ✓ creada: ${(org as any).name} (id=${(org as any).id})`)
  }
  const orgId = (org as any).id as string

  // ───── Step 2: agency ─────
  console.log("\n[2/5] Agency…")
  let { data: agency } = await admin
    .from("agencies")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("name", AGENCY_NAME)
    .maybeSingle()

  if (agency) {
    console.log(`  ✓ ya existe: ${(agency as any).name} (id=${(agency as any).id})`)
  } else {
    const { data: created, error } = await admin
      .from("agencies")
      .insert({
        org_id: orgId,
        name: AGENCY_NAME,
        city: "Buenos Aires",
        timezone: "America/Argentina/Buenos_Aires",
      } as any)
      .select("id, name")
      .single()
    if (error) throw error
    agency = created
    console.log(`  ✓ creada: ${(agency as any).name} (id=${(agency as any).id})`)
  }
  const agencyId = (agency as any).id as string

  // ───── Step 3: users ─────
  console.log("\n[3/5] Users…")
  for (const spec of USERS) {
    // Check public.users first by email
    const { data: existing } = await admin
      .from("users")
      .select("id, auth_id, role, org_id")
      .eq("email", spec.email)
      .maybeSingle()

    let appUserId: string
    let authUserId: string

    if (existing) {
      const e = existing as any
      console.log(`  • ${spec.email}: existe (role=${e.role}). Validando org_id…`)
      if (e.org_id && e.org_id !== orgId) {
        console.error(
          `    ❌ user ${spec.email} pertenece a OTRA org (${e.org_id}). Skipped — investigá manualmente.`
        )
        continue
      }
      // Patch missing fields
      if (e.org_id !== orgId || e.role !== spec.role) {
        await (admin.from("users") as any)
          .update({ org_id: orgId, role: spec.role, name: spec.name, is_active: true })
          .eq("id", e.id)
        console.log(`    ✓ patched (org_id=${orgId.slice(0, 8)}…, role=${spec.role})`)
      } else {
        console.log(`    ✓ ya OK`)
      }
      appUserId = e.id
      authUserId = e.auth_id
    } else {
      // Create auth user
      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email: spec.email,
        password: SHARED_PASSWORD,
        email_confirm: true,
        user_metadata: { name: spec.name },
      })
      if (authErr) {
        // Maybe auth user exists but not in public.users
        if (authErr.message && /already been registered|already exists/i.test(authErr.message)) {
          const { data: list } = await admin.auth.admin.listUsers()
          const found = list?.users?.find((u: any) => u.email === spec.email)
          if (!found) throw new Error(`Auth user lookup failed for ${spec.email}`)
          authUserId = found.id
          console.log(`  • ${spec.email}: auth user existe (id=${authUserId.slice(0, 8)}…), linkeando a public.users…`)
        } else {
          throw authErr
        }
      } else {
        authUserId = authData.user.id
        console.log(`  • ${spec.email}: auth creado (id=${authUserId.slice(0, 8)}…)`)
      }

      // Create public.users row
      const { data: appUser, error: appErr } = await admin
        .from("users")
        .insert({
          auth_id: authUserId,
          email: spec.email,
          name: spec.name,
          role: spec.role,
          org_id: orgId,
          is_active: true,
        } as any)
        .select("id")
        .single()
      if (appErr) throw appErr
      appUserId = (appUser as any).id
      console.log(`    ✓ public.users creado`)
    }

    // user_agencies link
    const { data: existingLink } = await admin
      .from("user_agencies")
      .select("user_id")
      .eq("user_id", appUserId)
      .eq("agency_id", agencyId)
      .maybeSingle()
    if (!existingLink) {
      const { error: linkErr } = await admin
        .from("user_agencies")
        .insert({ user_id: appUserId, agency_id: agencyId } as any)
      if (linkErr && linkErr.code !== "23505") throw linkErr
      console.log(`    ✓ linkeado a agency`)
    }
  }

  // ───── Step 4: seed advanced mode ─────
  console.log("\n[4/5] Seed advanced mode (tags + funnels)…")
  await seedAdvancedMode(admin as any, orgId, {
    categories: VICO_TAG_CATEGORIES,
    funnels: VICO_FUNNELS,
  })
  const [c, t, f, o] = await Promise.all([
    admin.from("lead_tag_categories").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    admin.from("lead_tags").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    admin.from("lead_funnels").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    admin.from("organizations").select("crm_mode").eq("id", orgId).single(),
  ])
  console.log(
    `  ✓ categories=${c.count}, tags=${t.count}, funnels=${f.count}, crm_mode='${(o.data as any).crm_mode}'`
  )

  // ───── Step 5: org_integrations ─────
  console.log("\n[5/5] org_integrations…")

  // Idempotency: if a row already exists for (org_id, integration), keep its token but update is_active.
  const integrations: Array<{ integration: string; plainSecret: string }> = [
    { integration: "manychat", plainSecret: crypto.randomBytes(32).toString("hex") },
    { integration: "callbell-in", plainSecret: crypto.randomBytes(32).toString("hex") },
    { integration: "callbell-out", plainSecret: CALLBELL_API_TOKEN! },
  ]

  const credentialsReport: Record<string, { url_token: string; plain_secret: string }> = {}

  for (const i of integrations) {
    const { data: existingRow } = await admin
      .from("org_integrations")
      .select("id, webhook_token, is_active")
      .eq("org_id", orgId)
      .eq("integration", i.integration)
      .maybeSingle()

    if (existingRow) {
      const e = existingRow as any
      console.log(
        `  • ${i.integration}: ya existe (token=${e.webhook_token.slice(0, 12)}…). NO regenero secret.`
      )
      credentialsReport[i.integration] = {
        url_token: e.webhook_token,
        plain_secret: "(ya existente, no regenerado)",
      }
    } else {
      const urlToken = crypto.randomBytes(16).toString("hex")
      const encryptedSecret = encryptSecret(i.plainSecret)
      const { error: insErr } = await admin.from("org_integrations").insert({
        org_id: orgId,
        integration: i.integration,
        webhook_token: urlToken,
        webhook_secret: encryptedSecret,
        is_active: true,
        config: {},
      } as any)
      if (insErr) throw insErr
      console.log(`  ✓ ${i.integration}: creado (token=${urlToken.slice(0, 12)}…)`)
      credentialsReport[i.integration] = {
        url_token: urlToken,
        plain_secret: i.plainSecret,
      }
    }
  }

  // ───── Summary ─────
  console.log("\n" + "=".repeat(60))
  console.log("RESUMEN")
  console.log("=".repeat(60))
  console.log(`Org ID: ${orgId}`)
  console.log(`Agency ID: ${agencyId}`)
  console.log(`Users: ${USERS.length} totales`)
  console.log(`Password compartida: ${SHARED_PASSWORD}`)
  console.log(`crm_mode: advanced`)
  console.log("\nCredenciales para los próximos pasos:")
  console.log(JSON.stringify(credentialsReport, null, 2))
  console.log("\nURLs de webhooks de VICO:")
  console.log(
    `  ManyChat → Vibook:    https://app.vibook.ai/api/integrations/manychat/${credentialsReport.manychat.url_token}/webhook`
  )
  console.log(
    `  Callbell → Vibook:    https://app.vibook.ai/api/integrations/callbell-in/${credentialsReport["callbell-in"].url_token}/webhook`
  )
  console.log("=".repeat(60))
  console.log("\n✅ Bootstrap completo.")
}

main().catch((e) => {
  console.error("\n❌ Error en bootstrap-vico:", e)
  process.exit(1)
})
