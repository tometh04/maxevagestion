import {
  buildPageLocation,
  isAnalyticsEnabledPath,
  normalizePath,
  normalizeQuery,
} from "../paths"

const UUID = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"

describe("isAnalyticsEnabledPath", () => {
  it("excluye las vistas publicas de cotizacion", () => {
    expect(isAnalyticsEnabledPath("/cotizacion")).toBe(false)
    expect(isAnalyticsEnabledPath(`/cotizacion/${UUID}`)).toBe(false)
    expect(isAnalyticsEnabledPath("/cotizacion/abc123")).toBe(false)
  })

  it("no excluye por prefijo de string, solo por limite de segmento", () => {
    // Regresion: `/cotizaciones` comparte prefijo con `/cotizacion` pero es otra
    // ruta y debe trackearse.
    expect(isAnalyticsEnabledPath("/cotizaciones")).toBe(true)
    expect(isAnalyticsEnabledPath("/cotizaciones/nueva")).toBe(true)
  })

  it("habilita el resto de la app", () => {
    expect(isAnalyticsEnabledPath("/")).toBe(true)
    expect(isAnalyticsEnabledPath("/dashboard")).toBe(true)
    expect(isAnalyticsEnabledPath("/admin/orgs")).toBe(true)
    expect(isAnalyticsEnabledPath("/login")).toBe(true)
  })

  it("no habilita nada sin pathname", () => {
    expect(isAnalyticsEnabledPath(null)).toBe(false)
    expect(isAnalyticsEnabledPath(undefined)).toBe(false)
    expect(isAnalyticsEnabledPath("")).toBe(false)
  })
})

describe("normalizePath", () => {
  it("colapsa los UUID de las rutas dinamicas reales", () => {
    expect(normalizePath(`/operations/${UUID}`)).toBe("/operations/:id")
    expect(normalizePath(`/customers/${UUID}`)).toBe("/customers/:id")
    expect(normalizePath(`/operators/${UUID}`)).toBe("/operators/:id")
    expect(normalizePath(`/growth-studio/campaigns/${UUID}`)).toBe(
      "/growth-studio/campaigns/:id"
    )
    expect(normalizePath(`/admin/orgs/${UUID}`)).toBe("/admin/orgs/:id")
    expect(normalizePath(`/admin/tickets/${UUID}`)).toBe("/admin/tickets/:id")
  })

  it("conserva los literales hermanos de un segmento dinamico", () => {
    // `campaigns/new` convive con `campaigns/[id]`: si el normalizador se comiera
    // el literal, perdemos la metrica de "empezo a crear una campana".
    expect(normalizePath("/growth-studio/campaigns/new")).toBe(
      "/growth-studio/campaigns/new"
    )
    expect(normalizePath("/operations/billing/new")).toBe("/operations/billing/new")
    expect(normalizePath("/operations/billing/credit-note/new")).toBe(
      "/operations/billing/credit-note/new"
    )
  })

  it("conserva los slugs editoriales de /ayuda", () => {
    expect(normalizePath("/ayuda/como-cargar-una-operacion")).toBe(
      "/ayuda/como-cargar-una-operacion"
    )
  })

  it("colapsa ids numericos y tokens opacos", () => {
    expect(normalizePath("/operations/12345")).toBe("/operations/:id")
    expect(normalizePath("/cotizacion/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef")).toBe(
      "/cotizacion/:token"
    )
  })

  it("normaliza raiz y vacios", () => {
    expect(normalizePath("/")).toBe("/")
    expect(normalizePath("")).toBe("/")
    expect(normalizePath(null)).toBe("/")
  })
})

describe("normalizeQuery", () => {
  it("descarta el buscador de /admin/orgs (nombre, slug, CUIT, email)", () => {
    expect(normalizeQuery("?q=Juan%20Perez")).toBe("")
    expect(normalizeQuery("?q=20304050607")).toBe("")
    expect(normalizeQuery("?search=cliente@mail.com")).toBe("")
  })

  it("descarta tokens de auth", () => {
    expect(normalizeQuery("?token=abc123def456")).toBe("")
    expect(normalizeQuery("?code=xyz&access_token=eyJhbGci")).toBe("")
  })

  it("conserva solo los params del allowlist", () => {
    expect(normalizeQuery("?tab=payments&q=Juan")).toBe("?tab=payments")
    expect(normalizeQuery("?checkout=done&plan=pro")).toBe("?checkout=done&plan=pro")
  })

  it("enmascara los identificadores del allowlist", () => {
    expect(normalizeQuery(`?agencyId=${UUID}`)).toBe("?agencyId=:id")
    expect(normalizeQuery(`?leadId=${UUID}&tab=notes`)).toBe("?leadId=:id&tab=notes")
  })

  it("ordena las claves de forma deterministica", () => {
    // El componente de pageview dedupea por este string: un orden inestable
    // mandaria hits duplicados en cada render.
    expect(normalizeQuery("?view=list&tab=payments")).toBe(
      normalizeQuery("?tab=payments&view=list")
    )
    expect(normalizeQuery("?view=list&tab=payments")).toBe("?tab=payments&view=list")
  })

  it("colapsa el debounce del buscador al mismo string", () => {
    // Sin esto se manda un page_view por tecla tipeada.
    const hits = ["?q=J", "?q=Ju", "?q=Jua", "?q=Juan"].map(normalizeQuery)
    expect(new Set(hits).size).toBe(1)
    expect(hits[0]).toBe("")
  })

  it("tolera entradas vacias o invalidas", () => {
    expect(normalizeQuery(null)).toBe("")
    expect(normalizeQuery("")).toBe("")
    expect(normalizeQuery("?")).toBe("")
  })
})

describe("buildPageLocation", () => {
  it("arma una URL absoluta ya saneada", () => {
    expect(
      buildPageLocation("https://app.vibook.ai", `/operations/${UUID}`, "?tab=payments&q=Juan")
    ).toBe("https://app.vibook.ai/operations/:id?tab=payments")
  })

  it("no filtra la busqueda del admin", () => {
    const location = buildPageLocation("https://app.vibook.ai", "/admin/orgs", "?q=Juan Perez")
    expect(location).toBe("https://app.vibook.ai/admin/orgs")
    expect(location).not.toContain("Juan")
  })
})
