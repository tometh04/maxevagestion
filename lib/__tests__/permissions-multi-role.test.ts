import { mergeRolePermissions, getEffectiveAgencyScopeRole, shouldShowInSidebarMulti } from "@/lib/permissions"

describe("mergeRolePermissions", () => {
  it("rol único devuelve la misma matriz que PERMISSIONS[rol]", () => {
    const { mergeRolePermissions: merge, PERMISSIONS } = require("@/lib/permissions")
    expect(merge(["SELLER"])).toEqual(PERMISSIONS["SELLER"])
  })

  it("SELLER+CONTABLE: OR en read — leads accesible, accounting accesible", () => {
    const merged = mergeRolePermissions(["SELLER", "CONTABLE"])
    expect(merged.leads.read).toBe(true)       // SELLER tiene leads.read
    expect(merged.accounting.read).toBe(true)  // CONTABLE tiene accounting.read
    expect(merged.leads.write).toBe(true)      // SELLER tiene leads.write
  })

  it("SELLER+CONTABLE: ownDataOnly=false en leads (CONTABLE no tiene ownDataOnly → AND da false)", () => {
    const merged = mergeRolePermissions(["SELLER", "CONTABLE"])
    // SELLER tiene ownDataOnly=true, CONTABLE tiene ownDataOnly=undefined (falsy)
    // AND semántico: ownDataOnly=true SOLO si TODOS lo tienen → false
    expect(merged.leads.ownDataOnly).toBe(false)
  })

  it("SELLER+ADMIN: ownDataOnly=false en operations (ADMIN no tiene ownDataOnly)", () => {
    const merged = mergeRolePermissions(["SELLER", "ADMIN"])
    expect(merged.operations.ownDataOnly).toBe(false)
    expect(merged.operations.read).toBe(true)
    expect(merged.operations.write).toBe(true)
  })

  it("dos roles con ownDataOnly=true → ownDataOnly sigue siendo true", () => {
    // Ambos roles tienen ownDataOnly=true en leads
    const merged = mergeRolePermissions(["SELLER", "SELLER"])
    expect(merged.leads.ownDataOnly).toBe(true)
  })

  it("SUPER_ADMIN+SELLER: full access (OR, SUPER_ADMIN domina)", () => {
    const merged = mergeRolePermissions(["SUPER_ADMIN", "SELLER"])
    expect(merged.accounting.read).toBe(true)
    expect(merged.accounting.delete).toBe(true)
    expect(merged.leads.ownDataOnly).toBe(false)
  })

  it("array vacío devuelve permisos todos false", () => {
    const merged = mergeRolePermissions([])
    expect(merged.leads.read).toBe(false)
    expect(merged.accounting.write).toBe(false)
  })

  it("CONTABLE+POST_VENTA: OR de módulos distintos", () => {
    const merged = mergeRolePermissions(["CONTABLE", "POST_VENTA"])
    expect(merged.accounting.read).toBe(true)   // CONTABLE
    expect(merged.operations.write).toBe(true)  // POST_VENTA
    expect(merged.leads.read).toBe(false)       // ninguno tiene leads
  })
})

describe("getEffectiveAgencyScopeRole", () => {
  it("SELLER → SELLER", () => {
    expect(getEffectiveAgencyScopeRole(["SELLER"])).toBe("SELLER")
  })

  it("SELLER+CONTABLE → CONTABLE (mayor scope)", () => {
    expect(getEffectiveAgencyScopeRole(["SELLER", "CONTABLE"])).toBe("CONTABLE")
  })

  it("ADMIN+CONTABLE → CONTABLE (mayor scope)", () => {
    expect(getEffectiveAgencyScopeRole(["ADMIN", "CONTABLE"])).toBe("CONTABLE")
  })

  it("SUPER_ADMIN+cualquier cosa → SUPER_ADMIN", () => {
    expect(getEffectiveAgencyScopeRole(["VIEWER", "SUPER_ADMIN"])).toBe("SUPER_ADMIN")
  })

  it("array vacío → VIEWER (fallback más seguro)", () => {
    expect(getEffectiveAgencyScopeRole([])).toBe("VIEWER")
  })
})

describe("shouldShowInSidebarMulti", () => {
  it("SELLER ve leads, CONTABLE no ve leads → SELLER+CONTABLE sí ve leads", () => {
    expect(shouldShowInSidebarMulti(["SELLER", "CONTABLE"], "leads")).toBe(true)
  })

  it("ni SELLER ni CONTABLE ven settings → multi-rol no lo ve", () => {
    expect(shouldShowInSidebarMulti(["SELLER", "CONTABLE"], "settings")).toBe(false)
  })

  it("POST_VENTA ve settings → SELLER+POST_VENTA ve settings", () => {
    expect(shouldShowInSidebarMulti(["SELLER", "POST_VENTA"], "settings")).toBe(true)
  })
})
