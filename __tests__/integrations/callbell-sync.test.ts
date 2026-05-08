/**
 * @jest-environment node
 *
 * Integration test for processCallbellEvent against real Supabase prod.
 * Creates a TEST_CALLBELL_ORG_<timestamp> tenant and cleans up afterAll.
 *
 * Skipped if SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL not set.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import { processCallbellEvent } from "@/lib/integrations/callbell/sync-handler"
import type { CallbellWebhookEvent } from "@/lib/integrations/callbell/types"
import type { Database } from "@/lib/supabase/types"

loadEnv({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const skipIfNoCreds = !SUPABASE_URL || !SERVICE_ROLE
const describeOrSkip = skipIfNoCreds ? describe.skip : describe

describeOrSkip("processCallbellEvent", () => {
  let admin: SupabaseClient<Database>
  let testOrgId: string
  let testAgencyId: string
  let testLeadId: string
  let funnelTargetId: string
  let funnelTargetCallbellUuid: string
  let tagId: string
  let tagCallbellUuid: string
  const TEST_PHONE = `+549110${Date.now().toString().slice(-7)}`

  beforeAll(async () => {
    admin = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE!)

    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: `TEST_CALLBELL_ORG_${Date.now()}`,
        slug: `test-cb-${Date.now()}`,
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
        name: "Test Agency CB",
        city: "Buenos Aires",
        timezone: "America/Argentina/Buenos_Aires",
      } as never)
      .select("id")
      .single()
    testAgencyId = (agency as { id: string }).id

    // Funnels — 2 funnels, default y target
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

    funnelTargetCallbellUuid = "callbell-funnel-cotizando-uuid"
    const { data: f2 } = await admin
      .from("lead_funnels")
      .insert({
        org_id: testOrgId,
        name: "COTIZANDO",
        display_order: 2,
        color: "yellow",
        callbell_funnel_uuid: funnelTargetCallbellUuid,
      } as never)
      .select("id")
      .single()
    funnelTargetId = (f2 as { id: string }).id

    // Categoría + tag con callbell uuid mapeado
    const { data: cat } = await admin
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

    tagCallbellUuid = "callbell-tag-cancun-uuid"
    const { data: t } = await admin
      .from("lead_tags")
      .insert({
        org_id: testOrgId,
        category_id: (cat as { id: string }).id,
        label: "CANCUN",
        display_order: 1,
        callbell_tag_uuid: tagCallbellUuid,
      } as never)
      .select("id")
      .single()
    tagId = (t as { id: string }).id

    // Lead que el sync handler va a actualizar
    const { data: lead } = await admin
      .from("leads")
      .insert({
        org_id: testOrgId,
        agency_id: testAgencyId,
        source: "Manychat",
        status: "NEW",
        region: "OTROS",
        destination: "A definir",
        contact_name: "Lead CB Test",
        contact_phone: TEST_PHONE,
        funnel_id: defaultFunnelId,
        notes: "[origen]\n",
      } as never)
      .select("id")
      .single()
    testLeadId = (lead as { id: string }).id
  })

  afterAll(async () => {
    if (testOrgId && admin) {
      await admin.from("organizations").delete().eq("id", testOrgId)
    }
  })

  function makeEvent(
    type: string,
    extra: Record<string, unknown>
  ): CallbellWebhookEvent {
    return {
      type,
      uuid: `test-event-${type}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: {
        contact: {
          uuid: "callbell-contact-uuid",
          name: "Lead CB Test",
          phoneNumber: TEST_PHONE,
          channel: "whatsapp",
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...extra,
      },
    } as CallbellWebhookEvent
  }

  it("ignores event when contact phone doesn't match any lead", async () => {
    const ev: CallbellWebhookEvent = {
      type: "funnel_changed",
      uuid: "ignored",
      timestamp: new Date().toISOString(),
      data: {
        contact: {
          uuid: "x",
          name: "x",
          phoneNumber: "+5491100009999",
          channel: "whatsapp",
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        funnelStage: { uuid: funnelTargetCallbellUuid, name: "COTIZANDO" },
      },
    }
    const result = await processCallbellEvent(admin, testOrgId, ev)
    expect(result.handled).toBe(false)
  })

  it("funnel_changed updates leads.funnel_id", async () => {
    const ev = makeEvent("funnel_changed", {
      funnelStage: { uuid: funnelTargetCallbellUuid, name: "COTIZANDO" },
    })
    const result = await processCallbellEvent(admin, testOrgId, ev)
    expect(result.handled).toBe(true)
    expect(result.lead_id).toBe(testLeadId)

    const { data: lead } = await admin
      .from("leads")
      .select("funnel_id")
      .eq("id", testLeadId)
      .single()
    expect((lead as { funnel_id: string }).funnel_id).toBe(funnelTargetId)
  })

  it("tag_added inserts lead_tag_assignments row", async () => {
    const ev = makeEvent("tag_added", {
      tag: { uuid: tagCallbellUuid, name: "CANCUN" },
    })
    const result = await processCallbellEvent(admin, testOrgId, ev)
    expect(result.handled).toBe(true)

    const { data: assignments } = await admin
      .from("lead_tag_assignments")
      .select("tag_id")
      .eq("lead_id", testLeadId)
    expect((assignments ?? []).map((a: { tag_id: string }) => a.tag_id)).toContain(
      tagId
    )
  })

  it("tag_removed deletes lead_tag_assignments row", async () => {
    // Ensure tag is currently assigned
    await admin.from("lead_tag_assignments").upsert(
      {
        lead_id: testLeadId,
        tag_id: tagId,
        org_id: testOrgId,
      } as never,
      { onConflict: "lead_id,tag_id" }
    )

    const ev = makeEvent("tag_removed", {
      tag: { uuid: tagCallbellUuid, name: "CANCUN" },
    })
    const result = await processCallbellEvent(admin, testOrgId, ev)
    expect(result.handled).toBe(true)

    const { data: assignments } = await admin
      .from("lead_tag_assignments")
      .select("tag_id")
      .eq("lead_id", testLeadId)
      .eq("tag_id", tagId)
    expect(assignments?.length ?? 0).toBe(0)
  })

  it("message_created appends to notes with timestamp tag", async () => {
    const ev = makeEvent("message_created", {
      message: { text: "hola, sigo interesado" },
    })
    const result = await processCallbellEvent(admin, testOrgId, ev)
    expect(result.handled).toBe(true)

    const { data: lead } = await admin
      .from("leads")
      .select("notes")
      .eq("id", testLeadId)
      .single()
    expect((lead as { notes: string }).notes).toContain("Callbell msg")
    expect((lead as { notes: string }).notes).toContain("hola, sigo interesado")
  })

  it("returns { handled: false } for unknown event_type", async () => {
    const ev = makeEvent("some_unknown_event", {})
    const result = await processCallbellEvent(admin, testOrgId, ev)
    expect(result.handled).toBe(false)
    expect(result.lead_id).toBe(testLeadId) // lead was found, just nothing to do
  })
})
