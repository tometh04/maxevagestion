import {
  CONVERTIBLE_LEAD_STATUSES,
  buildLeadSearchFilter,
  mapLeadSelectorRow,
  sanitizeLeadSearch,
} from "@/lib/leads/selector"

describe("sanitizeLeadSearch", () => {
  it("neutraliza los caracteres que arman el predicado de PostgREST", () => {
    // Sin esto, la coma y el paréntesis cortan el `or=(...)` y la query cambia
    // de significado o falla.
    const clean = sanitizeLeadSearch("Perez, Juan (hijo)")
    expect(clean).not.toContain(",")
    expect(clean).not.toContain("(")
    expect(clean).not.toContain(")")
    expect(clean).toBe("Perez Juan hijo")
  })

  it("escapa los comodines de ilike", () => {
    expect(sanitizeLeadSearch("100%")).toBe("100\\%")
    expect(sanitizeLeadSearch("a_b")).toBe("a\\_b")
  })

  it("recorta espacios y limita el largo", () => {
    expect(sanitizeLeadSearch("   Juan   Perez  ")).toBe("Juan Perez")
    expect(sanitizeLeadSearch("x".repeat(200))).toHaveLength(80)
  })

  it("una búsqueda vacía queda vacía", () => {
    expect(sanitizeLeadSearch("")).toBe("")
    expect(sanitizeLeadSearch("   ")).toBe("")
    expect(sanitizeLeadSearch("()")).toBe("")
  })
})

describe("buildLeadSearchFilter", () => {
  it("busca por nombre, teléfono, email y destino", () => {
    const filter = buildLeadSearchFilter("juan")
    expect(filter).toBe(
      "contact_name.ilike.%juan%,contact_phone.ilike.%juan%,contact_email.ilike.%juan%,destination.ilike.%juan%"
    )
  })
})

describe("CONVERTIBLE_LEAD_STATUSES", () => {
  it("coincide con el lock CAS del POST de operaciones", () => {
    // Si estas listas se desincronizan, el buscador ofrece leads que el alta
    // rechaza con 409 después de cargar todo el formulario.
    expect([...CONVERTIBLE_LEAD_STATUSES]).toEqual(["NEW", "IN_PROGRESS", "QUOTED", "WON"])
  })
})

describe("mapLeadSelectorRow", () => {
  const row = {
    id: "lead-1",
    contact_name: "Juan",
    contact_phone: "1122334455",
    contact_email: null,
    destination: "Cancún",
    agency_id: "ag-1",
    assigned_seller_id: "seller-1",
    notes: "nota",
    quoted_price: "1500.75",
    estimated_departure_date: "2090-01-01",
    region: "Caribe",
    deposit_currency: "USD",
    status: "QUOTED",
    created_at: "2026-01-01",
  }

  it("marca el lead que ya tiene operación y expone cuál", () => {
    const mapped = mapLeadSelectorRow(row, new Map([["lead-1", "op-9"]]))
    expect(mapped.has_operation).toBe(true)
    expect(mapped.operation_id).toBe("op-9")
  })

  it("un lead sin operación queda elegible", () => {
    const mapped = mapLeadSelectorRow(row, new Map())
    expect(mapped.has_operation).toBe(false)
    expect(mapped.operation_id).toBeNull()
  })

  it("normaliza el presupuesto a número", () => {
    expect(mapLeadSelectorRow(row, new Map()).quoted_price).toBe(1500.75)
    expect(mapLeadSelectorRow({ ...row, quoted_price: null }, new Map()).quoted_price).toBeNull()
  })
})
