import { applyEmiliaTurnUpdate, interruptEmiliaTurn } from "../progressive-turn"
import { normalizeEmiliaProgress } from "../turn-result"

const flight = { id: "flight-1", price: { amount: 100, currency: "USD" } }
const progress = { version: 102, attempt: 1, products: { flights: "available", hotels: "searching" } } as const
const partial = { status: "processing", job_id: "job-1", attempt: 1, progress,
  results: { flights: { count: 1, items: [flight] } }, requestType: "combined" }

describe("progressive response identity", () => {
  it("updates one bubble and preserves its identity through final hydration", () => {
    let messages = applyEmiliaTurnUpdate([], "client-1", { status: "queued" })
    messages = applyEmiliaTurnUpdate(messages, "client-1", partial as any)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ id: "client-1", jobId: "job-1", cards: partial.results })
    const withHotels = { ...partial, progress: { ...progress, version: 103, products: { flights: "available", hotels: "empty" } } }
    messages = applyEmiliaTurnUpdate(messages, "job-1", withHotels as any)
    messages = applyEmiliaTurnUpdate(messages, "job-1", { status: "completed", job_id: "job-1", results: partial.results } as any)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ id: "client-1", attempt: 1, jobStatus: "completed" })
    expect(messages[0].progress).toBeUndefined()
    expect(applyEmiliaTurnUpdate(messages, "job-1", partial as any)).toBe(messages)
  })

  it("rejects duplicate/older snapshots and clears old offers on a new attempt", () => {
    const messages = applyEmiliaTurnUpdate([], "job-1", partial as any)
    expect(applyEmiliaTurnUpdate(messages, "job-1", partial as any)).toBe(messages)
    const retry = applyEmiliaTurnUpdate(messages, "job-1", { status: "processing", attempt: 2 })
    expect(retry[0].cards).toBeUndefined()
    expect(retry[0].progress).toBeUndefined()
    expect(applyEmiliaTurnUpdate(retry, "job-1", partial as any)).toBe(retry)
  })

  it("retains visible flights on failure or a lost connection", () => {
    const messages = applyEmiliaTurnUpdate([], "job-1", partial as any)
    for (const terminal of [true, false]) {
      const failed = interruptEmiliaTurn(messages, "job-1", "Se interrumpió la búsqueda", terminal)
      expect(failed[0].cards).toBe(messages[0].cards)
      expect(failed[0].progress?.products).toEqual({ flights: "available", hotels: "failed" })
      expect(failed[0].jobStatus).toBe(terminal ? "failed" : "interrupted")
    }
  })
})

describe("BFF progress normalization", () => {
  it("uses canonical prices and IDs, and leaves pending hotels absent", () => {
    const data = { job_id: "job-1", attempt: 1, progress: {
      version: 102, attempt: 1, requested_products: ["flights", "hotels"],
      results: { result_sets: [{ product: "flights", status: "available", query: { adults: 2 }, data: [{
        id: "flight-1", provider: "STARLING", price: { amount: 100, currency: "USD" }, legs: [],
      }] }] },
    } }
    const normalized = normalizeEmiliaProgress(data)
    expect(normalized?.progress.products).toEqual({ flights: "available", hotels: "searching" })
    expect(normalized?.results.flights?.items[0]).toMatchObject({ id: "flight-1", price: { amount: 100, basis: "GROUP_TOTAL" } })
    expect(normalized?.results.hotels).toBeUndefined()
    expect(normalizeEmiliaProgress({ ...data, attempt: 2 })).toBeUndefined()
    expect(normalizeEmiliaProgress({ progress: { version: -1 } })).toBeUndefined()
  })
})


describe("real runtime stages", () => {
  it.each([
    ["context_loading", "Revisando el contexto de la conversación…"],
    ["parsing", "Interpretando tu pedido…"],
    ["routing", "Definiendo qué buscar…"],
    ["state_preparation", "Organizando los resultados…"],
    ["context_persistence", "Guardando los resultados de tu búsqueda…"],
    ["finalizing", "Finalizando la respuesta…"],
    ["unknown", "Esperando una actualización de Emilia…"],
  ])("renders %s from the reported stage", (stage, text) => {
    expect(applyEmiliaTurnUpdate([], "job-1", { job_id: "job-1", status: "processing", stage })[0].text).toBe(text)
  })

  it("advances the stage without replacing an unchanged snapshot or its cards", () => {
    const messages = applyEmiliaTurnUpdate([], "job-1", { ...partial, stage: "provider_search" } as any)
    expect(messages[0].text).toBe("Ya tenés vuelos. Sigo buscando hoteles…")
    const next = applyEmiliaTurnUpdate(messages, "job-1", { ...partial, stage: "context_persistence" } as any)
    expect(next[0].text).toBe("Guardando los resultados de tu búsqueda…")
    expect(next[0].cards).toBe(messages[0].cards)
    expect(next[0].id).toBe(messages[0].id)
    expect(applyEmiliaTurnUpdate(next, "job-1", { ...partial, stage: "provider_search", progress: { ...progress, version: 101 } } as any)).toBe(next)
  })

  it("distinguishes sending from a confirmed queue and does not guess requested products", () => {
    expect(applyEmiliaTurnUpdate([], "client", { status: "queued" })[0].text).toBe("Enviando tu pedido…")
    expect(applyEmiliaTurnUpdate([], "client", { status: "queued", job_id: "job" })[0].text).toBe("Tu pedido está en espera…")
    expect(applyEmiliaTurnUpdate([], "client", { status: "processing", job_id: "job", stage: "provider_search" })[0].text).toBe("Consultando disponibilidad con los proveedores…")
  })
})
