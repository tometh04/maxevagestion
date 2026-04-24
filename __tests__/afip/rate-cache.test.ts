/**
 * @jest-environment node
 */
import { RateCache } from "@/lib/afip/rate-cache"

describe("RateCache", () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("returns undefined for miss", () => {
    const cache = new RateCache(3_600_000)
    expect(cache.get("DOL:20260424")).toBeUndefined()
  })

  it("returns value before TTL expires", () => {
    const cache = new RateCache(3_600_000) // 1h
    cache.set("DOL:20260424", 1415)
    expect(cache.get("DOL:20260424")).toBe(1415)
  })

  it("returns undefined after TTL", () => {
    const cache = new RateCache(3_600_000)
    cache.set("DOL:20260424", 1415)
    jest.advanceTimersByTime(3_600_001)
    expect(cache.get("DOL:20260424")).toBeUndefined()
  })

  it("returns value 1ms before TTL expires", () => {
    const cache = new RateCache(3_600_000)
    cache.set("DOL:20260424", 1415)
    jest.advanceTimersByTime(3_599_999)
    expect(cache.get("DOL:20260424")).toBe(1415)
  })

  it("allows overwrite which resets TTL", () => {
    const cache = new RateCache(1000)
    cache.set("DOL", 1000)
    jest.advanceTimersByTime(500)
    cache.set("DOL", 1500) // overwrite
    jest.advanceTimersByTime(600)
    expect(cache.get("DOL")).toBe(1500) // sigue vivo porque se reseteó TTL
  })
})
