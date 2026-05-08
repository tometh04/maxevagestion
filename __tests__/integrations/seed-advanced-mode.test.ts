/**
 * @jest-environment node
 *
 * Integration test for seedAdvancedMode against real Supabase.
 *
 * Skipped if SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL not set
 * (so unrelated test runs don't break in dev without creds).
 *
 * Pattern follows __tests__/isolation/tenant-segregation.test.ts.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import { seedAdvancedMode } from "@/lib/crm-presets/seed-advanced-mode"
import { VICO_TAG_CATEGORIES, VICO_FUNNELS } from "@/lib/crm-presets/vico-preset"
import type { Database } from "@/lib/supabase/types"

loadEnv({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

const skipIfNoCreds = !SUPABASE_URL || !SERVICE_ROLE
const describeOrSkip = skipIfNoCreds ? describe.skip : describe

describeOrSkip("seedAdvancedMode", () => {
  let admin: SupabaseClient<Database>
  let testOrgId: string

  beforeAll(async () => {
    admin = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE!)
    const slug = `test-seed-${Date.now()}`
    const { data, error } = await admin
      .from("organizations")
      .insert({
        name: `TEST_SEED_ORG_${Date.now()}`,
        slug,
        plan: "STARTER",
        subscription_status: "TRIAL",
      } as never)
      .select("id")
      .single()
    if (error) throw error
    testOrgId = (data as { id: string }).id
  })

  afterAll(async () => {
    if (testOrgId && admin) {
      await admin.from("organizations").delete().eq("id", testOrgId)
    }
  })

  it("creates 4 categories, 60 tags, 7 funnels for VICO preset and sets crm_mode='advanced'", async () => {
    await seedAdvancedMode(admin, testOrgId, {
      categories: VICO_TAG_CATEGORIES,
      funnels: VICO_FUNNELS,
    })

    const { data: cats } = await admin
      .from("lead_tag_categories")
      .select("id")
      .eq("org_id", testOrgId)
    expect(cats?.length).toBe(4)

    const { data: tags } = await admin
      .from("lead_tags")
      .select("id")
      .eq("org_id", testOrgId)
    expect(tags?.length).toBe(60)

    const { data: funnels } = await admin
      .from("lead_funnels")
      .select("id, is_default_new")
      .eq("org_id", testOrgId)
    expect(funnels?.length).toBe(7)
    const defaults = (funnels ?? []).filter(
      (f: { is_default_new: boolean }) => f.is_default_new
    )
    expect(defaults.length).toBe(1)

    const { data: org } = await admin
      .from("organizations")
      .select("crm_mode")
      .eq("id", testOrgId)
      .single()
    expect((org as { crm_mode: string } | null)?.crm_mode).toBe("advanced")
  })

  it("is idempotent — calling twice doesn't duplicate", async () => {
    await seedAdvancedMode(admin, testOrgId, {
      categories: VICO_TAG_CATEGORIES,
      funnels: VICO_FUNNELS,
    })
    await seedAdvancedMode(admin, testOrgId, {
      categories: VICO_TAG_CATEGORIES,
      funnels: VICO_FUNNELS,
    })

    const { data: tags } = await admin
      .from("lead_tags")
      .select("id")
      .eq("org_id", testOrgId)
    expect(tags?.length).toBe(60)

    const { data: funnels } = await admin
      .from("lead_funnels")
      .select("id")
      .eq("org_id", testOrgId)
    expect(funnels?.length).toBe(7)
  })
})
