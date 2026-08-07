import { filterSteps, resolveVisibleSteps, rolesAllowTour } from "../filter"
import type { TourDefinition, TourFilterContext, TourStep } from "../types"
import { operationDetailTour } from "../definitions/operation-detail"

const allowAll: TourFilterContext = { isMobile: false, can: () => true }
const denyAll: TourFilterContext = { isMobile: false, can: () => false }

const steps: TourStep[] = [
  { id: "a", title: "A", body: "" },
  { id: "b", title: "B", body: "", requirePermission: { module: "accounting", permission: "read" } },
  { id: "c", title: "C", body: "", skipOnMobile: true },
  { id: "d", title: "D", body: "" },
]

describe("filterSteps", () => {
  it("no toca nada cuando todo aplica", () => {
    expect(filterSteps(steps, allowAll).map((s) => s.id)).toEqual(["a", "b", "c", "d"])
  })

  it("descarta pasos por permiso faltante", () => {
    expect(filterSteps(steps, denyAll).map((s) => s.id)).toEqual(["a", "c", "d"])
  })

  it("descarta pasos marcados skipOnMobile en mobile", () => {
    const ctx = { isMobile: true, can: () => true }
    expect(filterSteps(steps, ctx).map((s) => s.id)).toEqual(["a", "b", "d"])
  })

  it("preserva el orden original", () => {
    const ctx = { isMobile: true, can: () => false }
    expect(filterSteps(steps, ctx).map((s) => s.id)).toEqual(["a", "d"])
  })

  it("puede quedarse sin pasos", () => {
    const onlyGated: TourStep[] = [steps[1]]
    expect(filterSteps(onlyGated, denyAll)).toEqual([])
  })
})

describe("rolesAllowTour", () => {
  const gated = { requireRoles: ["ADMIN", "ORG_OWNER"] } as TourDefinition

  it("deja pasar cuando el tour no gatea por rol", () => {
    expect(rolesAllowTour({} as TourDefinition, ["SELLER"])).toBe(true)
  })

  it("alcanza con que uno de los roles del usuario aplique", () => {
    expect(rolesAllowTour(gated, ["SELLER", "ADMIN"])).toBe(true)
    expect(rolesAllowTour(gated, ["SELLER"])).toBe(false)
  })
})

describe("resolveVisibleSteps sobre el tour de detalle de operación", () => {
  it("un usuario sin acceso financiero no recibe los pasos de contabilidad ni pagos", () => {
    const visible = resolveVisibleSteps(operationDetailTour, ["SELLER"], {
      isMobile: false,
      can: (module) => module !== "accounting" && module !== "cash",
    })
    const ids = visible.map((s) => s.id)
    expect(ids).not.toContain("tab-accounting")
    expect(ids).not.toContain("tab-payments")
    expect(ids).toContain("tab-services")
  })

  it("un admin recibe todos los pasos", () => {
    const visible = resolveVisibleSteps(operationDetailTour, ["ADMIN"], allowAll)
    expect(visible).toHaveLength(operationDetailTour.steps.length)
  })
})
