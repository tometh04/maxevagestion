/**
 * @jest-environment node
 *
 * Quién puede correr "Generar Pagos Hoy", y sobre qué organización.
 *
 * Reportado por Lozada (21/08/2026): un ADMIN tocó el botón sin querer y
 * adelantó el vencimiento de 32 gastos recurrentes de una sola pasada. La route
 * no exigía `org_id` ni permisos: se apoyaba solo en RLS, contra la regla 1 de
 * AGENTS.md ("todo endpoint user-facing debe exigir user.org_id y filtrar
 * explícitamente por org_id").
 *
 * Se deja correr el `canPerformAction` real contra la matriz estática
 * (matrix: null) y solo se mockean el contexto del request y Supabase: lo que
 * se verifica es la decisión de permisos y el scope, no el mock.
 */

import { POST } from "@/app/api/recurring-payments/generate/route"
import { getRequestPermissions } from "@/lib/permissions/request"

jest.mock("@/lib/permissions/request", () => ({ getRequestPermissions: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({
  createServerClient: jest.fn(),
  createAdminClient: jest.fn(),
}))

const ORG = "org-1"
const OTHER_ORG = "org-2"
const HOY = new Date().toISOString().split("T")[0]

const RECURRING = [
  {
    id: "rp-1",
    org_id: ORG,
    provider_name: "Alquiler",
    description: "Alquiler",
    amount: 750000,
    currency: "ARS",
    frequency: "MONTHLY",
    is_active: true,
    next_due_date: "2026-07-01",
    end_date: null,
  },
  {
    id: "rp-2",
    org_id: ORG,
    provider_name: "Contador",
    description: "Contador",
    amount: 400000,
    currency: "ARS",
    frequency: "MONTHLY",
    is_active: true,
    next_due_date: "2026-07-02",
    end_date: null,
  },
  {
    // Vencimiento futuro: no debe entrar en el lote.
    id: "rp-futuro",
    org_id: ORG,
    provider_name: "Seguro",
    description: "Seguro",
    amount: 10000,
    currency: "ARS",
    frequency: "MONTHLY",
    is_active: true,
    next_due_date: "2099-01-01",
    end_date: null,
  },
  {
    id: "rp-ajeno",
    org_id: OTHER_ORG,
    provider_name: "Gasto de otro tenant",
    description: "Gasto de otro tenant",
    amount: 999999,
    currency: "ARS",
    frequency: "MONTHLY",
    is_active: true,
    next_due_date: "2026-07-01",
    end_date: null,
  },
]

/**
 * Mock que respeta `.eq()` y `.lte()`, que es donde vive el aislamiento: si la
 * route no filtra por org_id, el mock devuelve también la fila del otro tenant
 * y el test lo detecta.
 */
function makeSupabase() {
  const updated: Array<{ table: string; filters: Record<string, any>; payload: any }> = []
  const inserted: Array<{ table: string; payload: any }> = []

  const client: any = {
    from: jest.fn((table: string) => {
      const filters: Record<string, any> = {}
      const lteFilters: Record<string, any> = {}
      let pendingUpdate: any = null

      const rowsFor = (t: string): any[] => (t === "recurring_payments" ? RECURRING : [])

      const applyFilters = (rows: any[]) =>
        rows
          .filter((row) => Object.entries(filters).every(([col, val]) => row[col] === val))
          .filter((row) => Object.entries(lteFilters).every(([col, val]) => row[col] <= val))

      const builder: any = {
        select: jest.fn(() => builder),
        eq: jest.fn((col: string, val: any) => {
          filters[col] = val
          if (pendingUpdate) {
            // Se registra en cada `.eq()`; el último gana y refleja el filtro completo.
            const existing = updated[updated.length - 1]
            if (existing && existing.payload === pendingUpdate) existing.filters = { ...filters }
            else updated.push({ table, filters: { ...filters }, payload: pendingUpdate })
          }
          return builder
        }),
        lte: jest.fn((col: string, val: any) => {
          lteFilters[col] = val
          return builder
        }),
        order: jest.fn(() => builder),
        limit: jest.fn(() => builder),
        insert: jest.fn((payload: any) => {
          inserted.push({ table, payload })
          return builder
        }),
        update: jest.fn((payload: any) => {
          pendingUpdate = payload
          return builder
        }),
        maybeSingle: jest.fn(async () => {
          const [row] = applyFilters(rowsFor(table))
          return { data: row ?? null, error: null }
        }),
        single: jest.fn(async () => {
          const [row] = applyFilters(rowsFor(table))
          return row ? { data: row, error: null } : { data: null, error: { message: "not found" } }
        }),
        then: (resolve: any) =>
          Promise.resolve({ data: applyFilters(rowsFor(table)), error: null }).then(resolve),
      }
      return builder
    }),
  }

  return { client, updated, inserted }
}

function login(role: string, orgId: string | null = ORG) {
  const { client, updated, inserted } = makeSupabase()
  ;(getRequestPermissions as jest.Mock).mockResolvedValue({
    user: { id: "user-1", role, roles: [role], org_id: orgId },
    supabase: client,
    agencyIds: [],
    // null → canPerformAction cae a la matriz estática de lib/permissions.ts.
    matrix: null,
  })
  return { updated, inserted }
}

const req = (qs = "") =>
  new Request(`http://localhost/api/recurring-payments/generate${qs}`, { method: "POST" })

beforeEach(() => {
  jest.clearAllMocks()
})

describe("POST /api/recurring-payments/generate — quién puede generar", () => {
  const ROLES_CON_ACCESO = ["ORG_OWNER", "SUPER_ADMIN", "ADMIN", "CONTABLE"]
  const ROLES_SIN_ACCESO = ["SELLER", "VIEWER", "POST_VENTA"]

  it.each(ROLES_CON_ACCESO)("%s puede generar", async (role) => {
    login(role)
    const res = await POST(req("?dryRun=1"))
    expect(res.status).not.toBe(403)
  })

  it.each(ROLES_SIN_ACCESO)("%s no puede generar", async (role) => {
    login(role)
    const res = await POST(req())
    expect(res.status).toBe(403)
  })

  it("un usuario sin organización no puede generar", async () => {
    login("ORG_OWNER", null)
    const res = await POST(req())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/organización/i)
  })

  it("un rol sin permiso no llega a escribir nada", async () => {
    const { updated } = login("SELLER")
    await POST(req())
    expect(updated).toHaveLength(0)
  })
})

describe("POST /api/recurring-payments/generate — aislamiento por tenant", () => {
  it("el preview solo incluye gastos vencidos de la organización del usuario", async () => {
    login("ADMIN")
    const res = await POST(req("?dryRun=1"))
    expect(res.status).toBe(200)

    const ids = (await res.json()).due.map((p: any) => p.id)
    expect(ids).toEqual(expect.arrayContaining(["rp-1", "rp-2"]))
    expect(ids).not.toContain("rp-ajeno")
    expect(ids).not.toContain("rp-futuro")
  })

  it("la ejecución real solo actualiza filas de la organización del usuario", async () => {
    const { updated } = login("ADMIN")
    const res = await POST(req())
    expect(res.status).toBe(200)

    expect(updated.length).toBeGreaterThan(0)
    for (const u of updated) {
      expect(u.table).toBe("recurring_payments")
      expect(u.filters.org_id).toBe(ORG)
    }
    const tocados = updated.map((u) => u.filters.id)
    expect(tocados).not.toContain("rp-ajeno")
  })

  it("las alertas se crean con el org_id del gasto", async () => {
    const { inserted } = login("ADMIN")
    await POST(req())

    const alertas = inserted.filter((i) => i.table === "alerts")
    expect(alertas.length).toBeGreaterThan(0)
    for (const a of alertas) expect(a.payload.org_id).toBe(ORG)
  })
})

describe("POST /api/recurring-payments/generate — dryRun", () => {
  it("no escribe nada", async () => {
    const { updated, inserted } = login("ADMIN")
    const res = await POST(req("?dryRun=1"))

    expect((await res.json()).dryRun).toBe(true)
    expect(updated).toHaveLength(0)
    expect(inserted).toHaveLength(0)
  })

  it("devuelve el mismo set que después se modifica", async () => {
    login("ADMIN")
    const preview = await (await POST(req("?dryRun=1"))).json()

    const { updated } = login("ADMIN")
    await POST(req())

    expect(updated.map((u) => u.filters.id).sort()).toEqual(
      preview.due.map((p: any) => p.id).sort()
    )
  })

  it("no reporta gastos como generados", async () => {
    login("ADMIN")
    const body = await (await POST(req("?dryRun=1"))).json()
    expect(body.generated).toBe(0)
  })
})

describe("POST /api/recurring-payments/generate — sin gastos vencidos", () => {
  it("no modifica nada y lo dice", async () => {
    const { updated } = login("ADMIN", "org-sin-gastos")
    const res = await POST(req())
    const body = await res.json()

    expect(body.generated).toBe(0)
    expect(body.due).toEqual([])
    expect(updated).toHaveLength(0)
  })
})

// Guarda contra el propio mock: si `HOY` no supera los vencimientos de prueba,
// los tests de arriba pasarían por vacío en vez de por scope.
it("los gastos de prueba están efectivamente vencidos", () => {
  expect("2026-07-01" <= HOY).toBe(true)
})
