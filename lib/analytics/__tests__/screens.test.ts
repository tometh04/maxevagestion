import {
  __resetScreenDedupe,
  sanitizeViewName,
  screenForView,
  screenFromPath,
  shouldEmitScreen,
} from "../screens"

describe("screenFromPath", () => {
  it("conserva la ruta de las pantallas reales", () => {
    expect(screenFromPath("/reports")).toBe("/reports")
    expect(screenFromPath("/accounting/ledger")).toBe("/accounting/ledger")
    expect(screenFromPath("/settings/integrations/callbell")).toBe(
      "/settings/integrations/callbell"
    )
  })

  it("colapsa los ids a :id (via normalizePath)", () => {
    expect(screenFromPath("/operations/0f9c1a4e-1111-4222-8333-444455556666")).toBe(
      "/operations/:id"
    )
    expect(screenFromPath("/customers/12345")).toBe("/customers/:id")
  })

  it("colapsa los slugs de contenido, que son la fuga real de cardinalidad", () => {
    // Los slugs salen de `kb_articles`: crecen con cada articulo publicado y
    // llenarian el ranking de filas de una sola visita.
    expect(screenFromPath("/ayuda/como-cargar-una-operacion")).toBe("/ayuda/:slug")
    expect(screenFromPath("/ayuda/otro-articulo-cualquiera")).toBe("/ayuda/:slug")
    expect(screenFromPath("/ayuda")).toBe("/ayuda")
  })

  it("corta a tres segmentos", () => {
    expect(screenFromPath("/a/b/c/d/e")).toBe("/a/b/c")
  })

  it("descarta lo que no es uso de tenant", () => {
    expect(screenFromPath("/admin/usage")).toBeNull()
    expect(screenFromPath("/login")).toBeNull()
    expect(screenFromPath("/cotizacion/abc")).toBeNull()
    expect(screenFromPath(null)).toBeNull()
  })

  it("tolera la raiz", () => {
    expect(screenFromPath("/")).toBe("/")
  })
})

describe("sanitizeViewName", () => {
  it("normaliza a minusculas y acota", () => {
    expect(sanitizeViewName("Margins")).toBe("margins")
    expect(sanitizeViewName("tab-facturas_compras")).toBe("tab-facturas_compras")
    expect(sanitizeViewName("a".repeat(50))).toHaveLength(32)
  })

  it("descarta lo que no queda en nada util", () => {
    expect(sanitizeViewName("")).toBeNull()
    expect(sanitizeViewName("   ")).toBeNull()
    expect(sanitizeViewName("!!!")).toBeNull()
    expect(sanitizeViewName(null)).toBeNull()
  })

  it("limpia un value interpolado con datos", () => {
    // Un `value` armado con datos del tenant seria una fuga silenciosa.
    expect(sanitizeViewName("cliente Juan Pérez")).toBe("clientejuanprez")
  })
})

describe("screenForView", () => {
  it("compone tabs y dialogs con el mismo formato", () => {
    expect(screenForView("/reports", "tab", "margins")).toBe("/reports#tab:margins")
    expect(screenForView("/sales/leads", "dlg", "quotation-builder")).toBe(
      "/sales/leads#dlg:quotation-builder"
    )
  })

  it("no compone si falta la base o la vista", () => {
    expect(screenForView(null, "tab", "margins")).toBeNull()
    expect(screenForView("/reports", "tab", "")).toBeNull()
  })
})

describe("shouldEmitScreen", () => {
  beforeEach(() => __resetScreenDedupe())

  it("deja pasar la primera vez", () => {
    expect(shouldEmitScreen("/reports#tab:sales", 1000)).toBe(true)
  })

  it("frena el remonte de tabs anidados", () => {
    // Cambiar un tab exterior remonta los interiores: sin ventana, un click
    // produce dos o tres eventos e infla el ranking.
    expect(shouldEmitScreen("/reports#tab:sales", 1000)).toBe(true)
    expect(shouldEmitScreen("/reports#tab:sales", 1500)).toBe(false)
  })

  it("vuelve a dejar pasar despues de la ventana", () => {
    expect(shouldEmitScreen("/reports#tab:sales", 1000)).toBe(true)
    expect(shouldEmitScreen("/reports#tab:sales", 3100)).toBe(true)
  })

  it("no confunde claves distintas", () => {
    expect(shouldEmitScreen("/reports#tab:sales", 1000)).toBe(true)
    expect(shouldEmitScreen("/reports#tab:margins", 1000)).toBe(true)
  })
})
