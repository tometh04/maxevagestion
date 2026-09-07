import { ADDON_KEYS } from "@/lib/addons/catalog"
import {
  enabledAddonKeys,
  hasAddon,
  resolveAddonEntitlements,
  type AddonCatalogRow,
  type AddonInclusionRow,
  type OrganizationAddonRow,
} from "@/lib/addons/entitlements"

const NOW = Date.parse("2026-09-02T12:00:00.000Z")
const FUTURO = "2026-10-01T00:00:00.000Z"
const PASADO = "2026-08-01T00:00:00.000Z"

function resolver(opts: {
  plan?: string | null
  hasCustomPlan?: boolean
  catalog?: AddonCatalogRow[] | null
  inclusions?: AddonInclusionRow[] | null
  orgRows?: OrganizationAddonRow[] | null
}) {
  return resolveAddonEntitlements({
    now: NOW,
    plan: opts.plan ?? "PRO",
    hasCustomPlan: opts.hasCustomPlan ?? false,
    catalog: opts.catalog ?? null,
    inclusions: opts.inclusions ?? null,
    orgRows: opts.orgRows ?? null,
  })
}

/** Catálogo con un complemento gateando de verdad. */
function catalogoOn(key: string, price: number | null = 15000): AddonCatalogRow[] {
  return [{ addon_key: key, price_ars_monthly: price, active: true, enforcement: "ON" }]
}

describe("resolveAddonEntitlements — estado inerte", () => {
  it("sin ninguna fila, los 8 complementos quedan habilitados y sin cargo", () => {
    const map = resolver({})
    for (const key of ADDON_KEYS) {
      expect(map[key].enabled).toBe(true)
      expect(map[key].priceArsMonthly).toBe(0)
      expect(map[key].enforcement).toBe("OFF")
      expect(map[key].state).toBe("OFF")
    }
  })

  it("enforcement OFF deja pasar aunque la org no lo tenga contratado", () => {
    const map = resolver({
      catalog: [{ addon_key: "library", price_ars_monthly: 9000, active: true, enforcement: "OFF" }],
    })
    expect(map.library.enabled).toBe(true)
    expect(map.library.enabledOnlyByEnforcement).toBe(true)
  })

  it("enforcement SHADOW deja pasar pero marca a quién cortaría", () => {
    const map = resolver({
      catalog: [{ addon_key: "library", active: true, enforcement: "SHADOW" }],
    })
    expect(map.library.enabled).toBe(true)
    expect(map.library.enabledOnlyByEnforcement).toBe(true)
  })

  it("enforcement ON sin contratar corta", () => {
    const map = resolver({ catalog: catalogoOn("library") })
    expect(map.library.enabled).toBe(false)
    expect(map.library.enabledOnlyByEnforcement).toBe(false)
  })
})

describe("resolveAddonEntitlements — estados comerciales", () => {
  it("ACTIVE habilita y cobra el precio de catálogo", () => {
    const map = resolver({
      catalog: catalogoOn("library", 9000),
      orgRows: [{ addon_key: "library", status: "ACTIVE", billable_from: PASADO }],
    })
    expect(map.library.enabled).toBe(true)
    expect(map.library.state).toBe("ACTIVE")
    expect(map.library.priceArsMonthly).toBe(9000)
    expect(map.library.priceSource).toBe("CATALOG")
  })

  it("REQUESTED y PENDING_SETUP NO habilitan ni cobran", () => {
    for (const status of ["REQUESTED", "PENDING_SETUP"]) {
      const map = resolver({
        catalog: catalogoOn("wha_control", 20000),
        orgRows: [{ addon_key: "wha_control", status }],
      })
      expect(map.wha_control.enabled).toBe(false)
      expect(map.wha_control.priceArsMonthly).toBe(0)
      expect(map.wha_control.state).toBe(status)
    }
  })

  it("CANCELLED y DENIED no habilitan", () => {
    for (const status of ["CANCELLED", "DENIED"]) {
      const map = resolver({
        catalog: catalogoOn("library"),
        orgRows: [{ addon_key: "library", status }],
      })
      expect(map.library.enabled).toBe(false)
    }
  })

  it("SCHEDULED_CANCEL con fecha futura sigue habilitado: ya lo pagó", () => {
    const map = resolver({
      catalog: catalogoOn("library", 9000),
      orgRows: [
        {
          addon_key: "library",
          status: "SCHEDULED_CANCEL",
          cancel_effective_at: FUTURO,
          billable_from: PASADO,
        },
      ],
    })
    expect(map.library.enabled).toBe(true)
    expect(map.library.priceArsMonthly).toBe(9000)
  })

  it("SCHEDULED_CANCEL vencido ya no habilita", () => {
    const map = resolver({
      catalog: catalogoOn("library"),
      orgRows: [
        { addon_key: "library", status: "SCHEDULED_CANCEL", cancel_effective_at: PASADO },
      ],
    })
    expect(map.library.enabled).toBe(false)
  })
})

