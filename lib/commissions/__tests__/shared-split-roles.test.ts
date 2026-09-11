import { canEditSharedSplit } from "@/lib/commissions/shared-split-roles"

/**
 * El caso que originó esto: el listado de Operaciones no le pasaba el rol al
 * diálogo, así que el gate comparaba contra `""` y los campos del reparto
 * salían deshabilitados para TODOS — mientras el detalle, que sí lo pasaba, los
 * habilitaba. Se leía como un problema de permisos de un usuario puntual.
 */
describe("canEditSharedSplit", () => {
  it("habilita a los roles que reparten comisión", () => {
    expect(canEditSharedSplit("SUPER_ADMIN")).toBe(true)
    expect(canEditSharedSplit("ADMIN")).toBe(true)
    expect(canEditSharedSplit("CONTABLE")).toBe(true)
  })

  it("incluye al dueño del tenant, que hereda los permisos de SUPER_ADMIN", () => {
    expect(canEditSharedSplit("ORG_OWNER")).toBe(true)
  })

  it("deja en solo lectura a quien no reparte", () => {
    expect(canEditSharedSplit("SELLER")).toBe(false)
    expect(canEditSharedSplit("VIEWER")).toBe(false)
    expect(canEditSharedSplit("POST_VENTA")).toBe(false)
  })

  it("sin rol no habilita (pero ya no es un estado alcanzable desde la UI)", () => {
    expect(canEditSharedSplit(null)).toBe(false)
    expect(canEditSharedSplit(undefined)).toBe(false)
  })
})
