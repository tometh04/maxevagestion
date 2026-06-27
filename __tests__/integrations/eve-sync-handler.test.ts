/**
 * @jest-environment node
 *
 * Tests unitarios para processEveLead.
 * Usan un admin client mockeado — no requieren BD real.
 */
import { processEveLead } from "@/lib/integrations/eve/sync-handler"
import type { NormalizedEveLead } from "@/lib/integrations/eve/payload-adapter"

// Helpers para construir mocks de Supabase encadenables
function buildQueryMock(overrides: Partial<{
  select: any
  eq: any
  maybeSingle: any
  insert: any
  update: any
  upsert: any
  single: any
}> = {}) {
  const mock: any = {}
  mock.select = jest.fn().mockReturnValue(mock)
  mock.eq = jest.fn().mockReturnValue(mock)
  mock.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null })
  mock.insert = jest.fn().mockReturnValue(mock)
  mock.update = jest.fn().mockReturnValue(mock)
  mock.upsert = jest.fn().mockReturnValue(mock)
  mock.single = jest.fn().mockResolvedValue({ data: { id: "lead-123" }, error: null })
  Object.assign(mock, overrides)
  return mock
}

function buildAdminMock(
  fromImpl: (table: string) => any
): any {
  return { from: jest.fn().mockImplementation(fromImpl) }
}

// Payload normalizado base (estado=incompleto → status=NEW)
const baseNormalized: NormalizedEveLead = {
  event_id: "evt-001",
  session_id: "sess-abc",
  estado: "incompleto",
  canal_tipo: "whatsapp",
  contacto_externo: "+5491133330000",
  contacto: { nombre: "Juan Perez", telefono: "+5491133330000", email: "juan@test.com" },
  vuelo: {
    destino: "Cancún",
    region: "CARIBE",
    origen: "EZE",
    fecha_ida: "2026-12-01",
    pasajeros: { adultos: 2, ninos: 0, infantes: 0, edades_menores: [] },
    presupuesto: "USD 3000",
    motivo: "vacaciones",
  },
  notas: "Lead de prueba",
  raw_payload: {},
}

const ORG_ID = "org-test-001"
const AGENCY_ID = "agency-test-001"

describe("processEveLead — mapeo de estado", () => {
  function makeInsertAdmin(capturedInsert: { payload?: any } = {}) {
    const qMock = buildQueryMock()
    qMock.single = jest.fn().mockResolvedValue({ data: { id: "lead-new-1" }, error: null })
    qMock.insert = jest.fn().mockImplementation((payload: any) => {
      capturedInsert.payload = payload
      return qMock
    })
    return buildAdminMock(() => qMock)
  }

  it("estado 'incompleto' → status 'NEW' en el insert", async () => {
    const captured: { payload?: any } = {}
    const admin = makeInsertAdmin(captured)

    const result = await processEveLead(admin, ORG_ID, AGENCY_ID, baseNormalized)

    expect(result.action).toBe("created")
    expect(result.lead_id).toBe("lead-new-1")
    expect(captured.payload?.status).toBe("NEW")
  })

  it("estado 'listo_para_cotizar' → status 'IN_PROGRESS' en el insert", async () => {
    const captured: { payload?: any } = {}
    const admin = makeInsertAdmin(captured)

    const normalized: NormalizedEveLead = { ...baseNormalized, estado: "listo_para_cotizar" }
    const result = await processEveLead(admin, ORG_ID, AGENCY_ID, normalized)

    expect(result.action).toBe("created")
    expect(captured.payload?.status).toBe("IN_PROGRESS")
  })
})

