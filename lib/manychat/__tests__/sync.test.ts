import {
  normalizeSource,
  shouldAdvanceStatus,
  buildLeadPatch,
  determineAgencyId,
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

describe("determineAgencyId (scope por org — VIB-61)", () => {
  type Ag = { id: string; name: string; org_id: string; created_at: string }

  // Dos tenants con agencias HOMÓNIMAS: el bug era matchear "rosario"/"madero"
  // por nombre global y meter el lead en el tenant equivocado.
  const AGENCIES: Ag[] = [
    { id: "ag-a-rosario", name: "Rosario", org_id: "org-A", created_at: "2020-01-01" },
    { id: "ag-a-madero", name: "Madero", org_id: "org-A", created_at: "2020-02-01" },
    { id: "ag-b-rosario", name: "Rosario", org_id: "org-B", created_at: "2021-01-01" },
    { id: "ag-b-central", name: "Central", org_id: "org-B", created_at: "2019-06-01" },
  ]

  // Fake mínimo de Supabase: honra .ilike("name"), .eq("org_id") y .order() antes
  // de resolver en .limit(n).
  function makeSupabase(rows: Ag[]) {
    return {
      from() {
        const state: { name?: string; org?: string; orderCol?: string; asc?: boolean } = {}
        const builder: any = {
          select: () => builder,
          ilike: (col: string, pattern: string) => {
            if (col === "name") state.name = pattern.replace(/%/g, "").toLowerCase()
            return builder
          },
          eq: (col: string, val: string) => {
            if (col === "org_id") state.org = val
            return builder
          },
          order: (col: string, opts?: { ascending?: boolean }) => {
            state.orderCol = col
            state.asc = opts?.ascending !== false
            return builder
          },
          limit: (n: number) => {
            let out = rows.slice()
            if (state.org) out = out.filter((a) => a.org_id === state.org)
            if (state.name) out = out.filter((a) => a.name.toLowerCase().includes(state.name!))
            if (state.orderCol) {
              const c = state.orderCol as keyof Ag
              out.sort((a, b) => String(a[c]).localeCompare(String(b[c])) * (state.asc ? 1 : -1))
            }
            return Promise.resolve({ data: out.slice(0, n), error: null })
          },
        }
        return builder
      },
    } as any
  }

  it("con orgId, matchea la agencia de ESA org (no la homónima de otro tenant)", async () => {
    const supabase = makeSupabase(AGENCIES)
    const res = await determineAgencyId("rosario", supabase, "org-B")
    expect(res.agency_id).toBe("ag-b-rosario")
    expect(res.org_id).toBe("org-B")
  })

  it("el org_id devuelto es SIEMPRE el del token", async () => {
    const supabase = makeSupabase(AGENCIES)
    const res = await determineAgencyId("madero", supabase, "org-A")
    expect(res.agency_id).toBe("ag-a-madero")
    expect(res.org_id).toBe("org-A")
  })

  it("sin match de nombre, fallback = agencia más antigua de la org del token", async () => {
    const supabase = makeSupabase(AGENCIES)
    const res = await determineAgencyId("no-existe", supabase, "org-B")
    // La más antigua de org-B es "Central" (2019), no la homónima "Rosario".
    expect(res.agency_id).toBe("ag-b-central")
    expect(res.org_id).toBe("org-B")
  })

  it("sin tag, cae al fallback de la org del token (no a un 'rosario' global)", async () => {
    const supabase = makeSupabase(AGENCIES)
    const res = await determineAgencyId(undefined, supabase, "org-A")
    expect(res.org_id).toBe("org-A")
    expect(res.agency_id).toBe("ag-a-rosario") // más antigua de org-A (2020-01)
  })

  it("orgId sin agencias devuelve vacío (no cruza a otro tenant)", async () => {
    const supabase = makeSupabase(AGENCIES)
    const res = await determineAgencyId("rosario", supabase, "org-SIN-AGENCIAS")
    expect(res.agency_id).toBe("")
    expect(res.org_id).toBe("")
  })
})
