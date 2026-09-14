import { waitForEmiliaJob } from "../async-turn"
import { applyEmiliaTurnUpdate, type EmiliaChatMessage } from "../progressive-turn"

describe("waitForEmiliaJob", () => {
  it("keeps hotel previews across a worker retry and recovers after four auth outages", async () => {
    const hotels = { count: 1, items: [{ id: "hotel-preview" }] }
    const reply = (data: unknown, status = 200) => ({ ok: status === 200, status, json: async () => data }) as Response
    const mock = jest.mocked(global.fetch)
      .mockResolvedValueOnce(reply({ status: "processing", job_id: "job", attempt: 1,
        progress: { version: 102, attempt: 1, products: { hotels: "available" } }, results: { hotels } }))
      .mockResolvedValueOnce(reply({ status: "processing", job_id: "job", attempt: 2 }))
    for (let i = 0; i < 4; i++) mock.mockResolvedValueOnce(reply({ error: "Authentication service is temporarily unavailable" }, 503))
    mock.mockResolvedValueOnce(reply({ status: "completed", results: { hotels } }))
    let messages: EmiliaChatMessage[] = []
    const result = waitForEmiliaJob({ jobId: "job", conversationId: "conversation", immediate: true, pollAfterMs: 500,
      onProgress: update => { messages = applyEmiliaTurnUpdate(messages, "job", update) } })
    const outcome = result.then(value => ({ value }), error => ({ error }))
    await jest.advanceTimersByTimeAsync(500)
    expect(messages[0].cards?.hotels).toEqual(hotels)
    await jest.advanceTimersByTimeAsync(60_000)
    expect(await outcome).toMatchObject({ value: { status: "completed" } })
    expect(mock.mock.calls.every(([url]) => String(url).includes("/jobs/job?conversationId=conversation"))).toBe(true)
  })

  it("bounds repeated outages by the overall wait budget", async () => {
    jest.mocked(global.fetch).mockResolvedValue({ ok: false, status: 503,
      json: async () => ({ error: "Authentication service is temporarily unavailable" }) } as Response)
    const result = waitForEmiliaJob({ jobId: "job", conversationId: "conversation", immediate: true,
      pollAfterMs: 500, maxWaitMs: 20_000 })
    const assertion = expect(result).rejects.toMatchObject({ kind: "timeout" })
    await jest.advanceTimersByTimeAsync(30_000)
    await assertion
  })

  it("does not retry a rejected credential", async () => {
    jest.mocked(global.fetch).mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "No autorizado" }) } as Response)
    await expect(waitForEmiliaJob({ jobId: "job", conversationId: "conversation", immediate: true })).rejects.toMatchObject({ kind: "http", status: 401 })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
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
  it("delivers a stage change even when the product snapshot has not changed", async () => {
    const onProgress = jest.fn()
    const progress = { version: 103, attempt: 1, products: { flights: "available", hotels: "available" } }
    const reply = (data: unknown) => ({ ok: true, json: async () => data }) as Response
    jest.mocked(global.fetch)
      .mockResolvedValueOnce(reply({ status: "processing", stage: "provider_search", attempt: 1, progress }))
      .mockResolvedValueOnce(reply({ status: "processing", stage: "context_persistence", attempt: 1, progress }))
      .mockResolvedValueOnce(reply({ status: "completed", stage: "completed", attempt: 1, progress }))
    const result = waitForEmiliaJob({ jobId: "job", conversationId: "conversation", pollAfterMs: 500, immediate: true, onProgress })
    await jest.advanceTimersByTimeAsync(1000)
    await expect(result).resolves.toMatchObject({ status: "completed" })
    expect(onProgress.mock.calls.map(([update]) => update.stage)).toEqual(["provider_search", "context_persistence"])
  })

})