describe("resolveAddonEntitlements — incluido en el plan", () => {
  it("inclusión vigente habilita con precio 0 sin fila de la org", () => {
    const map = resolver({
      plan: "PRO",
      catalog: catalogoOn("emilia", 30000),
      inclusions: [{ addon_key: "emilia", plan_id: "PRO", included_until: FUTURO }],
    })
    expect(map.emilia.enabled).toBe(true)
    expect(map.emilia.state).toBe("INCLUDED")
    expect(map.emilia.priceArsMonthly).toBe(0)
    expect(map.emilia.priceSource).toBe("INCLUDED_IN_PLAN")
  })

  it("included_until null = incluido mientras siga en el plan", () => {
    const map = resolver({
      plan: "ENTERPRISE",
      catalog: catalogoOn("emilia", 30000),
      inclusions: [{ addon_key: "emilia", plan_id: "ENTERPRISE", included_until: null }],
    })
    expect(map.emilia.enabled).toBe(true)
    expect(map.emilia.priceArsMonthly).toBe(0)
  })

  it("NO cobra dos veces: incluido gana aunque además esté ACTIVE", () => {
    const map = resolver({
      plan: "PRO",
      catalog: catalogoOn("emilia", 30000),
      inclusions: [{ addon_key: "emilia", plan_id: "PRO", included_until: FUTURO }],
      orgRows: [
        {
          addon_key: "emilia",
          status: "ACTIVE",
          price_ars_monthly_snapshot: 30000,
          billable_from: PASADO,
        },
      ],
    })
    expect(map.emilia.enabled).toBe(true)
    expect(map.emilia.priceArsMonthly).toBe(0)
    expect(map.emilia.priceSource).toBe("INCLUDED_IN_PLAN")
  })

  it("inclusión vencida sin contratación: se apaga y NO auto-cobra", () => {
    const map = resolver({
      plan: "PRO",
      catalog: catalogoOn("emilia", 30000),
      inclusions: [{ addon_key: "emilia", plan_id: "PRO", included_until: PASADO }],
    })
    expect(map.emilia.enabled).toBe(false)
    expect(map.emilia.priceArsMonthly).toBe(0)
  })

  it("la inclusión de otro plan no aplica", () => {
    const map = resolver({
      plan: "PRO",
      catalog: catalogoOn("emilia"),
      inclusions: [{ addon_key: "emilia", plan_id: "ENTERPRISE", included_until: null }],
    })
    expect(map.emilia.enabled).toBe(false)
  })

  it("una org con custom plan matchea la inclusión CUSTOM, no la de su plan nominal", () => {
    const map = resolver({
      plan: "ENTERPRISE",
      hasCustomPlan: true,
      catalog: catalogoOn("emilia"),
      inclusions: [{ addon_key: "emilia", plan_id: "CUSTOM", included_until: null }],
    })
    expect(map.emilia.enabled).toBe(true)
    expect(map.emilia.priceSource).toBe("INCLUDED_IN_PLAN")
  })
})

