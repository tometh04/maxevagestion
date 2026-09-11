import { requestQuotationJson } from "../request-client"

describe("quotation request deadline", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it.each(["connection", "body"])("releases a stalled %s without retrying an uncertain issue", async phase => {
    global.fetch = jest.fn().mockImplementation(() => phase === "connection"
      ? new Promise(() => {})
      : Promise.resolve({ json: () => new Promise(() => {}) }))
    const result = requestQuotationJson("/api/quotations/id/document", { method: "POST" })
      .catch(error => error.message)
    await jest.advanceTimersByTimeAsync(45_001)
    expect(await result).toContain("comprobar si se guardó")
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(jest.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(jest.getTimerCount()).toBe(0)
  })

  it("clears the deadline after a successful response", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: 1 }) })
    expect((await requestQuotationJson("/api/quotations/id")).json).toEqual({ data: 1 })
    expect(jest.getTimerCount()).toBe(0)
  })
})
