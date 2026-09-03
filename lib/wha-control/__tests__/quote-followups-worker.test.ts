import { runQuoteFollowupsWorker } from "../quote-followups-worker"

/**
 * Fake mínimo del query builder de supabase-js: cada from() arma un contexto
 * (tabla, operación, filtros, payload) y al await el handler del test decide
 * qué devolver.
 */
interface QueryCtx {
  table: string
  op: "select" | "update" | "insert"
  filters: Array<[string, ...any[]]>
  payload: any
}

type Handler = (ctx: QueryCtx) => { data: any; error: any }

function makeSupabase(handler: Handler) {
  const calls: QueryCtx[] = []
  const supabase = {
    from(table: string) {
      const ctx: QueryCtx = { table, op: "select", filters: [], payload: null }
      calls.push(ctx)
      const q: any = {
        select() {
          return q
        },
        update(p: any) {
          ctx.op = "update"
          ctx.payload = p
          return q
        },
        insert(p: any) {
          ctx.op = "insert"
          ctx.payload = p
          return q
        },
        eq(k: string, v: any) {
          ctx.filters.push(["eq", k, v])
          return q
        },
        in(k: string, v: any) {
          ctx.filters.push(["in", k, v])
          return q
        },
        gt(k: string, v: any) {
          ctx.filters.push(["gt", k, v])
          return q
        },
        or(s: string) {
          ctx.filters.push(["or", s])
          return q
        },
        order() {
          return q
        },
        limit() {
          return q
        },
        maybeSingle() {
          return q
        },
        single() {
          return q
        },
        then(res: any, rej: any) {
          return Promise.resolve(handler(ctx)).then(res, rej)
        },
      }
      return q
    },
    _calls: calls,
  }
  return supabase
}

function filterVal(ctx: QueryCtx, kind: string, key?: string) {
  const f = ctx.filters.find(
    (x) => x[0] === kind && (key === undefined || x[1] === key)
  )
  return f ? f[key === undefined ? 1 : 2] : undefined
}

// 12:00 ARG (dentro de la ventana 9-21)
const NOW = new Date("2026-09-03T15:00:00.000Z")

const baseFollowup = {
  id: "f1",
  org_id: "org1",
  device_id: "dev1",
  chat_id: "chat1",
  linked_chat_ids: ["chat1"],
  remote_jid: "5493411234567@s.whatsapp.net",
  status: "PENDING",
  marked_by: "u1",
  marked_at: "2026-09-02T15:00:00.000Z",
  scheduled_for: "2026-09-03T14:00:00.000Z",
  message_text: "Hola {nombre}! ¿Pudiste ver la cotización?",
  attempts: 0,
  lease_until: null,
  updated_at: "2026-09-02T15:00:00.000Z",
}

const settings = {
  wait_hours: 24,
  message_text: "Hola {nombre}! ¿Pudiste ver la cotización?",
  send_window_from: 9,
  send_window_to: 21,
}

interface Scenario {
  followup?: any
  claimOk?: boolean
  flagOn?: boolean
  messages?: any[]
  device?: any
  chat?: any
}

function scenarioHandler(s: Scenario): Handler {
  const followup = s.followup ?? baseFollowup
  return (ctx) => {
    if (ctx.table === "wa_quote_followups" && ctx.op === "select") {
      // Lista de candidatos (tiene .or) vs pasada earlyCancel (eq status PENDING).
      if (ctx.filters.some((f) => f[0] === "or")) {
        return { data: [followup], error: null }
      }
      return { data: [], error: null } // earlyCancelReplied: nada pendiente
    }
    if (ctx.table === "wa_quote_followups" && ctx.op === "update") {
      const isClaim = ctx.payload?.status === "PROCESSING"
      if (isClaim) {
        return { data: s.claimOk === false ? [] : [{ id: followup.id }], error: null }
      }
      return { data: [{ id: followup.id }], error: null }
    }
    if (ctx.table === "organization_settings") {
      return {
        data:
          s.flagOn === false
            ? []
            : [{ key: "features.wha_quote_followup", value: "true" }],
        error: null,
      }
    }
    if (ctx.table === "wa_followup_settings") {
      return { data: settings, error: null }
    }
    if (ctx.table === "wa_messages") {
      return { data: s.messages ?? [], error: null }
    }
    if (ctx.table === "wa_devices") {
      return { data: s.device ?? { id: "dev1", status: "CONNECTED" }, error: null }
    }
    if (ctx.table === "wa_chats") {
      return { data: s.chat ?? { contact_name: "Marta", push_name: null }, error: null }
    }
    return { data: null, error: null }
  }
}

const deps = (send: jest.Mock) => ({
  now: () => NOW,
  send,
  sleep: async () => {},
})