describe("resolveAddonEntitlements — precio", () => {
  it("el snapshot congelado le gana al catálogo", () => {
    const map = resolver({
      catalog: catalogoOn("library", 20000),
      orgRows: [
        {
          addon_key: "library",
          status: "ACTIVE",
          price_ars_monthly_snapshot: 9000,
          billable_from: PASADO,
        },
      ],
    })
    expect(map.library.priceArsMonthly).toBe(9000)
    expect(map.library.priceSource).toBe("SNAPSHOT")
  })

  it("snapshot null cae al catálogo; catálogo null da 0 (bonificado)", () => {
    const sinCatalogo = resolver({
      catalog: [{ addon_key: "library", price_ars_monthly: null, active: true, enforcement: "ON" }],
      orgRows: [{ addon_key: "library", status: "ACTIVE", billable_from: PASADO }],
    })
    expect(sinCatalogo.library.priceArsMonthly).toBe(0)
    expect(sinCatalogo.library.priceSource).toBe("NONE")
  })

  it("PostgREST devuelve NUMERIC como string y se parsea igual", () => {
    const map = resolver({
      catalog: [
        { addon_key: "library", price_ars_monthly: "12345.00", active: true, enforcement: "ON" },
      ],
      orgRows: [{ addon_key: "library", status: "ACTIVE", billable_from: PASADO }],
    })
    expect(map.library.priceArsMonthly).toBe(12345)
  })
})

describe("resolveAddonEntitlements — robustez", () => {
  it("ignora claves desconocidas en DB sin romper", () => {
    const map = resolver({
      catalog: [
        { addon_key: "no_existe_en_codigo", price_ars_monthly: 1, active: true, enforcement: "ON" },
      ],
      orgRows: [{ addon_key: "tampoco_existe", status: "ACTIVE" }],
    })
    expect(Object.keys(map).sort()).toEqual([...ADDON_KEYS].sort())
  })

  it("un enforcement inválido se trata como OFF (no corta a nadie)", () => {
    const map = resolver({
      catalog: [{ addon_key: "library", active: true, enforcement: "BASURA" }],
    })
    expect(map.library.enforcement).toBe("OFF")
    expect(map.library.enabled).toBe(true)
  })

  it("un status desconocido no habilita", () => {
    const map = resolver({
      catalog: catalogoOn("library"),
      orgRows: [{ addon_key: "library", status: "LO_QUE_SEA" }],
    })
    expect(map.library.enabled).toBe(false)
  })
})

describe("hasAddon / enabledAddonKeys", () => {
  it("hasAddon sin mapa deja pasar: es facturación, no autorización", () => {
    expect(hasAddon(null, "library")).toBe(true)
    expect(hasAddon(undefined, "cerebro")).toBe(true)
  })

  it("hasAddon respeta el corte cuando el enforcement está ON", () => {
    const map = resolver({ catalog: catalogoOn("library") })
    expect(hasAddon(map, "library")).toBe(false)
    expect(hasAddon(map, "cerebro")).toBe(true)
  })

  it("enabledAddonKeys sin mapa devuelve todos", () => {
    expect(enabledAddonKeys(null).sort()).toEqual([...ADDON_KEYS].sort())
  })

  it("enabledAddonKeys excluye el que está cortado", () => {
    const map = resolver({ catalog: catalogoOn("library") })
    expect(enabledAddonKeys(map)).not.toContain("library")
  })
})

describe("resolveAddonEntitlements — precio de lista para la vitrina", () => {
  it("un complemento que la org NO tiene expone el precio de lista sin cobrarlo", () => {
    const map = resolver({ catalog: catalogoOn("library", 9000) })
    // Lo que se le cobra: nada, porque no lo contrató.
    expect(map.library.priceArsMonthly).toBe(0)
    expect(map.library.priceSource).toBe("NONE")
    // Lo que muestra la vitrina.
    expect(map.library.listPriceArsMonthly).toBe(9000)
  })

  it("sin precio cargado el de lista es null, que la vitrina lee como 'a consultar'", () => {
    const map = resolver({ catalog: catalogoOn("library", null) })
    expect(map.library.listPriceArsMonthly).toBeNull()
    expect(map.library.priceArsMonthly).toBe(0)
  })

  it("el precio de lista no pisa el snapshot congelado al contratar", () => {
    const map = resolver({
      catalog: catalogoOn("library", 12000),
      orgRows: [
        {
          addon_key: "library",
          status: "ACTIVE",
          price_ars_monthly_snapshot: 9000,
          billable_from: PASADO,
        },
      ],
    })
    expect(map.library.priceArsMonthly).toBe(9000)
    expect(map.library.priceSource).toBe("SNAPSHOT")
    expect(map.library.listPriceArsMonthly).toBe(12000)
  })

  it("sin fila de catálogo no hay precio de lista", () => {
    expect(resolver({}).library.listPriceArsMonthly).toBeNull()
  })
})
