import { resolvePlacement, CARD_VERTICAL_ROOM } from "../placement"

// Viewport chico a propósito: es donde el problema aparece. En una pantalla
// grande casi cualquier ubicación entra y la regla nunca se ejercita.
const viewport = { width: 1280, height: 631 }
const place = (rect: any, preferred: any = "bottom", align: any = "center") =>
  resolvePlacement({ preferred, align, rect, viewport })

describe("resolvePlacement", () => {
  it("respeta la preferencia cuando hay lugar", () => {
    // Elemento arriba de todo: abajo sobra espacio.
    const r = { top: 40, left: 200, width: 400, height: 60 }
    expect(place(r, "bottom").side).toBe("bottom")
  })

  it("voltea al opuesto si el preferido no entra", () => {
    // Pegado al fondo: abajo no hay lugar, arriba sí.
    const r = { top: 500, left: 200, width: 400, height: 60 }
    expect(place(r, "bottom").side).toBe("top")
  })

  it("manda al costado cuando no entra ni arriba ni abajo", () => {
    // El caso real que se reportó: la tarjeta "Montos" en el medio de un
    // diálogo, con poco aire de los dos lados.
    const r = { top: 150, left: 600, width: 420, height: 330 }
    const { side } = place(r, "top")
    expect(["left", "right"]).toContain(side)
  })

  it("elige el costado con más espacio", () => {
    const sinAireVertical = { top: 150, height: 330 }
    // Elemento sobre la derecha: queda más aire a la izquierda.
    expect(place({ ...sinAireVertical, left: 800, width: 420 }, "top").side).toBe("left")
    // Elemento sobre la izquierda: más aire a la derecha.
    expect(place({ ...sinAireVertical, left: 20, width: 420 }, "top").side).toBe("right")
  })

  it("centra el align al irse al costado", () => {
    const r = { top: 150, left: 600, width: 420, height: 330 }
    expect(place(r, "top", "start").align).toBe("center")
  })

  it("una preferencia lateral se respeta tal cual", () => {
    // Quien la puso ya sabía que arriba o abajo no servía.
    const r = { top: 40, left: 200, width: 400, height: 60 }
    expect(place(r, "left").side).toBe("left")
    expect(place(r, "right").side).toBe("right")
  })

  it("el umbral es el alto real de la tarjeta, no el del elemento", () => {
    // Un campo chico pegado al borde deja igual de poco lugar que una tarjeta
    // enorme: lo que decide es el aire, no el tamaño del ancla.
    const chicoAlBorde = { top: viewport.height - 40, left: 100, width: 200, height: 30 }
    expect(place(chicoAlBorde, "bottom").side).not.toBe("bottom")
  })

  it("no manda al costado si la tarjeta no entra a lo ancho", () => {
    // Caso real: la sección "Ruta del Viaje" ocupa casi todo el ancho del
    // diálogo. Mandarla al costado la dejaba mitad afuera de la pantalla.
    const anchoCompleto = { top: 240, left: 233, width: 812, height: 290 }
    const { side } = place(anchoCompleto, "bottom")
    expect(["left", "right"]).not.toContain(side)
  })

  // Rects medidos en el diálogo real de alta de operación, viewport 1280x631.
  // Son los pasos del final, que es donde la tarjeta se salía de la pantalla.
  describe("pasos reales del alta de operación", () => {
    const medidos = {
      monedas: { top: 159, left: 217, width: 408, height: 314 },
      montos: { top: 159, left: 641, width: 408, height: 314 },
      pasajeros: { top: 280, left: 234, width: 797, height: 72 },
      codigos: { top: 207, left: 217, width: 831, height: 218 },
      guardar: { top: 297, left: 921, width: 142, height: 36 },
    }

    it("ninguno queda fuera de la pantalla", () => {
      for (const [nombre, rect] of Object.entries(medidos)) {
        const { side } = place(rect, "bottom")
        const ancho = side === "left" ? rect.left : viewport.width - (rect.left + rect.width)
        // Al costado solo si de verdad entra; si no, se resuelve en vertical.
        if (side === "left" || side === "right") {
          expect([nombre, ancho >= 390]).toEqual([nombre, true])
        }
      }
    })

    it("'Venta y costo' se va al costado, que es el caso reportado", () => {
      // Ni arriba (159) ni abajo (158) entra la tarjeta, y a la izquierda
      // sobran 641px: ahí va.
      expect(place(medidos.montos, "bottom").side).toBe("left")
    })

    it("un campo que ocupa todo el ancho y no deja aire vertical se centra", () => {
      // Pasajeros y códigos no dejan 390px a ningún costado ni 320px arriba o
      // abajo. Elegir el lado "menos malo" los dejaba cortados contra el borde.
      expect(place(medidos.pasajeros, "bottom").side).toBe("center")
      expect(place(medidos.codigos, "bottom").side).toBe("center")
    })
  })

  describe("último recurso: centrar", () => {
    it("centra cuando no hay lugar en ninguno de los cuatro lados", () => {
      // Un elemento que ocupa casi toda la pantalla en un viewport bajo: es lo
      // que pasa con una sección de formulario dentro de un diálogo.
      const gigante = { top: 130, left: 190, width: 900, height: 320 }
      expect(place(gigante, "bottom").side).toBe("center")
      expect(place(gigante, "top").side).toBe("center")
    })

    it("una preferencia lateral explícita sigue mandando", () => {
      // Centrar es el último recurso, no un atajo: si el paso pidió un costado
      // es porque quien lo escribió ya sabía que arriba y abajo no servían.
      const gigante = { top: 130, left: 190, width: 900, height: 320 }
      expect(place(gigante, "left").side).toBe("left")
    })

    it("no centra si algún lado tiene lugar de verdad", () => {
      const chico = { top: 40, left: 200, width: 300, height: 60 }
      expect(place(chico, "bottom").side).toBe("bottom")
    })
  })

  it("justo en el umbral entra", () => {
    const r = { top: 10, left: 100, width: 200, height: viewport.height - 10 - CARD_VERTICAL_ROOM }
    expect(place(r, "bottom").side).toBe("bottom")
  })
})
