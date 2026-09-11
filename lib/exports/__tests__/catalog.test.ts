import {
  EXPORT_DEFINITIONS,
  EXPORT_GROUPS,
  availableExportIds,
  canRunExport,
  getExportDefinition,
  type ExportSelection,
} from "@/lib/exports/catalog"
import { EXPORT_DATASETS, getExportDataset } from "@/lib/exports/datasets"
import type { Module, Permission } from "@/lib/permissions"

const SELECTION: ExportSelection = {
  dateFrom: "2026-01-01",
  dateTo: "2026-03-31",
  agencyId: "agency-1",
  year: 2026,
  month: 3,
}

/** Contexto que dice que sí a todo, para probar las URLs sin permisos de por medio. */
const TODO_PERMITIDO = { roles: ["SUPER_ADMIN"], can: () => true }

function urlOf(id: string, formatId: string, selection: ExportSelection = SELECTION): URL {
  const definition = getExportDefinition(id)
  if (!definition) throw new Error(`No existe la exportación ${id}`)
  return new URL(definition.buildUrl(formatId, selection), "https://app.test")
}

describe("catálogo de exportaciones", () => {
  it("no tiene ids repetidos", () => {
    const ids = EXPORT_DEFINITIONS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("ubica cada exportación en un grupo que existe", () => {
    const groupIds = EXPORT_GROUPS.map((g) => g.id)
    for (const definition of EXPORT_DEFINITIONS) {
      expect(groupIds).toContain(definition.groupId)
    }
  })

  it("declara al menos un formato por exportación", () => {
    for (const definition of EXPORT_DEFINITIONS) {
      expect(definition.formats.length).toBeGreaterThan(0)
    }
  })

  it("apunta a rutas de la app, no a URLs externas", () => {
    for (const definition of EXPORT_DEFINITIONS) {
      for (const formato of definition.formats) {
        expect(definition.buildUrl(formato.id, SELECTION)).toMatch(/^\/api\//)
      }
    }
  })

  it("cada exportación servida por /api/exports tiene su dataset, y al revés", () => {
    // Si el catálogo ofrece un id que el server no sabe construir, el botón da
    // 404; si hay un dataset sin entrada en el catálogo, nadie puede pedirlo.
    const enCatalogo = EXPORT_DEFINITIONS.filter((d) =>
      d.buildUrl(d.formats[0].id, SELECTION).startsWith("/api/exports/")
    ).map((d) => d.id)
    const enDatasets = EXPORT_DATASETS.map((d) => d.id)
    expect(enCatalogo.sort()).toEqual(enDatasets.sort())
    for (const id of enCatalogo) {
      expect(getExportDataset(id)).toBeDefined()
    }
  })

  it("la URL de un dataset lleva su id, no el de otro", () => {
    for (const dataset of EXPORT_DATASETS) {
      const definition = getExportDefinition(dataset.id)!
      const url = new URL(definition.buildUrl("csv", SELECTION), "https://app.test")
      expect(url.pathname).toBe(`/api/exports/${dataset.id}`)
    }
  })
})

describe("armado de URLs", () => {
  it("manda el período a cada endpoint con el nombre de parámetro que ese endpoint espera", () => {
    // El Libro Diario los llama desde/hasta y las facturas from/to: si el
    // catálogo usa el nombre equivocado, el endpoint ignora el filtro y baja
    // TODO en silencio (o rechaza por falta de fechas).
    expect(urlOf("operations", "csv").searchParams.get("dateFrom")).toBe("2026-01-01")
    expect(urlOf("operations", "csv").searchParams.get("dateTo")).toBe("2026-03-31")
    expect(urlOf("cash", "csv").searchParams.get("dateFrom")).toBe("2026-01-01")
    expect(urlOf("payments", "csv").searchParams.get("dateTo")).toBe("2026-03-31")
    expect(urlOf("ledger", "csv").searchParams.get("dateFrom")).toBe("2026-01-01")
    expect(urlOf("libro-diario", "csv").searchParams.get("desde")).toBe("2026-01-01")
    expect(urlOf("libro-diario", "csv").searchParams.get("hasta")).toBe("2026-03-31")
    expect(urlOf("invoices", "zip").searchParams.get("from")).toBe("2026-01-01")
    expect(urlOf("invoices", "zip").searchParams.get("to")).toBe("2026-03-31")
  })

  it("toda exportación con control de período manda las dos fechas", () => {
    for (const definition of EXPORT_DEFINITIONS) {
      if (!definition.controls.includes("period")) continue
      const params = new URL(
        definition.buildUrl(definition.formats[0].id, SELECTION),
        "https://app.test"
      ).searchParams
      const values: string[] = []
      params.forEach((value) => values.push(value))
      expect(values).toContain("2026-01-01")
      expect(values).toContain("2026-03-31")
    }
  })

  it("filtra por agencia cuando hay una elegida", () => {
    expect(urlOf("cash", "csv").searchParams.get("agencyId")).toBe("agency-1")
    expect(urlOf("libro-diario", "csv").searchParams.get("agencyId")).toBe("agency-1")
  })

  it('omite el parámetro de agencia cuando son "todas"', () => {
    // Los endpoints tratan el parámetro ausente y "ALL" igual, pero omitirlo es
    // lo único que funciona en los dos casos.
    const todas: ExportSelection = { ...SELECTION, agencyId: "ALL" }
    for (const definition of EXPORT_DEFINITIONS) {
      if (!definition.controls.includes("agency")) continue
      const url = new URL(definition.buildUrl(definition.formats[0].id, todas), "https://app.test")
      expect(url.searchParams.has("agencyId")).toBe(false)
    }
  })

  it("pasa el formato elegido al Libro Diario", () => {
    expect(urlOf("libro-diario", "csv").searchParams.get("formato")).toBe("csv")
    expect(urlOf("libro-diario", "pdf").searchParams.get("formato")).toBe("pdf")
  })

  it("el Libro IVA va por mes y no por período", () => {
    const url = urlOf("libro-iva", "rg4597")
    expect(url.searchParams.get("year")).toBe("2026")
    expect(url.searchParams.get("month")).toBe("3")
    expect(url.searchParams.get("format")).toBe("rg4597")
    expect(url.searchParams.has("dateFrom")).toBe(false)
  })

  it("pide solo facturas autorizadas", () => {
    expect(urlOf("invoices", "zip").searchParams.get("status")).toBe("authorized")
  })

  it("no le manda filtros a los maestros, que no se recortan", () => {
    // El plan de cuentas o los operadores acotados al período serían un archivo
    // incompleto que igual parece correcto.
    for (const id of ["operators", "team", "chart-of-accounts", "financial-accounts", "operator-debt"]) {
      const url = urlOf(id, "csv")
      expect(url.search).toBe("")
    }
  })
})

describe("permisos", () => {
  function ctx(
    roles: string[],
    permitidos: Array<[Module, Permission]>,
    ownDataOnlyModules: Module[] = []
  ) {
    return {
      roles,
      can: (module: Module, permission: Permission) =>
        permitidos.some(([m, p]) => m === module && p === permission),
      ownDataOnly: (module: Module) => ownDataOnlyModules.includes(module),
    }
  }

  it("muestra cada exportación solo si el usuario tiene el permiso que el endpoint chequea", () => {
    const soloContabilidad = ctx(["ADMIN"], [["accounting", "read"]])
    expect(availableExportIds(soloContabilidad).sort()).toEqual(
      ["chart-of-accounts", "ledger", "libro-diario", "libro-iva", "operator-debt"].sort()
    )
  })

  it("no ofrece los datasets nuevos a quien está limitado a sus propios datos", () => {
    // Bajar "los operadores de la agencia" recortado a un usuario no es lo que
    // el archivo dice ser, y sin recortar sería ampliarle el alcance.
    const limitado = ctx(["ADMIN"], [["operators", "read"]], ["operators"])
    expect(availableExportIds(limitado)).not.toContain("operators")
    const completo = ctx(["ADMIN"], [["operators", "read"]])
    expect(availableExportIds(completo)).toContain("operators")
  })

  it("sigue ofreciendo los exports viejos, que se recortan solos", () => {
    // customers/export-csv aplica applyCustomersFilters: el archivo ya sale
    // acotado al usuario, así que esconderlo sería sacarle algo que sí puede.
    const limitado = ctx(["SELLER"], [["customers", "read"]], ["customers"])
    expect(availableExportIds(limitado)).toEqual(["customers"])
  })

  it("no ofrece nada a un usuario sin permisos de módulo ni rol de administración", () => {
    expect(availableExportIds(ctx(["SELLER"], []))).toEqual([])
  })

  it("deja el Libro IVA al dueño del tenant, no solo a ADMIN y CONTABLE", () => {
    // ORG_OWNER tiene los permisos de SUPER_ADMIN; el chequeo literal contra el
    // string lo dejaba afuera del libro fiscal.
    const libroIva = getExportDefinition("libro-iva")!
    expect(canRunExport(libroIva, ctx(["ORG_OWNER"], []))).toBe(true)
    expect(canRunExport(libroIva, ctx(["ADMIN"], []))).toBe(true)
    expect(canRunExport(libroIva, ctx(["CONTABLE"], []))).toBe(true)
    expect(canRunExport(libroIva, ctx(["SELLER"], []))).toBe(false)
  })

  it("toma en cuenta los roles adicionales, no solo el principal", () => {
    const libroIva = getExportDefinition("libro-iva")!
    expect(canRunExport(libroIva, ctx(["SELLER", "CONTABLE"], []))).toBe(true)
  })

  it("no le da las facturas a quien no puede ver caja", () => {
    // El ZIP de facturas se gatea por el módulo `cash`, igual que el endpoint.
    const facturas = getExportDefinition("invoices")!
    expect(canRunExport(facturas, ctx(["ADMIN"], [["cash", "read"]]))).toBe(true)
    expect(canRunExport(facturas, ctx(["ADMIN"], [["operations", "read"]]))).toBe(false)
  })

  it("con todos los permisos ofrece el catálogo completo", () => {
    expect(availableExportIds(TODO_PERMITIDO).length).toBe(EXPORT_DEFINITIONS.length)
  })
})
