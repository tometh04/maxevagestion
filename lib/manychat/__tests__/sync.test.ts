import {
  normalizeSource,
  shouldAdvanceStatus,
  buildLeadPatch,
  determineAgencyId,
  resolveSellerIdByEmail,
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
    // Nombre con separador: el integrador manda "kyo-viajes" / "KyoViajes".
    { id: "ag-c-kyo", name: "Kyo Viajes", org_id: "org-C", created_at: "2022-03-01" },
  ]

  // Fake mínimo: una sola query, .eq("org_id") opcional + .order("created_at").
  function makeSupabase(rows: Ag[]) {
    return {
      from() {
        const state: { org?: string; asc?: boolean } = {}
        const builder: any = {
          select: () => builder,
          eq: (col: string, val: string) => {
            if (col === "org_id") state.org = val
            return builder
          },
          order: (_col: string, opts?: { ascending?: boolean }) => {
            state.asc = opts?.ascending !== false
            let out = rows.slice()
            if (state.org) out = out.filter((a) => a.org_id === state.org)
            out.sort(
              (a, b) => a.created_at.localeCompare(b.created_at) * (state.asc ? 1 : -1)
            )
            return Promise.resolve({ data: out, error: null })
          },
        }
        return builder
      },
    } as any
  }

  it("con orgId, matchea la agencia de ESA org (no la homónima de otro tenant)", async () => {
    const res = await determineAgencyId("rosario", makeSupabase(AGENCIES), "org-B")
    expect(res.agency_id).toBe("ag-b-rosario")
    expect(res.org_id).toBe("org-B")
  })

  it("el org_id devuelto es SIEMPRE el del token", async () => {
    const res = await determineAgencyId("madero", makeSupabase(AGENCIES), "org-A")
    expect(res.agency_id).toBe("ag-a-madero")
    expect(res.org_id).toBe("org-A")
  })

  it("sin match de nombre, fallback = agencia más antigua de la org del token", async () => {
    const res = await determineAgencyId("no-existe", makeSupabase(AGENCIES), "org-B")
    // La más antigua de org-B es "Central" (2019), no la homónima "Rosario".
    expect(res.agency_id).toBe("ag-b-central")
    expect(res.org_id).toBe("org-B")
  })

  it("sin tag, cae al fallback de la org del token (no a un 'rosario' global)", async () => {
    const res = await determineAgencyId(undefined, makeSupabase(AGENCIES), "org-A")
    expect(res.org_id).toBe("org-A")
    expect(res.agency_id).toBe("ag-a-rosario") // más antigua de org-A (2020-01)
  })

  it("orgId sin agencias devuelve vacío (no cruza a otro tenant)", async () => {
    const res = await determineAgencyId("rosario", makeSupabase(AGENCIES), "org-SIN-AGENCIAS")
    expect(res.agency_id).toBe("")
    expect(res.org_id).toBe("")
  })

  // Regresión real: el lead 8f5ace24 (2026-08-21) se mandó con "kyo-viajes",
  // el ilike '%kyo-viajes%' no matcheó "Kyo Viajes" y el fallback global lo
  // escribió en el tablero de OTRO tenant.
  it("el separador no importa: kyo-viajes / KyoViajes / Kyo Viajes son la misma agencia", async () => {
    for (const tag of ["kyo-viajes", "KyoViajes", "Kyo Viajes", "KYO  VIAJES"]) {
      const res = await determineAgencyId(tag, makeSupabase(AGENCIES), null)
      expect(res.agency_id).toBe("ag-c-kyo")
      expect(res.org_id).toBe("org-C")
    }
  })

  it("sin orgId y sin match NO cae a un 'rosario' global: devuelve vacío", async () => {
    const res = await determineAgencyId("agencia-que-no-existe", makeSupabase(AGENCIES), null)
    expect(res.agency_id).toBe("")
    expect(res.org_id).toBe("")
  })

  it("sin orgId, un tag ambiguo entre tenants no se adivina", async () => {
    // "Rosario" existe en org-A y org-B: sin token no hay forma de desempatar.
    const res = await determineAgencyId("rosario", makeSupabase(AGENCIES), null)
    expect(res.agency_id).toBe("")
  })

  it("sin orgId y con un solo match, resuelve y toma el org de la agencia", async () => {
    const res = await determineAgencyId("madero", makeSupabase(AGENCIES), null)
    expect(res.agency_id).toBe("ag-a-madero")
    expect(res.org_id).toBe("org-A")
  })
})

describe("vendedor / vendedor_email en manychat_full_data", () => {
  const existing: ExistingLeadRow = {
    id: "lead-1",
    status: "NEW",
    list_name: "Campaña - Juana Perez",
    manychat_full_data: { whatsapp: "+5491123456789", vendedor: "Juana Perez" },
    contact_phone: "+5491123456789",
  }

  it("guarda el vendedor que manda el integrador (red de seguridad del rollout)", () => {
    const patch = buildLeadPatch(existing, {
      whatsapp: "+5491123456789",
      destino: "Bayahibe",
      vendedor: "Juana Perez",
      vendedor_email: "juana@agencia.com",
    })

    expect(patch.manychat_full_data.vendedor).toBe("Juana Perez")
    expect(patch.manychat_full_data.vendedor_email).toBe("juana@agencia.com")
  })

  it("un segundo POST sin vendedor NO borra el que ya estaba", () => {
    const patch = buildLeadPatch(existing, {
      whatsapp: "+5491123456789",
      destino: "Bayahibe",
    })

    expect(patch.manychat_full_data.vendedor).toBe("Juana Perez")
  })

  it("sigue sin tocar assigned_seller_id en el update (respeta al asesor)", () => {
    const patch = buildLeadPatch(existing, {
      vendedor_email: "otro@agencia.com",
    })

    expect(patch).not.toHaveProperty("assigned_seller_id")
    expect(patch).not.toHaveProperty("list_name")
  })
})

