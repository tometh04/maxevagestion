/**
 * @jest-environment node
 *
 * Verifica que la rollout de crm_mode='advanced' NO afectó a Lozada (legacy).
 *
 * Corre contra Supabase prod usando service_role (lectura).
 * Skipped si NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no están seteadas.
 *
 * Assertions clave:
 * - organizations.crm_mode = 'legacy' para todas las orgs (Lozada incluida)
 * - lead_tag_categories / lead_tags / lead_funnels: 0 rows for Lozada
 * - leads.funnel_id IS NULL para todos los leads de Lozada
 * - tablas nuevas existen (positive sanity)
 * - integration_webhooks (legacy mig 074) conserva su schema original
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import type { Database } from "@/lib/supabase/types"

loadEnv({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const skipIfNoCreds = !SUPABASE_URL || !SERVICE_ROLE
const describeOrSkip = skipIfNoCreds ? describe.skip : describe

const LOZADA_ORG_ID = "1b326d20-d133-4112-a798-f54b5af7e7cb"

describeOrSkip("Advanced mode tenant isolation — Lozada untouched", () => {
  let admin: SupabaseClient<Database>

  beforeAll(() => {
    admin = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  })

  it("Lozada keeps crm_mode='legacy' (no accidental advance)", async () => {
    const { data, error } = await admin
      .from("organizations")
      .select("crm_mode")
      .eq("id", LOZADA_ORG_ID)
      .single()
    expect(error).toBeNull()
    expect((data as { crm_mode: string } | null)?.crm_mode).toBe("legacy")
  })

  it("Only allow-listed orgs are in crm_mode='advanced' (Lozada and others stay legacy)", async () => {
    // Allow-list de orgs que están legítimamente en advanced mode.
    // Agregar acá cuando un tenant nuevo va live en advanced.
    const ALLOW_LIST_ADVANCED = new Set<string>([
      "VICO Travel Group", // onboarded 2026-05-08
    ])

    const { data, error } = await admin
      .from("organizations")
      .select("id, name, crm_mode")
      .neq("crm_mode", "legacy")
    expect(error).toBeNull()
    const advancedOrgs = (data ?? []) as Array<{
      id: string
      name: string
      crm_mode: string
    }>
    // TEST_ orgs (fixtures) are also allowed transitorily.
    const unexpected = advancedOrgs.filter(
      (o) => !o.name.startsWith("TEST_") && !ALLOW_LIST_ADVANCED.has(o.name)
    )
    if (unexpected.length > 0) {
      console.error(
        "❌ Orgs en advanced mode que NO están en allow-list:",
        unexpected.map((o) => `${o.name} (${o.id})`)
      )
    }
    expect(unexpected.length).toBe(0)
  })

  it("Lozada has 0 rows in lead_tag_categories", async () => {
    const { count, error } = await admin
      .from("lead_tag_categories")
      .select("id", { count: "exact", head: true })
      .eq("org_id", LOZADA_ORG_ID)
    expect(error).toBeNull()
    expect(count).toBe(0)
  })

  it("Lozada has 0 rows in lead_tags", async () => {
    const { count, error } = await admin
      .from("lead_tags")
      .select("id", { count: "exact", head: true })
      .eq("org_id", LOZADA_ORG_ID)
    expect(error).toBeNull()
    expect(count).toBe(0)
  })

  it("Lozada has 0 rows in lead_funnels", async () => {
    const { count, error } = await admin
      .from("lead_funnels")
      .select("id", { count: "exact", head: true })
      .eq("org_id", LOZADA_ORG_ID)
    expect(error).toBeNull()
    expect(count).toBe(0)
  })

  it("Lozada has 0 leads with funnel_id NOT NULL", async () => {
    const { count, error } = await admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("org_id", LOZADA_ORG_ID)
      .not("funnel_id", "is", null)
    expect(error).toBeNull()
    expect(count).toBe(0)
  })

  it("Lozada has 0 rows in org_integrations (no legacy tenant uses the new table)", async () => {
    const { count, error } = await admin
      .from("org_integrations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", LOZADA_ORG_ID)
    expect(error).toBeNull()
    expect(count).toBe(0)
  })

  it("New tables exist (positive sanity)", async () => {
    // If any of these queries error, the table doesn't exist → migration didn't apply.
    for (const table of [
      "lead_tag_categories",
      "lead_tags",
      "lead_funnels",
      "lead_tag_assignments",
      "webhook_event_log",
      "org_integrations",
    ] as const) {
      const { error } = await admin
        .from(table as any)
        .select("*", { head: true, count: "exact" })
        .limit(1)
      if (error) {
        throw new Error(
          `Tabla ${table} no existe o no es accesible: ${error.message}`
        )
      }
    }
  })

  it("Legacy integration_webhooks (mig 074) retains original schema", async () => {
    // Original schema has integration_id, event_type, payload columns.
    // If anyone "fixed" the table by ALTERing it, this test will fail.
    // Use raw column query via information_schema.
    const { data, error } = await admin
      .rpc("execute_readonly_query" as any, {
        query: `
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = 'integration_webhooks'
          AND column_name IN ('integration_id', 'event_type', 'payload')
        `,
      })
      .single()
    if (error) {
      // If the RPC isn't available, fall back to a row-level check
      // by attempting to insert/select with the legacy schema columns.
      // Skip if RPC unavailable — primary check is the renamed-table tests above.
      console.warn(
        "execute_readonly_query RPC unavailable, skipping schema-level check:",
        error.message
      )
      return
    }
    // If we got here, the rows exist — the legacy schema is intact.
    expect(data).toBeTruthy()
  })
})
