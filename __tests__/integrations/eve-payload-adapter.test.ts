/**
 * @jest-environment node
 *
 * Tests unitarios para adaptEvePayload.
 * No requieren conexión a BD — lógica pura de validación/normalización.
 */
import {
  adaptEvePayload,
  EveValidationError,
} from "@/lib/integrations/eve/payload-adapter"

const validBody = {
  event_id: "evt-001",
  session_id: "sess-abc",
  estado: "incompleto" as const,
  canal_tipo: "whatsapp",
  contacto_externo: "+5491133330000",
  contacto: { nombre: "Juan Perez", telefono: "+5491133330000", email: "juan@test.com" },
  vuelo: {
    origen: "EZE",
    destino: "Cancún",
    region: "CARIBE",
    fecha_ida: "2026-12-01",
    fecha_vuelta: "2026-12-10",
    fechas_flexibles: false,
    pasajeros: { adultos: 2, ninos: 0, infantes: 0, edades_menores: [] },
    clase: "economy",
    vuelo_directo: true,
    equipaje: true,
    presupuesto: "USD 3000",
    motivo: "vacaciones",
  },
  notas: "Lead de prueba",
}

describe("adaptEvePayload — payload válido", () => {
  it("normaliza todos los campos correctamente", () => {
    const result = adaptEvePayload(validBody)

    expect(result.event_id).toBe("evt-001")
    expect(result.session_id).toBe("sess-abc")
    expect(result.estado).toBe("incompleto")
    expect(result.canal_tipo).toBe("whatsapp")
    expect(result.contacto_externo).toBe("+5491133330000")
    expect(result.contacto.nombre).toBe("Juan Perez")
    expect(result.contacto.telefono).toBe("+5491133330000")
    expect(result.contacto.email).toBe("juan@test.com")
    expect(result.vuelo.destino).toBe("Cancún")
    expect(result.vuelo.region).toBe("CARIBE")
    expect(result.vuelo.pasajeros?.adultos).toBe(2)
    expect(result.notas).toBe("Lead de prueba")
    // raw_payload debe preservarse para eve_full_data
    expect(result.raw_payload).toBe(validBody)
  })
})

describe("adaptEvePayload — validaciones de campos obligatorios", () => {
  it("lanza EveValidationError si falta event_id", () => {
    const body = { ...validBody, event_id: undefined }
    expect(() => adaptEvePayload(body)).toThrow(EveValidationError)
    try {
      adaptEvePayload(body)
    } catch (err) {
      expect(err).toBeInstanceOf(EveValidationError)
      expect((err as EveValidationError).field).toBe("event_id")
    }
  })

  it("lanza EveValidationError si falta session_id", () => {
    const body = { ...validBody, session_id: undefined }
    expect(() => adaptEvePayload(body)).toThrow(EveValidationError)
    try {
      adaptEvePayload(body)
    } catch (err) {
      expect((err as EveValidationError).field).toBe("session_id")
    }
  })

  it("lanza EveValidationError si estado no está en el enum", () => {
    const body = { ...validBody, estado: "pendiente" }
    expect(() => adaptEvePayload(body)).toThrow(EveValidationError)
    try {
      adaptEvePayload(body)
    } catch (err) {
      expect(err).toBeInstanceOf(EveValidationError)
      expect((err as EveValidationError).field).toBe("estado")
    }
  })
})

describe("adaptEvePayload — defaults para campos opcionales", () => {
  it("usa {} como default si contacto no viene", () => {
    const body = { ...validBody, contacto: undefined }
    const result = adaptEvePayload(body)
    expect(result.contacto).toEqual({})
  })

  it("usa {} como default si vuelo no viene", () => {
    const body = { ...validBody, vuelo: undefined }
    const result = adaptEvePayload(body)
    expect(result.vuelo).toEqual({})
  })

  it("acepta estado 'listo_para_cotizar'", () => {
    const body = { ...validBody, estado: "listo_para_cotizar" }
    const result = adaptEvePayload(body)
    expect(result.estado).toBe("listo_para_cotizar")
  })

  it("lanza error si el body no es un objeto", () => {
    expect(() => adaptEvePayload(null)).toThrow(EveValidationError)
    expect(() => adaptEvePayload("string")).toThrow(EveValidationError)
  })
})
