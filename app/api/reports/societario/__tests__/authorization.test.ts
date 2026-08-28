/**
 * @jest-environment node
 *
 * Quién puede ver el reporte societario, y con qué parámetros.
 *
 * El caso que justifica el gate extra es VIEWER: tiene `accounting.read = true`
 * en la matriz estática, así que el guard genérico de reportes lo dejaría pasar
 * y vería el resultado del negocio y el reparto entre socios.
 *
 * Se deja correr el `canPerformAction` real contra la matriz estática
 * (`resolveUserPermissions` mockeado a null) y solo se mockean auth, Supabase y
 * la lectura de datos: lo que se verifica es la decisión de permisos.
 */

import { GET } from "@/app/api/reports/societario/route"
import { GET as GET_PDF } from "@/app/api/reports/societario/pdf/route"
import { getCurrentUser } from "@/lib/auth"
import { resolveUserPermissions } from "@/lib/permissions-agency"
import { buildDefaultMatrix } from "@/lib/permissions/resolved"
import { createServerClient } from "@/lib/supabase/server"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({
  createServerClient: jest.fn(),
  createAdminClient: jest.fn(),
}))
jest.mock("@/lib/permissions-agency", () => ({
  ...jest.requireActual("@/lib/permissions-agency"),
  // null → canPerformAction cae a la matriz estática de lib/permissions.ts,
  // que es justamente la que queremos verificar. Los tests que necesitan la
  // matriz resuelta (multi-rol) la devuelven con mockResolvedValueOnce.
  resolveUserPermissions: jest.fn(async () => null),
}))
jest.mock("@/lib/permissions-api", () => ({
  ...jest.requireActual("@/lib/permissions-api"),
  getUserAgencyIds: jest.fn(async () => []),
}))
// La lectura real no aporta a este test y arrastra media docena de tablas.
jest.mock("@/lib/reports/societario-report-data", () => ({
  buildSocietarioReportData: jest.fn(async () => ({
    filters: { dateFrom: "2026-07-01", dateTo: "2026-07-31", currency: "USD" },
    report: { currency: "USD" },
  })),
  loadSocietarioReportCompany: jest.fn(async () => ({ name: "Agencia" })),
}))
jest.mock("@/lib/pdf/societario-report-pdf", () => ({
  generateSocietarioReportPdf: jest.fn(() => new ArrayBuffer(8)),
}))

const ORG = "org-1"

function login(role: string, opts: { orgId?: string | null; roles?: string[] } = {}) {
  ;(getCurrentUser as jest.Mock).mockResolvedValue({
    user: {
      id: "user-1",
      role,
      roles: opts.roles ?? [role],
      org_id: opts.orgId === undefined ? ORG : opts.orgId,
    },
  })
  ;(createServerClient as jest.Mock).mockResolvedValue({ from: jest.fn() })
}

function req(query = "") {
  return new Request(`http://localhost/api/reports/societario${query}`)
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("GET /api/reports/societario — quién entra", () => {
  const CON_ACCESO = ["SUPER_ADMIN", "ORG_OWNER", "ADMIN", "CONTABLE"]
  const SIN_ACCESO = ["SELLER", "POST_VENTA", "VIEWER"]

  it.each(CON_ACCESO)("%s ve el reporte", async (role) => {
    login(role)
    const res = await GET(req())
    expect(res.status).toBe(200)
  })

  it.each(SIN_ACCESO)("%s recibe 403", async (role) => {
    login(role)
    const res = await GET(req())
    expect(res.status).toBe(403)
  })

  it("VIEWER queda afuera aunque tenga accounting.read", async () => {
    // Es el motivo de que exista la lista de roles además del permiso.
    login("VIEWER")
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/permiso/i)
  })

  it("un SELLER con CONTABLE entre sus roles adicionales sí entra", async () => {
    // La fusión de roles la hace `resolveUserPermissions`: para este usuario
    // devuelve una matriz con accounting.read en true. Lo que se verifica acá
    // es que la lista de roles no lo bloquee después — restringe, no reemplaza.
    login("SELLER", { roles: ["SELLER", "CONTABLE"] })
    ;(resolveUserPermissions as jest.Mock).mockResolvedValueOnce(buildDefaultMatrix("CONTABLE"))

    const res = await GET(req())
    expect(res.status).toBe(200)
  })

  it("una agencia que revoca accounting bloquea igual al contable", async () => {
    // La lista de roles restringe, nunca otorga: si el override de agencia le
    // sacó el módulo, el reporte no aparece.
    login("CONTABLE")
    ;(resolveUserPermissions as jest.Mock).mockResolvedValueOnce({
      ...buildDefaultMatrix("CONTABLE"),
      accounting: { read: false, write: false, delete: false, export: false, ownDataOnly: false },
    })

    const res = await GET(req())
    expect(res.status).toBe(403)
  })

  it("un usuario sin organización recibe 400", async () => {
    login("ORG_OWNER", { orgId: null })
    const res = await GET(req())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/organización/i)
  })
})

describe("GET /api/reports/societario — parámetros", () => {
  it("rechaza un rango de fechas invertido", async () => {
    login("CONTABLE")
    const res = await GET(req("?dateFrom=2026-07-31&dateTo=2026-07-01"))
    expect(res.status).toBe(400)
  })

  it("rechaza una alícuota fuera de rango", async () => {
    login("CONTABLE")
    expect((await GET(req("?ivaRatePct=150"))).status).toBe(400)
    expect((await GET(req("?ivaRatePct=-1"))).status).toBe(400)
  })

  it("acepta alícuota 0 (org que ya carga el IVA como gasto)", async () => {
    login("CONTABLE")
    const res = await GET(req("?ivaRatePct=0"))
    expect(res.status).toBe(200)
  })

  it("rechaza un tipo de cambio absurdo", async () => {
    login("CONTABLE")
    expect((await GET(req("?exchangeRate=0"))).status).toBe(400)
    expect((await GET(req("?exchangeRate=99999999"))).status).toBe(400)
  })

  it("acepta los dos criterios de venta neta y rechaza cualquier otro", async () => {
    // El criterio cambia la venta neta en un orden de magnitud: un valor no
    // reconocido tiene que cortar, no caer en silencio al default.
    login("CONTABLE")
    expect((await GET(req("?netoIvaCriterio=MARGEN"))).status).toBe(200)
    expect((await GET(req("?netoIvaCriterio=VENTA"))).status).toBe(200)
    expect((await GET(req("?netoIvaCriterio=OTRO"))).status).toBe(400)
  })

  it("el criterio de venta neta no relaja el gate de roles", async () => {
    login("VIEWER")
    expect((await GET(req("?netoIvaCriterio=VENTA"))).status).toBe(403)
    expect((await GET_PDF(req("/pdf?netoIvaCriterio=VENTA"))).status).toBe(403)
  })
})

describe("GET /api/reports/societario/pdf", () => {
  it("aplica el mismo gate que la pantalla", async () => {
    // El PDF no puede ser una segunda puerta más débil.
    login("VIEWER")
    expect((await GET_PDF(req("/pdf"))).status).toBe(403)

    login("SELLER")
    expect((await GET_PDF(req("/pdf"))).status).toBe(403)
  })

  it("un contable lo descarga", async () => {
    login("CONTABLE")
    const res = await GET_PDF(req("/pdf"))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/pdf")
  })
})
