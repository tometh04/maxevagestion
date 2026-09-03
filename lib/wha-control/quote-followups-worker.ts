/**
 * Worker del cron de seguimientos post-cotización (WHA Control).
 *
 * Procesa wa_quote_followups vencidos: verifica cancelaciones (cliente
 * respondió / vendedor retomó), ventana horaria, estado del device, y envía
 * el mensaje por el connector. Concurrencia entre corridas resuelta con
 * claim CAS + lease (patrón quotation_conversion_effects / past-due-reminders).
 *
 * Cross-tenant por diseño (lo invoca /api/cron/wha-quote-followups con admin
 * client); todo write preserva org_id porque solo actualiza filas ya scopeadas.
 */

import {
  computeScheduledFor,
  decideFollowupAction,
  isWithinSendWindow,
  nextWindowSlot,
  renderFollowupText,
  MAX_POSTPONE_HOURS,
  MAX_SEND_ATTEMPTS,
  type SendWindow,
} from "@/lib/wha-control/quote-followups"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_WHA_QUOTE_FOLLOWUP } from "@/lib/feature-flags"
import {
  sendWhaMessage,
  type SendWhaMessageParams,
  type SendWhaMessageResult,
} from "@/lib/wha-control/send-message"

const BATCH_LIMIT = 50
const LEASE_MINUTES = 10
const DEVICE_RETRY_MINUTES = 30
const MAX_SENDS_PER_DEVICE = 15
const JITTER_MIN_MS = 2000
const JITTER_MAX_MS = 5000

export interface WorkerCounters {
  claimed: number
  sent: number
  cancelled: number
  postponed: number
  failed: number
  skipped: number
}