describe("processEveLead — inferencia de región", () => {
  it("cuando region viene vacía, infiere región del destino", async () => {
    const captured: { payload?: any } = {}
    const qMock = buildQueryMock()
    qMock.single = jest.fn().mockResolvedValue({ data: { id: "lead-region-1" }, error: null })
    qMock.insert = jest.fn().mockImplementation((payload: any) => {
      captured.payload = payload
      return qMock
    })
    const admin = buildAdminMock(() => qMock)

    // destino=Miami → debería inferir EEUU
    const normalized: NormalizedEveLead = {
      ...baseNormalized,
      vuelo: { ...baseNormalized.vuelo, destino: "Miami", region: undefined },
    }
    await processEveLead(admin, ORG_ID, AGENCY_ID, normalized)

    // La región debe ser EEUU, no OTROS
    expect(captured.payload?.region).toBe("EEUU")
  })
})

describe("processEveLead — upsert idempotente por session_id", () => {
  it("segundo evento con mismo session_id → UPDATE (action='updated')", async () => {
    // Simula que el upsert devuelve el id del lead existente
    const qMock = buildQueryMock()
    qMock.upsert = jest.fn().mockReturnValue(qMock)
    qMock.select = jest.fn().mockReturnValue(qMock)
    qMock.single = jest.fn().mockResolvedValue({
      data: { id: "lead-existing-1", _upserted: true },
      error: null,
    })

    // Para detectar "updated" necesitamos que el upsert sepa si fue INSERT o UPDATE.
    // El sync handler debe usar la lógica de upsert con onConflict y verificar.
    // En el test, simulamos que el lead YA existía y que el upsert retorna el id.
    // La lógica de action='updated' vs 'created' se determina en el handler.
    const admin = buildAdminMock(() => qMock)

    const normalized1: NormalizedEveLead = { ...baseNormalized, session_id: "sess-dup" }
    const normalized2: NormalizedEveLead = { ...baseNormalized, session_id: "sess-dup" }

    // Primer call: mockeamos insert que devuelve lead creado
    const capturedCalls: string[] = []
    const qMockFirst = buildQueryMock()
    qMockFirst.single = jest.fn().mockResolvedValue({ data: { id: "lead-dup-1" }, error: null })
    qMockFirst.insert = jest.fn().mockImplementation(() => {
      capturedCalls.push("insert")
      return qMockFirst
    })
    const adminFirst = buildAdminMock(() => qMockFirst)
    const res1 = await processEveLead(adminFirst, ORG_ID, AGENCY_ID, normalized1)
    expect(res1.action).toBe("created")

    // Segundo call: simula que el lead ya existe (SELECT devuelve el lead)
    // El sync handler debería detectarlo y hacer UPDATE
    const qMockSecond = buildQueryMock()
    let existingReturned = false
    qMockSecond.maybeSingle = jest.fn().mockImplementation(() => {
      // Primera llamada (buscar por session_id): devuelve el lead existente
      if (!existingReturned) {
        existingReturned = true
        return Promise.resolve({ data: { id: "lead-dup-1" }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })
    qMockSecond.single = jest.fn().mockResolvedValue({ data: { id: "lead-dup-1" }, error: null })
    qMockSecond.update = jest.fn().mockReturnValue(qMockSecond)
    const adminSecond = buildAdminMock(() => qMockSecond)
    const res2 = await processEveLead(adminSecond, ORG_ID, AGENCY_ID, normalized2)
    expect(res2.action).toBe("updated")
    expect(res2.lead_id).toBe("lead-dup-1")
  })
})

describe("processEveLead — aislamiento multi-tenant", () => {
  it("el lead se crea SIEMPRE con el org_id y agency_id provistos, nunca con otro", async () => {
    const captured: { payload?: any } = {}
    const qMock = buildQueryMock()
    qMock.single = jest.fn().mockResolvedValue({ data: { id: "lead-tenant-1" }, error: null })
    qMock.insert = jest.fn().mockImplementation((payload: any) => {
      captured.payload = payload
      return qMock
    })
    const admin = buildAdminMock(() => qMock)

    const REAL_ORG = "org-real-001"
    const REAL_AGENCY = "agency-real-001"
    const EVIL_ORG = "org-evil-999"
    const EVIL_AGENCY = "agency-evil-999"

    // El body del webhook podría traer org/agency maliciosos — pero el handler
    // los ignora y usa los que vienen del lookup de org_integrations.
    const normalizedWithEvil: NormalizedEveLead = {
      ...baseNormalized,
      // Estos campos NO deben existir en NormalizedEveLead —
      // si los pusiera el caller, el sync-handler los ignora.
    }

    await processEveLead(admin, REAL_ORG, REAL_AGENCY, normalizedWithEvil)

    // El insert debe usar EXACTAMENTE los org_id y agency_id que el handler recibe
    expect(captured.payload?.org_id).toBe(REAL_ORG)
    expect(captured.payload?.agency_id).toBe(REAL_AGENCY)
    // Nunca el org/agency "evil"
    expect(captured.payload?.org_id).not.toBe(EVIL_ORG)
    expect(captured.payload?.agency_id).not.toBe(EVIL_AGENCY)
  })
})

describe("processEveLead — mapeo de contacto", () => {
  it("contact_name usa nombre si viene, teléfono si no hay nombre, 'Sin nombre' como último fallback", async () => {
    const captured: { payload?: any } = {}
    const qMock = buildQueryMock()
    qMock.single = jest.fn().mockResolvedValue({ data: { id: "lead-cn-1" }, error: null })
    qMock.insert = jest.fn().mockImplementation((payload: any) => {
      captured.payload = payload
      return qMock
    })
    const admin = buildAdminMock(() => qMock)

    // Sin nombre ni teléfono → "Sin nombre"
    await processEveLead(admin, ORG_ID, AGENCY_ID, {
      ...baseNormalized,
      contacto: {},
    })
    expect(captured.payload?.contact_name).toBe("Sin nombre")
  })

  it("contact_name usa teléfono cuando no hay nombre", async () => {
    const captured: { payload?: any } = {}
    const qMock = buildQueryMock()
    qMock.single = jest.fn().mockResolvedValue({ data: { id: "lead-cn-2" }, error: null })
    qMock.insert = jest.fn().mockImplementation((payload: any) => {
      captured.payload = payload
      return qMock
    })
    const admin = buildAdminMock(() => qMock)

    await processEveLead(admin, ORG_ID, AGENCY_ID, {
      ...baseNormalized,
      contacto: { telefono: "+5491100000001" },
    })
    expect(captured.payload?.contact_name).toBe("+5491100000001")
  })

  it("contact_instagram solo se asigna cuando canal_tipo es 'instagram'", async () => {
    const captured: { payload?: any } = {}
    const qMock = buildQueryMock()
    qMock.single = jest.fn().mockResolvedValue({ data: { id: "lead-ig-1" }, error: null })
    qMock.insert = jest.fn().mockImplementation((payload: any) => {
      captured.payload = payload
      return qMock
    })
    const admin = buildAdminMock(() => qMock)

    // canal_tipo=whatsapp → contact_instagram debe ser null
    await processEveLead(admin, ORG_ID, AGENCY_ID, {
      ...baseNormalized,
      canal_tipo: "whatsapp",
      contacto_externo: "@juan_viajero",
    })
    expect(captured.payload?.contact_instagram).toBeNull()
  })

  it("contact_instagram se normaliza cuando canal_tipo es 'instagram'", async () => {
    const captured: { payload?: any } = {}
    const qMock = buildQueryMock()
    qMock.single = jest.fn().mockResolvedValue({ data: { id: "lead-ig-2" }, error: null })
    qMock.insert = jest.fn().mockImplementation((payload: any) => {
      captured.payload = payload
      return qMock
    })
    const admin = buildAdminMock(() => qMock)

    await processEveLead(admin, ORG_ID, AGENCY_ID, {
      ...baseNormalized,
      canal_tipo: "instagram",
      contacto_externo: "@Juan_Viajero",
    })
    // normalizeInstagram saca @ y lowercase
    expect(captured.payload?.contact_instagram).toBe("juan_viajero")
  })
})