describe("resolveSellerIdByEmail (asignación al crear)", () => {
  type Membership = { agency_id: string; user_id: string }
  type User = { id: string; email: string; is_active: boolean }

  const MEMBERSHIPS: Membership[] = [
    { agency_id: "ag-1", user_id: "u-juana" },
    { agency_id: "ag-1", user_id: "u-guido" },
    { agency_id: "ag-1", user_id: "u-baja" },
    { agency_id: "ag-2", user_id: "u-otra-agencia" },
  ]

  const USERS: User[] = [
    { id: "u-juana", email: "Juana@Agencia.com", is_active: true },
    { id: "u-guido", email: "guido_perez@agencia.com", is_active: true },
    { id: "u-baja", email: "exvendedor@agencia.com", is_active: false },
    { id: "u-otra-agencia", email: "otra@agencia.com", is_active: true },
  ]

  // Fake mínimo: honra .eq("agency_id"), .in("id") y .eq("is_active").
  function makeSupabase(opts: { throwOn?: string } = {}) {
    return {
      from(table: string) {
        if (opts.throwOn === table) throw new Error("supabase caido")
        const state: any = {}
        const rows = () => {
          if (table === "user_agencies") {
            return MEMBERSHIPS.filter((m) => m.agency_id === state.agency_id).map(
              (m) => ({ user_id: m.user_id })
            )
          }
          return USERS.filter(
            (u) =>
              (state.in || []).includes(u.id) &&
              (state.is_active === undefined || u.is_active === state.is_active)
          ).map((u) => ({ id: u.id, email: u.email }))
        }
        const builder: any = {
          select: () => builder,
          eq: (col: string, val: unknown) => {
            state[col] = val
            return builder
          },
          in: (_col: string, vals: string[]) => {
            state.in = vals
            return builder
          },
          then: (resolve: (v: any) => void) =>
            Promise.resolve({ data: rows(), error: null }).then(resolve),
        }
        return builder
      },
    } as any
  }

  it("matchea ignorando mayúsculas y espacios", async () => {
    const res = await resolveSellerIdByEmail("  JUANA@agencia.com ", "ag-1", makeSupabase())
    expect(res).toEqual({ sellerId: "u-juana", resolution: "matched" })
  })

  it("un guion bajo en el email no actúa como comodín (match exacto, no LIKE)", async () => {
    const exacto = await resolveSellerIdByEmail("guido_perez@agencia.com", "ag-1", makeSupabase())
    expect(exacto.sellerId).toBe("u-guido")

    // Con ILIKE, "guido_perez" matchearía también "guidoXperez".
    const comodin = await resolveSellerIdByEmail("guidoXperez@agencia.com", "ag-1", makeSupabase())
    expect(comodin.sellerId).toBeNull()
  })

  it("sin vendedor_email no asigna nada (comportamiento de siempre)", async () => {
    expect(await resolveSellerIdByEmail(undefined, "ag-1", makeSupabase())).toEqual({
      sellerId: null,
      resolution: "absent",
    })
    expect(await resolveSellerIdByEmail("   ", "ag-1", makeSupabase())).toEqual({
      sellerId: null,
      resolution: "absent",
    })
  })

  it("no asigna un usuario de OTRA agencia", async () => {
    const res = await resolveSellerIdByEmail("otra@agencia.com", "ag-1", makeSupabase())
    expect(res).toEqual({ sellerId: null, resolution: "not_found" })
  })

  it("no asigna un usuario dado de baja", async () => {
    const res = await resolveSellerIdByEmail("exvendedor@agencia.com", "ag-1", makeSupabase())
    expect(res).toEqual({ sellerId: null, resolution: "not_found" })
  })

  it("un email que no existe deja rastro pero no rompe", async () => {
    const res = await resolveSellerIdByEmail("fantasma@agencia.com", "ag-1", makeSupabase())
    expect(res).toEqual({ sellerId: null, resolution: "not_found" })
  })

  it("agencia sin usuarios", async () => {
    const res = await resolveSellerIdByEmail("juana@agencia.com", "ag-vacia", makeSupabase())
    expect(res).toEqual({ sellerId: null, resolution: "no_agency_users" })
  })

  it("si la query falla, el lead se crea igual (sellerId null, no throw)", async () => {
    const res = await resolveSellerIdByEmail(
      "juana@agencia.com",
      "ag-1",
      makeSupabase({ throwOn: "user_agencies" })
    )
    expect(res).toEqual({ sellerId: null, resolution: "error" })
  })
})