export interface WorkerDeps {
  now?: () => Date
  send?: (params: SendWhaMessageParams) => Promise<SendWhaMessageResult>
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function runQuoteFollowupsWorker(
  supabase: any,
  deps: WorkerDeps = {}
): Promise<WorkerCounters> {
  const now = deps.now ?? (() => new Date())
  const send = deps.send ?? sendWhaMessage
  const sleep = deps.sleep ?? defaultSleep

  const counters: WorkerCounters = {
    claimed: 0,
    sent: 0,
    cancelled: 0,
    postponed: 0,
    failed: 0,
    skipped: 0,
  }

  const nowIso = now().toISOString()

  // Candidatos: vencidos PENDING, o PROCESSING con lease caído (corrida
  // anterior muerta a mitad de camino).
  const { data: candidates, error } = await supabase
    .from("wa_quote_followups")
    .select("*")
    .or(
      `and(status.eq.PENDING,scheduled_for.lte.${nowIso}),and(status.eq.PROCESSING,lease_until.lt.${nowIso})`
    )
    .order("scheduled_for", { ascending: true })
    .limit(BATCH_LIMIT)

  if (error) {
    console.error("[wha-quote-followups] error listando candidatos:", error)
    return counters
  }
  if (!candidates || candidates.length === 0) return counters

  // Config y flag por org, cacheados por corrida (nunca config global).
  const orgCache = new Map<
    string,
    { flagOn: boolean; settings: any | null }
  >()
  async function getOrgContext(orgId: string) {
    const cached = orgCache.get(orgId)
    if (cached) return cached
    const flagOn = await getOrgFeatureFlag(
      supabase,
      orgId,
      FEATURE_FLAG_WHA_QUOTE_FOLLOWUP
    )
    const { data: settings } = await supabase
      .from("wa_followup_settings")
      .select("wait_hours, message_text, send_window_from, send_window_to")
      .eq("org_id", orgId)
      .maybeSingle()
    const ctx = { flagOn, settings: settings ?? null }
    orgCache.set(orgId, ctx)
    return ctx
  }

  const sendsPerDevice = new Map<string, number>()

  for (const followup of candidates) {
    const wasProcessing = followup.status === "PROCESSING"

    // Claim CAS: si otra corrida lo tomó entre el select y acá, 0 filas.
    const leaseUntil = new Date(
      now().getTime() + LEASE_MINUTES * 60_000
    ).toISOString()
    let claimQuery = supabase
      .from("wa_quote_followups")
      .update({ status: "PROCESSING", lease_until: leaseUntil, updated_at: now().toISOString() })
      .eq("id", followup.id)
      .eq("status", followup.status)
    claimQuery = wasProcessing
      ? claimQuery.eq("lease_until", followup.lease_until)
      : claimQuery
    const { data: claimedRows, error: claimError } = await claimQuery.select("id")
    if (claimError || !claimedRows || claimedRows.length === 0) {
      counters.skipped++
      continue
    }
    counters.claimed++

    const linkedChatIds: string[] =
      followup.linked_chat_ids?.length > 0
        ? followup.linked_chat_ids
        : [followup.chat_id]

    // Nombre del contacto: se necesita para el token {nombre} y para
    // reconocer el echo de un envío previo (que ya salió renderizado).
    const { data: chatRow } = await supabase
      .from("wa_chats")
      .select("contact_name, push_name")
      .eq("id", followup.chat_id)
      .maybeSingle()
    const renderedText = renderFollowupText(
      followup.message_text,
      chatRow?.contact_name || chatRow?.push_name || null
    )

    // Recovery de PROCESSING: si la corrida anterior murió después de enviar
    // pero antes de marcar SENT, el echo de Baileys ya está en wa_messages.
    if (wasProcessing) {
      const { data: echo } = await supabase
        .from("wa_messages")
        .select("wa_message_id, body_text, sent_at")
        .in("chat_id", linkedChatIds)
        .eq("direction", "outbound")
        .gt("sent_at", followup.updated_at)
        .order("sent_at", { ascending: false })
        .limit(5)
      const match = (echo ?? []).find(
        (m: any) =>
          typeof m.body_text === "string" &&
          m.body_text.includes(renderedText.slice(0, 80))
      )
      if (match) {
        await markSent(supabase, followup.id, now(), match.wa_message_id ?? null)
        counters.sent++
        continue
      }
    }

    const { flagOn, settings } = await getOrgContext(followup.org_id)

    // La org apagó el feature entre la marca y el disparo: no enviar.
    if (!flagOn || !settings) {
      await cancel(supabase, followup.id, now(), "manual", "feature deshabilitado al disparo")
      counters.cancelled++
      continue
    }

    const window: SendWindow = {
      from: settings.send_window_from,
      to: settings.send_window_to,
    }

    // ¿El cliente respondió o el vendedor retomó el contacto?
    const { data: messages } = await supabase
      .from("wa_messages")
      .select("direction, sent_at")
      .in("chat_id", linkedChatIds)
      .gt("sent_at", followup.marked_at)
      .in("direction", ["inbound", "outbound"])
      .limit(200)

    const decision = decideFollowupAction({
      markedAt: new Date(followup.marked_at),
      messages: messages ?? [],
    })
    if (decision.action === "cancel") {
      await cancel(supabase, followup.id, now(), decision.reason)
      counters.cancelled++
      continue
    }

    // Ventana horaria al momento del disparo (puede haber quedado vencido
    // fuera de ventana si el cron estuvo caído).
    if (!isWithinSendWindow(now(), window)) {
      await postpone(supabase, followup.id, now(), nextWindowSlot(now(), window), null)
      counters.postponed++
      continue
    }

    // Vencimiento absoluto: si N horas después del disparo original sigue sin
    // poder salir, FAILED (evita mandar seguimientos rancios).
    const originalDue = computeScheduledFor(
      new Date(followup.marked_at),
      settings.wait_hours,
      window
    )
    const expired =
      now().getTime() - originalDue.getTime() > MAX_POSTPONE_HOURS * 3600_000

    // Estado del device.
    const { data: device } = await supabase
      .from("wa_devices")
      .select("id, status")
      .eq("id", followup.device_id)
      .maybeSingle()

    if (!device || device.status === "LOGGED_OUT") {
      await cancel(supabase, followup.id, now(), "device_unavailable")
      counters.cancelled++
      continue
    }
    if (device.status !== "CONNECTED") {
      if (expired) {
        await fail(supabase, followup.id, now(), followup.attempts, `device ${device.status} por más de ${MAX_POSTPONE_HOURS}h`)
        counters.failed++
      } else {
        await postpone(
          supabase,
          followup.id,
          now(),
          new Date(now().getTime() + DEVICE_RETRY_MINUTES * 60_000),
          `device ${device.status}`
        )
        counters.postponed++
      }
      continue
    }

    // Tope de envíos por device por corrida (anti-ban).
    const deviceSends = sendsPerDevice.get(followup.device_id) ?? 0
    if (deviceSends >= MAX_SENDS_PER_DEVICE) {
      await postpone(supabase, followup.id, now(), new Date(now().getTime() + DEVICE_RETRY_MINUTES * 60_000), "tope de envíos por corrida")
      counters.postponed++
      continue
    }

    const result = await send({
      deviceId: followup.device_id,
      remoteJid: followup.remote_jid,
      text: renderedText,
    })

    if (result.ok) {
      sendsPerDevice.set(followup.device_id, deviceSends + 1)
      await markSent(supabase, followup.id, now(), result.waMessageId)
      counters.sent++
      // Jitter entre envíos (anti-ban).
      const jitter =
        JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS))
      await sleep(jitter)
    } else {
      const attempts = (followup.attempts ?? 0) + 1
      if (attempts >= MAX_SEND_ATTEMPTS) {
        await fail(supabase, followup.id, now(), attempts, result.error ?? "envío falló")
        counters.failed++
      } else {
        await supabase
          .from("wa_quote_followups")
          .update({
            status: "PENDING",
            lease_until: null,
            attempts,
            last_error: result.error ?? "envío falló",
            updated_at: now().toISOString(),
          })
          .eq("id", followup.id)
        counters.postponed++
      }
    }
  }

  // Pasada barata: cancelar tempranamente PENDING aún no vencidos cuyo chat ya
  // tiene respuesta del cliente (mantiene el badge del inbox honesto).
  await earlyCancelReplied(supabase, now, counters)

  return counters
}

