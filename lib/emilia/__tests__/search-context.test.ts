import {
  getActiveSearchContextId,
  getMessageSearchContextId,
  hasSearchCards,
} from "../search-context"

describe("Emilia CRM search context", () => {
  const oldResult = {
    role: "assistant",
    cards: { flights: { items: [{ id: "cun-flight" }] } },
    meta: { searchContextId: "search-cancun" },
  }
  const newResult = {
    role: "assistant",
    cards: { hotels: { items: [{ id: "mad-hotel" }] } },
    meta: { turnSemantics: { searchContextId: "search-madrid" } },
  }

  it("finds the latest search context after history rehydration", () => {
    expect(getActiveSearchContextId([oldResult, { role: "user" }, newResult]))
      .toBe("search-madrid")
  })

  it("supports snake-case API metadata and detects cards", () => {
    const message = {
      role: "assistant",
      cards: { hotels: { items: [{ id: "hotel" }] } },
      meta: { turn_semantics: { search_context_id: "search-pt" } },
    }
    expect(getMessageSearchContextId(message)).toBe("search-pt")
    expect(hasSearchCards(message)).toBe(true)
  })
})
