import { USAGE_ROLES, isUsageRole, usageRoleFor } from "../roles"

describe("usageRoleFor", () => {
  it("usa el rol primario cuando no hay nada mas", () => {
    expect(usageRoleFor({ role: "SELLER" })).toBe("SELLER")
    expect(usageRoleFor({ role: "CONTABLE" })).toBe("CONTABLE")
  })

  it("resuelve el multi-rol por alcance, no por el rol primario", () => {
    // El caso real del repo (`lib/reports/societario-access.ts`): un SELLER con
    // CONTABLE adicional ve contabilidad. Clasificarlo como SELLER escondería
    // justo a la persona mas interesante de la agencia.
    expect(
      usageRoleFor({ role: "SELLER", additional_roles: ["CONTABLE"] })
    ).toBe("CONTABLE")
    expect(
      usageRoleFor({ role: "ADMIN", additional_roles: ["SUPER_ADMIN"] })
    ).toBe("SUPER_ADMIN")
  })

  it("separa al asesor independiente del vendedor de la agencia", () => {
    // Tiene un techo de permisos duro: su perfil de uso es distinto y merece
    // ser un segmento propio.
    expect(usageRoleFor({ role: "SELLER", is_independent_advisor: true })).toBe(
      "SELLER_AVI"
    )
    expect(usageRoleFor({ role: "SELLER", is_independent_advisor: false })).toBe("SELLER")
  })

  it("el flag de AVI no achica a alguien con mas alcance", () => {
    expect(
      usageRoleFor({
        role: "SELLER",
        additional_roles: ["ADMIN"],
        is_independent_advisor: true,
      })
    ).toBe("ADMIN")
  })

  it("devuelve null cuando no hay rol, en vez de inventar uno", () => {
    expect(usageRoleFor({ role: null })).toBeNull()
    expect(usageRoleFor({})).toBeNull()
  })

  it("tolera roles desconocidos sin romper", () => {
    // Un rol nuevo en la DB sin deploy del front entra como null y no rompe el
    // insert del batch entero.
    expect(usageRoleFor({ role: "ROL_INVENTADO" as never })).toBeNull()
  })

  it("siempre cae dentro del catalogo", () => {
    for (const role of ["SUPER_ADMIN", "ORG_OWNER", "ADMIN", "CONTABLE", "POST_VENTA", "SELLER", "VIEWER"]) {
      const resolved = usageRoleFor({ role })
      expect(resolved).not.toBeNull()
      expect(isUsageRole(resolved!)).toBe(true)
    }
  })
})

describe("catalogo de roles de analitica", () => {
  it("no tiene duplicados", () => {
    expect(new Set(USAGE_ROLES).size).toBe(USAGE_ROLES.length)
  })

  it("isUsageRole rechaza lo que no esta", () => {
    expect(isUsageRole("SELLER_AVI")).toBe(true)
    expect(isUsageRole("PLATFORM_ADMIN")).toBe(false)
    expect(isUsageRole(null)).toBe(false)
  })
})
