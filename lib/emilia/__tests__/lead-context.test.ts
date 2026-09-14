import {
  buildFallbackPrompt,
  buildOpenAIInstructions,
  sanitizeSuggestedPrompt,
  type LeadInput,
} from "../lead-context"

describe("buildFallbackPrompt", () => {
  it("usa solo el destino aunque la región comercial esté presente", () => {
    const lead: LeadInput = {
      contact_name: "Juan Pérez",
      destination: "Cancún",
      region: "CARIBE",
      notes: null,
    }
    expect(buildFallbackPrompt(lead)).toBe(
      "Cotizar viaje a Cancún. Necesito fechas y cantidad de pasajeros."
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
      "Cotizar viaje a Cancún. Necesito fechas y cantidad de pasajeros."
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
      "Cotizar viaje. Necesito destino, fechas y cantidad de pasajeros."
    )
  })

  it("no agrega la región comercial", () => {
    const lead: LeadInput = {
      contact_name: "X",
      destination: "Madrid",
      region: "EUROPA",
      notes: null,
    }
    expect(buildFallbackPrompt(lead)).toBe(
      "Cotizar viaje a Madrid. Necesito fechas y cantidad de pasajeros."
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
      "Cotizar viaje a Cancún. Necesito fechas y cantidad de pasajeros. Cotizar all inclusive saliendo desde Córdoba."
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
      "Cotizar viaje a Cancún. Necesito fechas y cantidad de pasajeros."
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
      "Cotizar viaje. Necesito destino, fechas y cantidad de pasajeros. Preferencia hoteles 4 estrellas."
    )
  })
})

describe("sanitizeSuggestedPrompt", () => {
  it("quita presupuesto y conserva una enumeración natural", () => {
    expect(
      sanitizeSuggestedPrompt(
        "Cotizar viaje a Caribe. Por favor, especificar la cantidad de adultos y niños, fechas preferidas, duración, tipo de hospedaje y presupuesto."
      )
    ).toBe(
      "Cotizar viaje a Caribe. Por favor, especificar la cantidad de adultos y niños, fechas preferidas, duración y tipo de hospedaje."
    )
  })
})


describe("contexto de viaje sin procedencia comercial", () => {
  const lead: LeadInput = {
    contact_name: "Juan Pérez", destination: "Punta Cana, CARIBE", region: "CARIBE",
    notes: "🤖 Lead derivado por Chatsell (caliente)\n🛫 Origen: Buenos Aires, Argentina\n📅 Fechas: primera semana de diciembre\nCampaña: Instagram Caribe\n🔗 Conversación: https://crm.example/lead/1",
    list_prompt: "Fuente: Manychat\nHotel all inclusive.",
  }
  it("filtra metadatos antes de enviarlos al generador y conserva los datos del viaje", () => {
    const { user, system } = buildOpenAIInstructions(lead)
    expect(JSON.parse(user)).toEqual({ destination: "Punta Cana", notes: "🛫 Origen: Buenos Aires, Argentina\n📅 Fechas: primera semana de diciembre", list_prompt: "Hotel all inclusive." })
    expect(system).not.toContain("incluí región si se conoce")
    expect(buildFallbackPrompt(lead)).toBe("Cotizar viaje a Punta Cana. Necesito fechas y cantidad de pasajeros. Hotel all inclusive.")
  })
  it("limpia también una respuesta antigua del modelo", () => {
    expect(sanitizeSuggestedPrompt("Cotizar viaje a Punta Cana, CARIBE. Saliendo desde Buenos Aires, Argentina para la primera semana de diciembre con hotel incluido all inclusive. Lead proveniente de Instagram.")).toBe("Cotizar viaje a Punta Cana. Saliendo desde Buenos Aires, Argentina para la primera semana de diciembre con hotel incluido all inclusive.")
  })
  it.each(["Punta Cana, República Dominicana", "Córdoba, Argentina", "Natal, Brasil", "Caribe"])("preserva el destino geográfico %s", destination => {
    expect(JSON.parse(buildOpenAIInstructions({ ...lead, destination }).user).destination).toBe(destination)
  })
})
