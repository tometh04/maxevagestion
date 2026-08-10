import { resolveTourForPath, getTourById, tourCoversPath, TOUR_IDS, TOURS } from "../registry"
import { setupCuentaTour } from "../definitions/setup-cuenta"
import { operationsListTour } from "../definitions/operations-list"
import { operationDetailTour } from "../definitions/operation-detail"

describe("resolveTourForPath", () => {
  it("resuelve el detalle de operación por ruta dinámica", () => {
    expect(resolveTourForPath("/operations/abc-123")?.id).toBe("operation-detail")
  })

  it("distingue el listado de facturación del formulario de emisión", () => {
    // Dos guías distintas sobre rutas que se parecen. Si el desempate por
    // especificidad se rompiera, emitir una factura mostraría la guía del
    // listado — y al revés, el listado auto-dispararía la guía de emisión.
    expect(resolveTourForPath("/operations/billing")?.id).toBe("billing-afip")
    expect(resolveTourForPath("/operations/billing/new")?.id).toBe("billing-new")
  })

  it("el detalle de operación no se queda con la ruta de emisión", () => {
    // /operations/[id] tiene dos segmentos y la de emisión tres, pero el
    // exclude de billing es lo que evita que /operations/billing caiga en [id].
    expect(resolveTourForPath("/operations/billing/new")?.id).not.toBe("operation-detail")
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

describe("guías de formulario", () => {
  it("nunca son la guía de una pantalla", () => {
    // Comparten ruta con la guía de su pantalla (el diálogo no tiene URL
    // propia). Si compitieran, una podría auto-dispararse con sus anclas
    // dentro de un diálogo cerrado.
    for (const tour of TOURS.filter((t) => t.kind === "form")) {
      for (const pattern of tour.match) {
        expect(resolveTourForPath(pattern)?.id).not.toBe(tour.id)
      }
    }
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
