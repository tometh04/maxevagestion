import { resolveTourForPath, getTourById, tourCoversPath, TOUR_IDS, TOURS } from "../registry"
import { setupCuentaTour } from "../definitions/setup-cuenta"
import { operationsListTour } from "../definitions/operations-list"
import { operationDetailTour } from "../definitions/operation-detail"

describe("resolveTourForPath", () => {
  it("resuelve el detalle de operación por ruta dinámica", () => {
    expect(resolveTourForPath("/operations/abc-123")?.id).toBe("operation-detail")
  })

  it("normaliza el slash final", () => {
    expect(resolveTourForPath("/operations/abc-123/")?.id).toBe("operation-detail")
  })

  it("ignora la query string si viene pegada", () => {
    expect(resolveTourForPath("/operations/abc-123?tab=pagos")?.id).toBe("operation-detail")
  })

  it("no dispara el detalle en las subrutas estáticas de operaciones", () => {
    // /operations/[id] matchea estructuralmente estas rutas, pero son pantallas
    // distintas: sin el exclude, la guía de detalle saltaría en facturación.
    for (const path of [
      "/operations/new",
      "/operations/billing",
      "/operations/statistics",
      "/operations/check-ins",
      "/operations/settings",
    ]) {
      expect(resolveTourForPath(path)?.id).not.toBe("operation-detail")
    }
  })

  it("devuelve null para una ruta sin guía", () => {
    expect(resolveTourForPath("/no-existe")).toBeNull()
    expect(resolveTourForPath("/")).toBeNull()
  })

  it("no matchea rutas con distinta cantidad de segmentos", () => {
    expect(resolveTourForPath("/operations/abc/extra")?.id).not.toBe("operation-detail")
  })
})

describe("tourCoversPath", () => {
  // Sin esto la guía sigue al usuario a la pantalla siguiente y la tarjeta
  // queda apuntando a elementos que ya no están.
  it("deja de cubrir cuando el usuario se va de la pantalla", () => {
    expect(tourCoversPath(operationsListTour, "/operations")).toBe(true)
    expect(tourCoversPath(operationsListTour, "/operations/abc-123")).toBe(false)
    expect(tourCoversPath(operationsListTour, "/cash/summary")).toBe(false)
  })

  it("cubre las rutas a las que el propio tour navega", () => {
    // El setup arranca en /settings pero se lleva al usuario a crear la cuenta
    // financiera: esa ruta es parte de su recorrido aunque no lo dispare.
    expect(tourCoversPath(setupCuentaTour, "/settings")).toBe(true)
    expect(tourCoversPath(setupCuentaTour, "/accounting/financial-accounts")).toBe(true)
    expect(tourCoversPath(setupCuentaTour, "/operations")).toBe(false)
  })

  it("respeta exclude", () => {
    expect(tourCoversPath(operationDetailTour, "/operations/abc-123")).toBe(true)
    expect(tourCoversPath(operationDetailTour, "/operations/billing")).toBe(false)
  })
})

describe("getTourById", () => {
  it("encuentra cada tour registrado", () => {
    for (const id of TOUR_IDS) {
      expect(getTourById(id)?.id).toBe(id)
    }
  })

  it("devuelve null para un id desconocido", () => {
    expect(getTourById("no-existe")).toBeNull()
  })

  it("expone un TOUR_IDS consistente con TOURS", () => {
    expect(TOUR_IDS).toHaveLength(TOURS.length)
  })
})