async function markSent(
  supabase: any,
  id: string,
  now: Date,
  waMessageId: string | null
) {
  await supabase
    .from("wa_quote_followups")
    .update({
      status: "SENT",
      sent_at: now.toISOString(),
      sent_wa_message_id: waMessageId,
      lease_until: null,
      updated_at: now.toISOString(),
    })
    .eq("id", id)
}

async function cancel(
  supabase: any,
  id: string,
  now: Date,
  reason: string,
  note?: string
) {
  await supabase
    .from("wa_quote_followups")
    .update({
      status: "CANCELLED",
      cancelled_reason: reason,
      cancelled_at: now.toISOString(),
      lease_until: null,
      ...(note ? { last_error: note } : {}),
      updated_at: now.toISOString(),
    })
    .eq("id", id)
}

async function postpone(
  supabase: any,
  id: string,
  now: Date,
  until: Date,
  note: string | null
) {
  await supabase
    .from("wa_quote_followups")
    .update({
      status: "PENDING",
      scheduled_for: until.toISOString(),
      lease_until: null,
      ...(note ? { last_error: note } : {}),
      updated_at: now.toISOString(),
    })
    .eq("id", id)
}

async function fail(
  supabase: any,
  id: string,
  now: Date,
  attempts: number,
  error: string
) {
  await supabase
    .from("wa_quote_followups")
    .update({
      status: "FAILED",
      attempts,
      last_error: error,
      lease_until: null,
      updated_at: now.toISOString(),
    })
    .eq("id", id)
}

async function earlyCancelReplied(
  supabase: any,
  now: () => Date,
  counters: WorkerCounters
) {
  const { data: pending } = await supabase
    .from("wa_quote_followups")
    .select("id, marked_at, linked_chat_ids, chat_id")
    .eq("status", "PENDING")
    .gt("scheduled_for", now().toISOString())
    .limit(200)

  for (const followup of pending ?? []) {
    const linkedChatIds: string[] =
      followup.linked_chat_ids?.length > 0
        ? followup.linked_chat_ids
        : [followup.chat_id]
    const { data: inbound } = await supabase
      .from("wa_messages")
      .select("id")
      .in("chat_id", linkedChatIds)
      .eq("direction", "inbound")
      .gt("sent_at", followup.marked_at)
      .limit(1)
    if (inbound && inbound.length > 0) {
      // CAS: solo si sigue PENDING (evita pisar un claim concurrente).
      const { data: updated } = await supabase
        .from("wa_quote_followups")
        .update({
          status: "CANCELLED",
          cancelled_reason: "client_replied",
          cancelled_at: now().toISOString(),
          updated_at: now().toISOString(),
        })
        .eq("id", followup.id)
        .eq("status", "PENDING")
        .select("id")
      if (updated && updated.length > 0) counters.cancelled++
    }
  }
}
