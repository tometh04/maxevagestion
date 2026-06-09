import { buildFallbackPrompt, type LeadInput } from "../lead-context"

describe("buildFallbackPrompt", () => {
  it("usa destination + region cuando ambos están presentes", () => {
    const lead: LeadInput = {
      contact_name: "Juan Pérez",
      destination: "Cancún",
      region: "CARIBE",
      notes: null,
    }
    expect(buildFallbackPrompt(lead)).toBe(
      "Cotizar viaje a Cancún (Caribe) para Juan Pérez. Necesito fechas y cantidad de pasajeros."
    )
  })

  it("omite region si no está", () => {
    const lead: LeadInput = {
      contact_name: "Juan Pérez",
      destination: "Cancún",
      region: null,
      notes: null,
    }
    expect(buildFallbackPrompt(lead)).toBe(
      "Cotizar viaje a Cancún para Juan Pérez. Necesito fechas y cantidad de pasajeros."
    )
  })

  it("omite destination si no está y avisa", () => {
    const lead: LeadInput = {
      contact_name: "Juan Pérez",
      destination: null,
      region: null,
      notes: null,
    }
    expect(buildFallbackPrompt(lead)).toBe(
      "Cotizar viaje para Juan Pérez. Necesito destino, fechas y cantidad de pasajeros."
    )
  })

  it("normaliza region a Title Case", () => {
    const lead: LeadInput = {
      contact_name: "X",
      destination: "Madrid",
      region: "EUROPA",
      notes: null,
    }
    expect(buildFallbackPrompt(lead)).toBe(
      "Cotizar viaje a Madrid (Europa) para X. Necesito fechas y cantidad de pasajeros."
    )
  })

  it("anexa el prompt de la lista del Kanban cuando está presente", () => {
    const lead: LeadInput = {
      contact_name: "Juan Pérez",
      destination: "Cancún",
      region: "CARIBE",
      notes: null,
      list_prompt: "Cotizar all inclusive saliendo desde Córdoba.",
    }
    expect(buildFallbackPrompt(lead)).toBe(
      "Cotizar viaje a Cancún (Caribe) para Juan Pérez. Necesito fechas y cantidad de pasajeros. Cotizar all inclusive saliendo desde Córdoba."
    )
  })

  it("ignora list_prompt vacío o con solo espacios", () => {
    const lead: LeadInput = {
      contact_name: "Juan Pérez",
      destination: "Cancún",
      region: null,
      notes: null,
      list_prompt: "   ",
    }
    expect(buildFallbackPrompt(lead)).toBe(
      "Cotizar viaje a Cancún para Juan Pérez. Necesito fechas y cantidad de pasajeros."
    )
  })

  it("anexa list_prompt también cuando no hay destino", () => {
    const lead: LeadInput = {
      contact_name: "Juan Pérez",
      destination: null,
      region: null,
      notes: null,
      list_prompt: "Preferencia hoteles 4 estrellas.",
    }
    expect(buildFallbackPrompt(lead)).toBe(
      "Cotizar viaje para Juan Pérez. Necesito destino, fechas y cantidad de pasajeros. Preferencia hoteles 4 estrellas."
    )
  })
})