describe("runQuoteFollowupsWorker", () => {
  it("envía y marca SENT cuando no hay respuesta", async () => {
    const send = jest.fn().mockResolvedValue({ ok: true, waMessageId: "wamid1" })
    const supabase = makeSupabase(scenarioHandler({}))

    const counters = await runQuoteFollowupsWorker(supabase, deps(send))

    expect(send).toHaveBeenCalledWith({
      deviceId: "dev1",
      remoteJid: "5493411234567@s.whatsapp.net",
      text: "Hola Marta! ¿Pudiste ver la cotización?",
    })
    expect(counters.sent).toBe(1)

    const sentUpdate = supabase._calls.find(
      (c) => c.table === "wa_quote_followups" && c.payload?.status === "SENT"
    )
    expect(sentUpdate?.payload.sent_wa_message_id).toBe("wamid1")
  })

  it("claim perdido => skip, no envía", async () => {
    const send = jest.fn()
    const supabase = makeSupabase(scenarioHandler({ claimOk: false }))

    const counters = await runQuoteFollowupsWorker(supabase, deps(send))

    expect(send).not.toHaveBeenCalled()
    expect(counters.skipped).toBe(1)
    expect(counters.sent).toBe(0)
  })

  it("cliente respondió => CANCELLED client_replied, no envía", async () => {
    const send = jest.fn()
    const supabase = makeSupabase(
      scenarioHandler({
        messages: [
          { direction: "inbound", sent_at: "2026-09-02T18:00:00.000Z" },
        ],
      })
    )

    const counters = await runQuoteFollowupsWorker(supabase, deps(send))

    expect(send).not.toHaveBeenCalled()
    expect(counters.cancelled).toBe(1)
    const cancelUpdate = supabase._calls.find(
      (c) => c.payload?.status === "CANCELLED"
    )
    expect(cancelUpdate?.payload.cancelled_reason).toBe("client_replied")
  })

  it("device desconectado => pospone", async () => {
    const send = jest.fn()
    const supabase = makeSupabase(
      scenarioHandler({ device: { id: "dev1", status: "DISCONNECTED" } })
    )

    const counters = await runQuoteFollowupsWorker(supabase, deps(send))

    expect(send).not.toHaveBeenCalled()
    expect(counters.postponed).toBe(1)
    const postponeUpdate = supabase._calls.find(
      (c) => c.op === "update" && c.payload?.status === "PENDING"
    )
    expect(postponeUpdate?.payload.last_error).toContain("DISCONNECTED")
  })

  it("device LOGGED_OUT => CANCELLED device_unavailable", async () => {
    const send = jest.fn()
    const supabase = makeSupabase(
      scenarioHandler({ device: { id: "dev1", status: "LOGGED_OUT" } })
    )

    const counters = await runQuoteFollowupsWorker(supabase, deps(send))

    expect(send).not.toHaveBeenCalled()
    expect(counters.cancelled).toBe(1)
    const cancelUpdate = supabase._calls.find(
      (c) => c.payload?.status === "CANCELLED"
    )
    expect(cancelUpdate?.payload.cancelled_reason).toBe("device_unavailable")
  })

  it("connector falla => attempts++ y vuelve a PENDING", async () => {
    const send = jest.fn().mockResolvedValue({ ok: false, waMessageId: null, error: "timeout" })
    const supabase = makeSupabase(scenarioHandler({}))

    const counters = await runQuoteFollowupsWorker(supabase, deps(send))

    expect(counters.postponed).toBe(1)
    const retryUpdate = supabase._calls.find(
      (c) => c.op === "update" && c.payload?.attempts === 1
    )
    expect(retryUpdate?.payload.status).toBe("PENDING")
    expect(retryUpdate?.payload.last_error).toBe("timeout")
  })

  it("tope de attempts => FAILED", async () => {
    const send = jest.fn().mockResolvedValue({ ok: false, waMessageId: null, error: "timeout" })
    const supabase = makeSupabase(
      scenarioHandler({ followup: { ...baseFollowup, attempts: 4 } })
    )

    const counters = await runQuoteFollowupsWorker(supabase, deps(send))

    expect(counters.failed).toBe(1)
    const failUpdate = supabase._calls.find(
      (c) => c.payload?.status === "FAILED"
    )
    expect(failUpdate?.payload.attempts).toBe(5)
  })

  it("flag apagado al disparo => CANCELLED sin enviar", async () => {
    const send = jest.fn()
    const supabase = makeSupabase(scenarioHandler({ flagOn: false }))

    const counters = await runQuoteFollowupsWorker(supabase, deps(send))

    expect(send).not.toHaveBeenCalled()
    expect(counters.cancelled).toBe(1)
  })

  it("recovery de PROCESSING con echo ya persistido => SENT sin reenviar", async () => {
    const send = jest.fn()
    const processing = {
      ...baseFollowup,
      status: "PROCESSING",
      lease_until: "2026-09-03T14:30:00.000Z", // lease vencido vs NOW
      updated_at: "2026-09-03T14:20:00.000Z",
    }
    const supabase = makeSupabase((ctx) => {
      const base = scenarioHandler({ followup: processing })
      if (ctx.table === "wa_messages") {
        // El echo del envío de la corrida anterior ya está en la base.
        return {
          data: [
            {
              wa_message_id: "wamid-echo",
              body_text: "Hola Marta! ¿Pudiste ver la cotización?",
              sent_at: "2026-09-03T14:21:00.000Z",
            },
          ],
          error: null,
        }
      }
      return base(ctx)
    })

    const counters = await runQuoteFollowupsWorker(supabase, deps(send))

    expect(send).not.toHaveBeenCalled()
    expect(counters.sent).toBe(1)
    const sentUpdate = supabase._calls.find(
      (c) => c.payload?.status === "SENT"
    )
    expect(sentUpdate?.payload.sent_wa_message_id).toBe("wamid-echo")
  })

  it("fuera de ventana horaria => pospone al próximo slot", async () => {
    const send = jest.fn()
    const lateNow = new Date("2026-09-04T01:30:00.000Z") // 22:30 ARG
    const supabase = makeSupabase(scenarioHandler({}))

    const counters = await runQuoteFollowupsWorker(supabase, {
      now: () => lateNow,
      send,
      sleep: async () => {},
    })

    expect(send).not.toHaveBeenCalled()
    expect(counters.postponed).toBe(1)
    const postponeUpdate = supabase._calls.find(
      (c) => c.op === "update" && c.payload?.scheduled_for
    )
    // Próximo slot: 9:00 ARG del 2026-09-04 = 12:00Z
    expect(postponeUpdate?.payload.scheduled_for).toBe(
      "2026-09-04T12:00:00.000Z"
    )
  })
})
