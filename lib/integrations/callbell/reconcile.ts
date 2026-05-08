import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { CallbellClient } from "./api-client"
import { decryptSecret } from "@/lib/integrations/secrets"
import { processCallbellEvent } from "./sync-handler"
import type {
  CallbellContact,
  CallbellWebhookEvent,
} from "./types"

/**
 * Interface so tests can inject a mock client without instantiating CallbellClient.
 */
export interface ICallbellClient {
  listContactsModifiedSince(sinceISO: string): Promise<CallbellContact[]>
}

/**
 * Factory function for the production CallbellClient.
 * Tests inject their own factory that returns a mock.
 */
export type CallbellClientFactory = (apiToken: string) => ICallbellClient

const defaultFactory: CallbellClientFactory = (token) => new CallbellClient(token)

/**
 * Reconcilia el estado entre Callbell y Vibook para todas las orgs en advanced mode.
 * Llamado por el cron cada 30 min.
 */
export async function reconcileAllAdvancedOrgs(
  admin: SupabaseClient<Database>,
  factory: CallbellClientFactory = defaultFactory
): Promise<{ orgs_processed: number; events_applied: number }> {
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, last_callbell_sync_at")
    .eq("crm_mode", "advanced")

  let totalEvents = 0
  const orgList = (orgs ?? []) as Array<{
    id: string
    last_callbell_sync_at: string | null
  }>

  for (const org of orgList) {
    const orgEvents = await reconcileSingleOrg(
      admin,
      org.id,
      org.last_callbell_sync_at,
      factory
    )
    totalEvents += orgEvents
  }

  return { orgs_processed: orgList.length, events_applied: totalEvents }
}

export async function reconcileSingleOrg(
  admin: SupabaseClient<Database>,
  orgId: string,
  lastSyncAt: string | null,
  factory: CallbellClientFactory = defaultFactory
): Promise<number> {
  const { data: integ } = await admin
    .from("integration_webhooks")
    .select("webhook_secret, is_active, config")
    .eq("org_id", orgId)
    .eq("integration", "callbell-out")
    .maybeSingle()
  if (!integ || !(integ as { is_active: boolean }).is_active) return 0

  const encrypted = (integ as { webhook_secret: string }).webhook_secret
  const apiToken = decryptSecret(encrypted)
  const client = factory(apiToken)

  // Default: si nunca sincronizamos, mirá las últimas 24h
  const since =
    lastSyncAt ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const contacts = await client.listContactsModifiedSince(since)

  let applied = 0
  for (const c of contacts) {
    // Sintetizamos un event "funnel_changed" + "agent_assigned" + "tag_added"
    // por cada cambio detectado. processCallbellEvent es idempotente (upsert).
    if (c.funnelStage) {
      const ev: CallbellWebhookEvent = {
        type: "funnel_changed",
        uuid: `reconcile-funnel-${c.uuid}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        data: { contact: c, funnelStage: c.funnelStage },
      }
      await processCallbellEvent(admin, orgId, ev)
      applied++
    }
    if (c.assignedAgent) {
      const ev: CallbellWebhookEvent = {
        type: "agent_assigned",
        uuid: `reconcile-agent-${c.uuid}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        data: { contact: c, agent: c.assignedAgent },
      }
      await processCallbellEvent(admin, orgId, ev)
      applied++
    }
    for (const tag of c.tags ?? []) {
      const ev: CallbellWebhookEvent = {
        type: "tag_added",
        uuid: `reconcile-tag-${c.uuid}-${tag.uuid}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        data: { contact: c, tag },
      }
      await processCallbellEvent(admin, orgId, ev)
      applied++
    }
  }

  // Update last_callbell_sync_at
  await admin
    .from("organizations")
    .update({ last_callbell_sync_at: new Date().toISOString() } as never)
    .eq("id", orgId)

  return applied
}
