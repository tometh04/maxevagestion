import {
  PRODUCT_MODULES,
  isModuleKey,
  isTenantUsagePath,
  moduleFromPath,
} from "../modules"

describe("moduleFromPath", () => {
  it("resuelve los modulos principales del sidebar", () => {
    expect(moduleFromPath("/dashboard")).toBe("dashboard")
    expect(moduleFromPath("/sales/leads")).toBe("crm")
    expect(moduleFromPath("/sales/crm-manychat")).toBe("crm")
    expect(moduleFromPath("/customers")).toBe("customers")
    expect(moduleFromPath("/reports")).toBe("reports")
    expect(moduleFromPath("/tools/cerebro")).toBe("ai")
    expect(moduleFromPath("/accounting/ledger")).toBe("accounting")
  })

  it("da prioridad a la regla mas especifica", () => {
    // Si `/operations` ganara, facturar contaria como uso de operaciones y el
    // modulo de facturacion quedaria vacio para siempre.
    expect(moduleFromPath("/operations/billing")).toBe("invoicing")
    expect(moduleFromPath("/operations/billing/new")).toBe("invoicing")
    expect(moduleFromPath("/operations/abc-123")).toBe("operations")

    expect(moduleFromPath("/settings/commissions-monthly")).toBe("commissions")
    expect(moduleFromPath("/settings/users")).toBe("settings")

    expect(moduleFromPath("/sales/quotations")).toBe("quotations")
    expect(moduleFromPath("/sales")).toBe("crm")
  })

  it("no cuenta la consola de plataforma como uso de un tenant", () => {
    // Los platform admins tienen org_id de una agencia real: sin esta exclusion,
    // cada rato en /admin se contabiliza como si esa agencia trabajara.
    expect(moduleFromPath("/admin/orgs")).toBeNull()
    expect(moduleFromPath("/admin/usage")).toBeNull()
    expect(isTenantUsagePath("/admin")).toBe(false)
  })

  it("excluye auth, onboarding, paywall y las vistas publicas", () => {
    for (const path of [
      "/login",
      "/register",
      "/auth/reset-password",
      "/onboarding/billing",
      "/paywall",
      "/cotizacion/abc123",
    ]) {
      expect(moduleFromPath(path)).toBeNull()
    }
  })

  it("no confunde un prefijo compartido con el modulo", () => {
    // `/operations-legacy` no es `/operations`: el match es por limite de segmento.
    expect(moduleFromPath("/operations-legacy")).toBeNull()
  })

  it("cubre las rutas que antes caian en null", () => {
    // Estas ocho existen en el sidebar o son pantallas reales y no emitian
    // NINGUN evento porque no tenian regla.
    expect(moduleFromPath("/emilia")).toBe("messages")
    expect(moduleFromPath("/operators")).toBe("settings")
    expect(moduleFromPath("/operators/abc-123")).toBe("settings")
    expect(moduleFromPath("/tools/settings")).toBe("settings")
    expect(moduleFromPath("/notifications")).toBe("alerts")
    expect(moduleFromPath("/my/balance")).toBe("commissions")
    expect(moduleFromPath("/my/commissions")).toBe("commissions")
    expect(moduleFromPath("/my/commissions-monthly")).toBe("commissions")
  })

  it("distingue /commissions-monthly de /commissions", () => {
    // El match es por limite de segmento: `/commissions-monthly` NO matchea la
    // regla `/commissions`, asi que necesita la suya propia.
    expect(moduleFromPath("/commissions-monthly")).toBe("commissions")
    expect(moduleFromPath("/commissions")).toBe("commissions")
    expect(moduleFromPath("/commissions/objectives")).toBe("commissions")
  })

  it("no deja que /tools/settings caiga en las otras reglas de /tools", () => {
    expect(moduleFromPath("/tools/settings")).toBe("settings")
    expect(moduleFromPath("/tools/tasks")).toBe("tasks")
    expect(moduleFromPath("/tools/cerebro")).toBe("ai")
    expect(moduleFromPath("/tools/wha-control")).toBe("messages")
  })

  it("tolera trailing slash, vacio y rutas desconocidas", () => {
    expect(moduleFromPath("/reports/")).toBe("reports")
    expect(moduleFromPath("/")).toBe("dashboard")
    expect(moduleFromPath("")).toBeNull()
    expect(moduleFromPath(null)).toBeNull()
    expect(moduleFromPath("/ruta-que-no-existe")).toBeNull()
  })
})

describe("catalogo de modulos", () => {
  it("no tiene keys duplicadas", () => {
    const keys = PRODUCT_MODULES.map((m) => m.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("todo modulo al que apunta una ruta esta en el catalogo", () => {
    const paths = [
      "/dashboard",
      "/sales/leads",
      "/sales/quotations",
      "/operations",
      "/operations/billing",
      "/customers",
      "/payments",
      "/cash/summary",
      "/expenses",
      "/accounting/iva",
      "/commissions",
      "/referrals",
      "/reports",
      "/alerts",
      "/calendar",
      "/tools/tasks",
      "/tools/cerebro",
      "/messages",
      "/growth-studio",
      "/library",
      "/settings",
      "/ayuda",
    ]
    for (const path of paths) {
      const key = moduleFromPath(path)
      expect(key).not.toBeNull()
      expect(isModuleKey(key!)).toBe(true)
    }
  })

  it("isModuleKey rechaza cualquier cosa que no sea del catalogo", () => {
    expect(isModuleKey("operations")).toBe(true)
    expect(isModuleKey("ingestion")).toBe(false)
    expect(isModuleKey("")).toBe(false)
    expect(isModuleKey(null)).toBe(false)
  })
})
