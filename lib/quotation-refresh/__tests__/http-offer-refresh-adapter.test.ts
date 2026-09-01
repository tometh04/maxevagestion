import { createHttpOfferRefreshAdapter } from "@/lib/quotation-refresh/http-offer-refresh-adapter"
import { OfferRefreshPortError } from "@/lib/quotation-refresh/offer-refresh-port"

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response
}

function wireItem() {
  return {
    client_item_id: "line-1",
    source: {
      type: "search_artifact",
      artifact_id: "11111111-1111-4111-8111-111111111111",
      product: "flights",
      offer_id: "flight-1",
    },
    product: "flights",
    provider: "STARLING",
    method: "exact_reprice",
    outcome: "PRICE_CHANGED",
    confidence: "exact",
    previous: { price: { amount: 100, currency: "USD", basis: "AGENCY_NET" } },
    current: {
      price: { amount: 120, currency: "USD", basis: "AGENCY_NET" },
      source: {
        type: "search_artifact",
        artifact_id: "11111111-1111-4111-8111-111111111111",
        product: "flights",
        offer_id: "flight-1",
      },
      identity: { kind: "flight" },
    },
    candidates: [],
    differences: [{ field: "price.amount", before: 100, after: 120, material: true }],
    allowed_actions: ["KEEP_CURRENT", "APPLY_PRICE"],
    provider_checked_at: "2026-08-29T12:00:00.000Z",
    provider_expires_at: null,
    error: null,
  }
}

describe("HTTP offer refresh adapter", () => {
  it("envía el contrato agency-keyed y acepta el wire shape estricto", async () => {
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => response({
      schema_version: "offer-refresh.v1",
      request_id: "req_test_1",
      status: "complete",
      checked_at: "2026-08-29T12:00:00.000Z",
      items: [wireItem()],
    })) as unknown as typeof fetch
    const adapter = createHttpOfferRefreshAdapter({ fetchImpl, url: "https://wholesale.test/v1/offer-refresh" })

    const result = await adapter.refresh({
      apiKey: "agency-secret",
      requestId: "req_test_1",
      items: [{
        client_item_id: "line-1",
        current: { amount: 100, currency: "USD", basis: "AGENCY_NET" },
        source: {
          artifact_id: "11111111-1111-4111-8111-111111111111",
          product: "flights",
          offer_id: "flight-1",
        },
      }],
    })

    expect(result.items[0].outcome).toBe("PRICE_CHANGED")
    const [, init] = (fetchImpl as jest.Mock).mock.calls[0]
    expect(init.headers).toMatchObject({ "X-API-Key": "agency-secret" })
    expect(JSON.parse(String(init.body))).toEqual({
      request_id: "req_test_1",
      items: [{
        client_item_id: "line-1",
        current: { amount: 100, currency: "USD", basis: "AGENCY_NET" },
        source: {
          type: "search_artifact",
          artifact_id: "11111111-1111-4111-8111-111111111111",
          product: "flights",
          offer_id: "flight-1",
        },
      }],
    })
  })

  it("falla cerrado ante drift o líneas faltantes del servicio remoto", async () => {
    const drifted = wireItem() as any
    drifted.outcome = "price_changed"
    const adapter = createHttpOfferRefreshAdapter({
      fetchImpl: jest.fn(async () => response({
        schema_version: "offer-refresh.v1",
        request_id: "req_test_2",
        status: "complete",
        checked_at: "2026-08-29T12:00:00.000Z",
        items: [drifted],
      })) as unknown as typeof fetch,
      url: "https://wholesale.test/v1/offer-refresh",
    })

    await expect(adapter.refresh({
      apiKey: "agency-secret",
      requestId: "req_test_2",
      items: [{ client_item_id: "line-1", current: { amount: 100, currency: "USD", basis: "AGENCY_NET" }, fallback: { product: "flights", query: {}, identity: {} } }],
    })).rejects.toMatchObject<Partial<OfferRefreshPortError>>({ code: "INVALID_RESPONSE" })
  })

  it("rechaza producto híbrido o previous distinto del current enviado", async () => {
    for (const mutate of [
      (item: any) => { item.product = "hotels" },
      (item: any) => { item.previous.price.amount = 99 },
    ]) {
      const invalid = wireItem() as any
      mutate(invalid)
      const adapter = createHttpOfferRefreshAdapter({
        fetchImpl: jest.fn(async () => response({
          schema_version: "offer-refresh.v1",
          request_id: "req_scope",
          status: "complete",
          checked_at: "2026-08-29T12:00:00.000Z",
          items: [invalid],
        })) as unknown as typeof fetch,
        url: "https://wholesale.test/v1/offer-refresh",
      })

      await expect(adapter.refresh({
        apiKey: "agency-secret",
        requestId: "req_scope",
        items: [{
          client_item_id: "line-1",
          current: { amount: 100, currency: "USD", basis: "AGENCY_NET" },
          fallback: { product: "flights", query: {}, identity: {} },
        }],
      })).rejects.toMatchObject<Partial<OfferRefreshPortError>>({ code: "INVALID_RESPONSE" })
    }
  })

  it("espera y relee la misma request id cuando Wholesale todavía la está procesando", async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({
        ...response({ error: { code: "REQUEST_IN_PROGRESS", message: "processing" } }, 409),
        headers: { get: () => "0" },
      })
      .mockResolvedValueOnce(response({
        schema_version: "offer-refresh.v1",
        request_id: "req_test_3",
        status: "complete",
        checked_at: "2026-08-29T12:00:00.000Z",
        items: [wireItem()],
      })) as unknown as typeof fetch
    const adapter = createHttpOfferRefreshAdapter({ fetchImpl, url: "https://wholesale.test/v1/offer-refresh" })

    const result = await adapter.refresh({
      apiKey: "agency-secret",
      requestId: "req_test_3",
      items: [{ client_item_id: "line-1", current: { amount: 100, currency: "USD", basis: "AGENCY_NET" }, fallback: { product: "flights", query: {}, identity: {} } }],
    })

    expect(result.status).toBe("complete")
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect((fetchImpl as jest.Mock).mock.calls.map(call => JSON.parse(String(call[1].body)).request_id))
      .toEqual(["req_test_3", "req_test_3"])
  })
})
