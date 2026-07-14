import { waitForEmiliaJob } from "../async-turn"

describe("waitForEmiliaJob", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.useRealTimers()
    delete (global as any).fetch
  })

  it("polls until the BFF returns a terminal result", async () => {
    const fetchMock = jest.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "processing", poll_after_ms: 500 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "completed", results: { hotels: { count: 1, items: [{}] } } }),
      } as Response)

    const resultPromise = waitForEmiliaJob({
      jobId: "11111111-1111-4111-8111-111111111111",
      conversationId: "22222222-2222-4222-8222-222222222222",
      pollAfterMs: 500,
    })

    await jest.advanceTimersByTimeAsync(500)
    await jest.advanceTimersByTimeAsync(500)

    await expect(resultPromise).resolves.toMatchObject({ status: "completed" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("surfaces a terminal job failure", async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "failed", error: { message: "Proveedor no disponible" } }),
    } as Response)

    const resultPromise = waitForEmiliaJob({
      jobId: "11111111-1111-4111-8111-111111111111",
      conversationId: "22222222-2222-4222-8222-222222222222",
      pollAfterMs: 500,
    })
    const rejection = expect(resultPromise).rejects.toThrow("Proveedor no disponible")
    await jest.advanceTimersByTimeAsync(500)
    await rejection
  })
})
