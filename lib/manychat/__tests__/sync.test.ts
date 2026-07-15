import {
  normalizeSource,
  shouldAdvanceStatus,
  buildLeadPatch,
  type ExistingLeadRow,
  type ManychatLeadData,
} from "../sync"

describe("normalizeSource", () => {
  it("mapea el alias de Agente Blanco al valor canónico", () => {
    expect(normalizeSource("agenteblanco")).toBe("Agente Blanco")
    expect(normalizeSource("Agente Blanco")).toBe("Agente Blanco")
    expect(normalizeSource("  AGENTEBLANCO  ")).toBe("Agente Blanco")
  })

  it("default a Manychat cuando no viene source (retrocompat)", () => {
    expect(normalizeSource(undefined)).toBe("Manychat")
    expect(normalizeSource("")).toBe("Manychat")
    expect(normalizeSource("   ")).toBe("Manychat")
    expect(normalizeSource("manychat")).toBe("Manychat")
  })

  it("un source desconocido cae a Manychat (evita violar el CHECK constraint)", () => {
    expect(normalizeSource("chatsell")).toBe("Manychat")
    expect(normalizeSource("cualquier-cosa")).toBe("Manychat")
  })
})

describe("shouldAdvanceStatus", () => {
  it("avanza hacia adelante en el pipeline", () => {
    expect(shouldAdvanceStatus("NEW", "IN_PROGRESS")).toBe(true)
    expect(shouldAdvanceStatus("IN_PROGRESS", "QUOTED")).toBe(true)
    expect(shouldAdvanceStatus("QUOTED", "WON")).toBe(true)
  })

  it("nunca retrocede", () => {
    expect(shouldAdvanceStatus("QUOTED", "NEW")).toBe(false)
    expect(shouldAdvanceStatus("IN_PROGRESS", "NEW")).toBe(false)
    expect(shouldAdvanceStatus("WON", "IN_PROGRESS")).toBe(false)
  })

  it("no flipa entre terminales (WON <-> LOST comparten rank)", () => {
    expect(shouldAdvanceStatus("WON", "LOST")).toBe(false)
    expect(shouldAdvanceStatus("LOST", "WON")).toBe(false)
  })

  it("mismo status no es avance", () => {
    expect(shouldAdvanceStatus("NEW", "NEW")).toBe(false)
  })

  it("status entrante desconocido no toca nada", () => {
    expect(shouldAdvanceStatus("NEW", "FOO")).toBe(false)
  })
})

describe("buildLeadPatch (merge parcial)", () => {
  // Primer POST temprano: solo captó el WhatsApp.
  const firstFullData = {
    ig: "laurisariii",
    whatsapp: "+5491123456789",
    phase: "initial",
    syncedAt: "2026-07-15T10:00:00.000Z",
  }

  const existing: ExistingLeadRow = {
    id: "lead-1",
    status: "NEW",
    list_name: "Leads - Otros",
    manychat_full_data: firstFullData,
    contact_phone: "+5491123456789",
    contact_instagram: "laurisariii",
  }

  it("un campo ausente/vacío NO se incluye en el patch (no pisa lo existente)", () => {
    // Segundo POST sin destino ni teléfono explícito.
    const incoming: ManychatLeadData = { ig: "laurisariii", destino: "" }
    const patch = buildLeadPatch(existing, incoming)

    expect(patch).not.toHaveProperty("destination")
    expect(patch).not.toHaveProperty("contact_phone")
    // manychat_full_data mergeado conserva el whatsapp del primer POST
    expect(patch.manychat_full_data.whatsapp).toBe("+5491123456789")
  })

  it("mergea manychat_full_data y reconstruye notes con ambos POST", () => {
    // Segundo POST calificado: agrega destino y personas, sin reenviar whatsapp.
    const incoming: ManychatLeadData = {
      ig: "laurisariii",
      destino: "Punta Cana",
      personas: "2",
    }
    const patch = buildLeadPatch(existing, incoming)

    // full_data: whatsapp temprano + destino/personas tardíos conviven
    expect(patch.manychat_full_data.whatsapp).toBe("+5491123456789")
    expect(patch.manychat_full_data.destino).toBe("Punta Cana")
    expect(patch.manychat_full_data.personas).toBe("2")

    // notes reconstruido incluye datos de ambos POST
    expect(patch.notes).toContain("Punta Cana")
    expect(patch.notes).toContain("+5491123456789")

    // destination sí se setea porque el destino vino no-vacío
    expect(patch.destination).toBe("Punta Cana")
  })

  it("el status no retrocede aunque llegue phase='initial'", () => {
    const advanced: ExistingLeadRow = { ...existing, status: "QUOTED" }
    const incoming: ManychatLeadData = { ig: "laurisariii", phase: "initial" }
    const patch = buildLeadPatch(advanced, incoming)

    expect(patch).not.toHaveProperty("status")
  })

  it("el status avanza cuando el lead califica", () => {
    const incoming: ManychatLeadData = { ig: "laurisariii", phase: "qualified" }
    const patch = buildLeadPatch(existing, incoming) // existing = NEW
    expect(patch.status).toBe("IN_PROGRESS")
  })

  it("sin phase en el payload, no toca el status", () => {
    const incoming: ManychatLeadData = { ig: "laurisariii", destino: "Cancún" }
    const patch = buildLeadPatch(existing, incoming)
    expect(patch).not.toHaveProperty("status")
  })

  it("nunca incluye source, list_name, contact_email ni assigned_seller_id", () => {
    const incoming: ManychatLeadData = {
      ig: "laurisariii",
      whatsapp: "+5491123456789",
      destino: "Cancún",
      phase: "qualified",
      source: "agenteblanco",
    }
    const patch = buildLeadPatch(existing, incoming)

    expect(patch).not.toHaveProperty("source")
    expect(patch).not.toHaveProperty("list_name")
    expect(patch).not.toHaveProperty("contact_email")
    expect(patch).not.toHaveProperty("assigned_seller_id")
  })

  it("setea contact_phone cuando el POST tardío por fin trae el teléfono", () => {
    const noPhone: ExistingLeadRow = {
      ...existing,
      contact_phone: "",
      manychat_full_data: { ig: "laurisariii", syncedAt: "2026-07-15T10:00:00.000Z" },
    }
    const incoming: ManychatLeadData = { ig: "laurisariii", whatsapp: "+5491100000000" }
    const patch = buildLeadPatch(noPhone, incoming)
    expect(patch.contact_phone).toBe("+5491100000000")
  })
})
