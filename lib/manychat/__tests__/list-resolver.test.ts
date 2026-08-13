/**
 * @jest-environment node
 *
 * Tests de la resolución de nombres de lista del CRM legacy.
 *
 * Lo que más importa acá es la NO REGRESIÓN: un tenant que nunca renombró sus
 * listas tiene que seguir recibiendo exactamente los mismos nombres que antes
 * de introducir el resolver.
 */
import { normalizeListKey, resolveListNameForAgency } from "@/lib/manychat/list-resolver"
import { resolveListNameForRegion } from "@/lib/manychat/seed-lists"

const AGENCY = "agency-1"

/** Mock del client: from().select().eq().order() → { data: lists } */
function mockSupabase(listNames: string[]): any {
  const chain: any = {}
  chain.select = jest.fn().mockReturnValue(chain)
  chain.eq = jest.fn().mockReturnValue(chain)
  chain.order = jest.fn().mockResolvedValue({
    data: listNames.map((list_name, position) => ({ list_name, position })),
    error: null,
  })
  return { from: jest.fn().mockReturnValue(chain) }
}

/** Listas legacy: el tenant nunca renombró nada. */
const LEGACY_LISTS = [
  "Leads - Argentina",
  "Leads - Caribe",
  "Leads - Brasil",
  "Leads - EEUU",
  "Leads - Europa",
  "Leads - Exoticos",
  "Leads - Otros",
  "Leads - Instagram",
]

/** Listas de Lozada después de la unificación. */
const UNIFIED_LISTS = [
  "Estados Unidos",
  "Brasil",
  "Caribe",
  "Instagram",
  "Otros",
  "Cruceros",
  "Argentina",
  "Europa",
  "Exoticos",
]

describe("normalizeListKey", () => {
  it("ignora mayúsculas, acentos y puntuación", () => {
    expect(normalizeListKey("Campaña - EE.UU")).toBe("campana ee uu")
    expect(normalizeListKey("Exóticos")).toBe(normalizeListKey("Exoticos"))
    expect(normalizeListKey("  CARIBE  ")).toBe("caribe")
  })
})

describe("resolveListNameForAgency — no regresión", () => {
  it("devuelve el nombre legacy tal cual cuando el tenant no renombró", async () => {
    const supabase = mockSupabase(LEGACY_LISTS)
    for (const candidate of LEGACY_LISTS) {
      expect(await resolveListNameForAgency(AGENCY, candidate, supabase)).toBe(candidate)
    }
  })

  it("devuelve el candidato intacto si la agencia no tiene listas configuradas", async () => {
    const supabase = mockSupabase([])
    expect(await resolveListNameForAgency(AGENCY, "Leads - Caribe", supabase)).toBe(
      "Leads - Caribe"
    )
  })

  it("no inventa una lista cuando no hay equivalencia", async () => {
    const supabase = mockSupabase(UNIFIED_LISTS)
    expect(await resolveListNameForAgency(AGENCY, "Campaña - Black Friday", supabase)).toBe(
      "Campaña - Black Friday"
    )
  })
})

describe("resolveListNameForAgency — tenant con listas unificadas", () => {
  it("mapea los nombres con prefijo al destino unificado", async () => {
    const supabase = mockSupabase(UNIFIED_LISTS)
    expect(await resolveListNameForAgency(AGENCY, "Leads - Caribe", supabase)).toBe("Caribe")
    expect(await resolveListNameForAgency(AGENCY, "Campaña - Brasil", supabase)).toBe("Brasil")
    expect(await resolveListNameForAgency(AGENCY, "Leads - Instagram", supabase)).toBe(
      "Instagram"
    )
    expect(await resolveListNameForAgency(AGENCY, "Campaña - Cruceros", supabase)).toBe(
      "Cruceros"
    )
  })

  it("resuelve por alias de región cuando el nombre no coincide literalmente", async () => {
    const supabase = mockSupabase(UNIFIED_LISTS)
    // "EE UU" y "EEUU" son alias de la misma región que "Estados Unidos".
    expect(await resolveListNameForAgency(AGENCY, "Campaña - EE UU", supabase)).toBe(
      "Estados Unidos"
    )
    expect(await resolveListNameForAgency(AGENCY, "Leads - EEUU", supabase)).toBe(
      "Estados Unidos"
    )
  })

  it("ignora acentos al matchear", async () => {
    const supabase = mockSupabase(["Exóticos", "Otros"])
    expect(await resolveListNameForAgency(AGENCY, "Leads - Exoticos", supabase)).toBe("Exóticos")
  })

  it("soporta el prefijo Cupos", async () => {
    const supabase = mockSupabase(["Caribe"])
    expect(await resolveListNameForAgency(AGENCY, "Cupos - Caribe", supabase)).toBe("Caribe")
  })

  it("no confunde 'Otros' con 'Otros - Histórico'", async () => {
    // Caso real de Madero: el bloque histórico de Trello convive con la lista
    // vigente. Un match por 'includes' mandaría los leads nuevos al histórico.
    const supabase = mockSupabase(["Otros - Histórico", "Otros"])
    expect(await resolveListNameForAgency(AGENCY, "Leads - Otros", supabase)).toBe("Otros")
  })
})

describe("resolveListNameForRegion", () => {
  it("conserva el comportamiento legacy (match por contenido)", async () => {
    const supabase = mockSupabase(LEGACY_LISTS)
    expect(await resolveListNameForRegion(AGENCY, "CARIBE", supabase)).toBe("Leads - Caribe")
    expect(await resolveListNameForRegion(AGENCY, "BRASIL", supabase)).toBe("Leads - Brasil")
  })

  it("prefiere el match exacto sobre el match por contenido", async () => {
    const supabase = mockSupabase(["Otros - Histórico", "Otros"])
    expect(await resolveListNameForRegion(AGENCY, "OTROS", supabase)).toBe("Otros")
  })

  it("resuelve alias de región contra listas renombradas", async () => {
    const supabase = mockSupabase(UNIFIED_LISTS)
    expect(await resolveListNameForRegion(AGENCY, "EEUU", supabase)).toBe("Estados Unidos")
  })

  it("devuelve null si la agencia no tiene listas", async () => {
    const supabase = mockSupabase([])
    expect(await resolveListNameForRegion(AGENCY, "CARIBE", supabase)).toBeNull()
  })
})
