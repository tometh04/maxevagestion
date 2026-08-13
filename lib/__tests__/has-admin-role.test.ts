import { hasAdminRole } from "../permissions"

describe("hasAdminRole", () => {
  it("acepta los tres roles de administración del tenant", () => {
    expect(hasAdminRole("SUPER_ADMIN")).toBe(true)
    expect(hasAdminRole("ADMIN")).toBe(true)
    // El agujero que motivó el helper: ORG_OWNER es el dueño del tenant y tiene
    // los mismos permisos que SUPER_ADMIN, pero los chequeos literales contra
    // "ADMIN"/"SUPER_ADMIN" lo dejaban afuera de su propia configuración.
    expect(hasAdminRole("ORG_OWNER")).toBe(true)
  })

  it("rechaza los roles operativos", () => {
    expect(hasAdminRole("SELLER")).toBe(false)
    expect(hasAdminRole("CONTABLE")).toBe(false)
    expect(hasAdminRole("VIEWER")).toBe(false)
    expect(hasAdminRole("POST_VENTA")).toBe(false)
  })

  // El segundo agujero: mirar solo user.role e ignorar additional_roles.
  it("considera el rol adicional, no solo el principal", () => {
    expect(hasAdminRole(["SELLER", "ADMIN"])).toBe(true)
    expect(hasAdminRole(["CONTABLE", "ORG_OWNER"])).toBe(true)
  })

  it("rechaza cuando ningún rol de la lista es de administración", () => {
    expect(hasAdminRole(["SELLER", "POST_VENTA"])).toBe(false)
  })

  it("tolera ausencia de roles sin romper ni abrir el acceso", () => {
    expect(hasAdminRole(null)).toBe(false)
    expect(hasAdminRole(undefined)).toBe(false)
    expect(hasAdminRole([])).toBe(false)
    expect(hasAdminRole("")).toBe(false)
  })

  it("no se deja engañar por un rol inventado", () => {
    expect(hasAdminRole("ADMINISTRADOR")).toBe(false)
    expect(hasAdminRole("admin")).toBe(false) // case-sensitive a propósito
  })
})
