/**
 * @jest-environment node
 *
 * Integration test for handleManychatAdvancedLead against real Supabase prod.
 * Creates a TEST_MANYCHAT_ORG_<timestamp> tenant and cleans up in afterAll.
 *
 * Skipped if SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL not set.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import { handleManychatAdvancedLead } from "@/lib/integrations/manychat/handler-advanced"
import type { Database } from "@/lib/supabase/types"

loadEnv({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const skipIfNoCreds = !SUPABASE_URL || !SERVICE_ROLE
const describeOrSkip = skipIfNoCreds ? describe.skip : describe

describeOrSkip("handleManychatAdvancedLead", () => {
  let admin: SupabaseClient<Database>
  let testOrgId: string
  let testAgencyId: string
  let defaultFunnelId: string

  beforeAll(async () => {
    admin = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE!)

    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({
        name: `TEST_MANYCHAT_ORG_${Date.now()}`,
        slug: `test-mc-${Date.now()}`,
        plan: "STARTER",
        subscription_status: "TRIAL",
        crm_mode: "advanced",
      } as never)
      .select("id")
      .single()
    if (orgErr) throw orgErr
    testOrgId = (org as { id: string }).id

    const { data: agency, error: agErr } = await admin
      .from("agencies")
      .insert({ org_id: testOrgId, name: "Test Agency MC", city: "Buenos Aires", timezone: "America/Argentina/Buenos_Aires" } as never)
      .select("id")
      .single()
    if (agErr) throw agErr
    testAgencyId = (agency as { id: string }).id

    // Categoría + tags mínimos para resolver test
    const { data: cat, error: catErr } = await admin
      .from("lead_tag_categories")
      .insert({
        org_id: testOrgId,
        name: "destino",
        color: "green",
        cardinality: "many",
        display_order: 1,
      } as never)
      .select("id")
      .single()
    if (catErr) throw catErr
    const categoryId = (cat as { id: string }).id

    await admin
      .from("lead_tags")
      .insert([
        {
          org_id: testOrgId,
          category_id: categoryId,
          label: "CANCUN",
          display_order: 1,
        },
      ] as never)

    // Funnel default
    const { data: funnel, error: fErr } = await admin
      .from("lead_funnels")
      .insert({
        org_id: testOrgId,
        name: "PRIMER CONTACTO",
        display_order: 1,
        color: "gray",
        is_default_new: true,
      } as never)
      .select("id")
      .single()
    if (fErr) throw fErr
    defaultFunnelId = (funnel as { id: string }).id
  })

  afterAll(async () => {
    if (testOrgId && admin) {
      await admin.from("organizations").delete().eq("id", testOrgId)
    }
  })

  it("creates lead with funnel_id set to default and assigns destination tag", async () => {
    const result = await handleManychatAdvancedLead(
      admin,
      testOrgId,
      testAgencyId,
      {
        name: "Cliente Test 1",
        phone: "+5491100000001",
        destination_text: "Cancun",
        travel_month: "JULIO",
        campaign_source: "publicidad",
        manychat_user_id: "mc-test-1",
      }
    )

    expect(result.lead_id).toBeDefined()
    expect(result.created).toBe(true)

    const { data: lead } = await admin
      .from("leads")
      .select("id, funnel_id, contact_name, contact_phone, source, status")
      .eq("id", result.lead_id)
      .single()
    const l = lead as {
      funnel_id: string
      contact_name: string
      contact_phone: string
      source: string
      status: string
    }
    expect(l.funnel_id).toBe(defaultFunnelId)
    expect(l.contact_name).toBe("Cliente Test 1")
    expect(l.contact_phone).toBe("+5491100000001")

    const { data: assignments } = await admin
      .from("lead_tag_assignments")
      .select("tag_id")
      .eq("lead_id", result.lead_id)
    // CANCUN exists in our test catalog → 1 assignment expected
    // (origen "publicidad" not seeded in this test, mes "JULIO" not seeded → 0 each)
    expect((assignments ?? []).length).toBe(1)
  })

  it("dedupes: a second call with same phone+agency appends note instead of creating new", async () => {
    const result1 = await handleManychatAdvancedLead(
      admin,
      testOrgId,
      testAgencyId,
      {
        name: "Cliente Dedupe",
        phone: "+5491100000002",
        destination_text: "Cancun",
        manychat_user_id: "mc-test-dedupe-1",
      }
    )
    expect(result1.created).toBe(true)

    const result2 = await handleManychatAdvancedLead(
      admin,
      testOrgId,
      testAgencyId,
      {
        name: "Cliente Dedupe (volvió)",
        phone: "+5491100000002",
        destination_text: "Cancun",
        manychat_user_id: "mc-test-dedupe-2",
      }
    )
    expect(result2.created).toBe(false)
    expect(result2.lead_id).toBe(result1.lead_id)

    const { data: lead } = await admin
      .from("leads")
      .select("notes")
      .eq("id", result1.lead_id)
      .single()
    expect((lead as { notes: string }).notes).toMatch(/ManyChat/)
    // Should have at least 2 timestamp entries
    const matches = ((lead as { notes: string }).notes ?? "").match(
      /ManyChat/g
    )
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2)
  })
})
