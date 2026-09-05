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

  it("delivers progress once per version before completion, without extra searches", async () => {
    const update = { status: "processing", attempt: 1, progress: { version: 102, attempt: 1, products: { flights: "available", hotels: "searching" } } }
    const onProgress = jest.fn()
    const reply = (data: unknown) => ({ ok: true, json: async () => data }) as Response
    jest.mocked(global.fetch)
      .mockResolvedValueOnce(reply(update))
      .mockResolvedValueOnce(reply(update))
      .mockResolvedValueOnce(reply({ status: "completed" }))
    const result = waitForEmiliaJob({ jobId: "job", conversationId: "conversation", pollAfterMs: 500, immediate: true, onProgress })
    await jest.advanceTimersByTimeAsync(0)
    expect(onProgress).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(1000)
    await expect(result).resolves.toMatchObject({ status: "completed" })
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it("does not hydrate a response that arrives after the chat is closed", async () => {
    const controller = new AbortController()
    const onProgress = jest.fn()
    jest.mocked(global.fetch).mockImplementation(async () => {
      controller.abort()
      return { ok: true, json: async () => ({ status: "processing", progress: { version: 102 } }) } as Response
    })
    await expect(waitForEmiliaJob({ jobId: "job", conversationId: "conversation", immediate: true,
      signal: controller.signal, onProgress })).rejects.toHaveProperty("name", "AbortError")
    expect(onProgress).not.toHaveBeenCalled()
  })

  it("recovers the persisted terminal result after a transient fetch failure", async () => {
    const fetchMock = jest.mocked(global.fetch)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "completed", results: { flights: { count: 40, items: [] } } }),
      } as Response)

    const resultPromise = waitForEmiliaJob({
      jobId: "11111111-1111-4111-8111-111111111111",
      conversationId: "22222222-2222-4222-8222-222222222222",
      pollAfterMs: 500,
    })
    const assertion = expect(resultPromise).resolves.toMatchObject({ status: "completed" })

    await jest.advanceTimersByTimeAsync(500)
    await jest.advanceTimersByTimeAsync(1000)

    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
