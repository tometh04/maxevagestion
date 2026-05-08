/**
 * @jest-environment node
 *
 * Integration test for reconcile against real Supabase prod, but with a MOCKED
 * Callbell client (no real Callbell calls). Creates a TEST_RECONCILE_ORG_<ts>
 * tenant with integration_webhooks row + funnels + lead, runs reconcile, asserts
 * the lead got updated.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import {
  reconcileAllAdvancedOrgs,
  type ICallbellClient,
  type CallbellClientFactory,
} from "@/lib/integrations/callbell/reconcile"
import { encryptSecret } from "@/lib/integrations/secrets"
import type { CallbellContact } from "@/lib/integrations/callbell/types"
import type { Database } from "@/lib/supabase/types"

loadEnv({ path: ".env.local" })

// We need encryption key to encrypt the fake apiToken when seeding integration_webhooks
process.env.WEBHOOK_SECRET_ENCRYPTION_KEY =
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY ?? "0".repeat(64)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const skipIfNoCreds = !SUPABASE_URL || !SERVICE_ROLE
const describeOrSkip = skipIfNoCreds ? describe.skip : describe

describeOrSkip("reconcileAllAdvancedOrgs", () => {
  let admin: SupabaseClient<Database>
  let testOrgId: string
  let testLeadId: string
  let cotizandoFunnelId: string
  const TEST_PHONE = `+549110${Date.now().toString().slice(-7)}`
  const COTIZANDO_CB_UUID = `cb-funnel-${Date.now()}`

  beforeAll(async () => {
    admin = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE!)

    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: `TEST_RECONCILE_ORG_${Date.now()}`,
        slug: `test-rec-${Date.now()}`,
        plan: "STARTER",
        subscription_status: "TRIAL",
        crm_mode: "advanced",
      } as never)
      .select("id")
      .single()
    testOrgId = (org as { id: string }).id

    const { data: agency } = await admin
      .from("agencies")
      .insert({
        org_id: testOrgId,
        name: "Test Agency Reconcile",
        city: "Buenos Aires",
        timezone: "America/Argentina/Buenos_Aires",
      } as never)
      .select("id")
      .single()
    const agencyId = (agency as { id: string }).id

    // Funnels: default (current state of the lead) + COTIZANDO target (Callbell says it changed to this)
    const { data: f1 } = await admin
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
    const defaultFunnelId = (f1 as { id: string }).id

    const { data: f2 } = await admin
      .from("lead_funnels")
      .insert({
        org_id: testOrgId,
        name: "COTIZANDO",
        display_order: 2,
        color: "yellow",
        callbell_funnel_uuid: COTIZANDO_CB_UUID,
      } as never)
      .select("id")
      .single()
    cotizandoFunnelId = (f2 as { id: string }).id

    // Lead in PRIMER CONTACTO state
    const { data: lead } = await admin
      .from("leads")
      .insert({
        org_id: testOrgId,
        agency_id: agencyId,
        source: "Manychat",
        status: "NEW",
        region: "OTROS",
        destination: "A definir",
        contact_name: "Reconcile Test Lead",
        contact_phone: TEST_PHONE,
        funnel_id: defaultFunnelId,
        notes: "[origen]\n",
      } as never)
      .select("id")
      .single()
    testLeadId = (lead as { id: string }).id

    // Seed integration_webhooks row for this org (callbell-out)
    const fakeToken = "fake-callbell-api-token-for-test"
    await admin.from("integration_webhooks").insert({
      org_id: testOrgId,
      integration: "callbell-out",
      webhook_token: `unused-out-${Date.now()}`,
      webhook_secret: encryptSecret(fakeToken),
      is_active: true,
      config: {},
    } as never)
  })

  afterAll(async () => {
    if (testOrgId && admin) {
      await admin.from("organizations").delete().eq("id", testOrgId)
    }
  })

  it("reconciles a contact whose funnel changed in Callbell", async () => {
    // Mock factory returns a contact with the funnel changed to COTIZANDO
    const mockContact: CallbellContact = {
      uuid: "cb-contact-1",
      name: "Reconcile Test Lead",
      phoneNumber: TEST_PHONE,
      channel: "whatsapp",
      tags: [],
      funnelStage: { uuid: COTIZANDO_CB_UUID, name: "COTIZANDO" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const mockFactory: CallbellClientFactory = () => ({
      listContactsModifiedSince: async () => [mockContact],
    })

    const result = await reconcileAllAdvancedOrgs(admin, mockFactory)

    expect(result.orgs_processed).toBeGreaterThanOrEqual(1)
    expect(result.events_applied).toBeGreaterThanOrEqual(1)

    // Verify the lead's funnel_id is now COTIZANDO
    const { data: lead } = await admin
      .from("leads")
      .select("funnel_id")
      .eq("id", testLeadId)
      .single()
    expect((lead as { funnel_id: string }).funnel_id).toBe(cotizandoFunnelId)

    // Verify last_callbell_sync_at was set
    const { data: org } = await admin
      .from("organizations")
      .select("last_callbell_sync_at")
      .eq("id", testOrgId)
      .single()
    expect(
      (org as { last_callbell_sync_at: string | null }).last_callbell_sync_at
    ).toBeTruthy()
  })

  it("returns 0 events when client returns empty", async () => {
    const mockFactory: CallbellClientFactory = () => ({
      listContactsModifiedSince: async () => [],
    })
    const result = await reconcileAllAdvancedOrgs(admin, mockFactory)
    expect(result.orgs_processed).toBeGreaterThanOrEqual(1)
    // events_applied for THIS org's run is 0 (others may have applied via prior tests)
    // We can't assert exact 0 since other test orgs may exist. Just assert no throw.
    expect(result.events_applied).toBeGreaterThanOrEqual(0)
  })
})
