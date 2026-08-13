/**
 * VIB-63 — AUTO vs MANUAL.
 *
 * Los dos casos que importan de verdad acá son el escenario exacto del bug
 * (venta compartida sin porcentajes en el body → el servidor calcula) y el que
 * lo haría reaparecer por otro lado (el formulario reenviando el snapshot y
 * congelando la operación para siempre).
 */

import { splitModeForCreate, splitModeForUpdate } from "@/lib/commissions/split-mode"

describe("splitModeForCreate", () => {
  it("una venta compartida sin porcentajes en el body queda en AUTO", () => {
    // El escenario del bug: la UI no mandaba porcentajes útiles y la venta
    // nacía sin comisión. Ahora la calcula el servidor.
    expect(
      splitModeForCreate({
        secondarySellerId: "santi",
        pctPrimary: undefined,
        pctSecondary: undefined,
      })
    ).toBe("AUTO")
  })

  it("un reparto explícito y completo queda en MANUAL", () => {
    expect(
      splitModeForCreate({ secondarySellerId: "santi", pctPrimary: 10, pctSecondary: 25 })
    ).toBe("MANUAL")
  })

  it("con un solo porcentaje cargado no congela nada", () => {
    // Congelar acá dejaría el otro porcentaje implícito en 0, que es
    // precisamente cómo se perdía la comisión.
    expect(
      splitModeForCreate({ secondarySellerId: "santi", pctPrimary: 10, pctSecondary: null })
    ).toBe("AUTO")
  })

  it("sin vendedor secundario no hay reparto que congelar", () => {
    expect(
      splitModeForCreate({ secondarySellerId: null, pctPrimary: 10, pctSecondary: 25 })
    ).toBe("AUTO")
  })

  it("un cero explícito en los dos sí es un reparto manual", () => {
    // Es una decisión rara pero deliberada del admin; el 0 accidental de la UI
    // ya no llega hasta acá porque el diálogo no manda nada si no se editó.
    expect(
      splitModeForCreate({ secondarySellerId: "santi", pctPrimary: 0, pctSecondary: 0 })
    ).toBe("MANUAL")
  })

  it("strings vacíos no cuentan como porcentaje cargado", () => {
    expect(
      splitModeForCreate({ secondarySellerId: "santi", pctPrimary: "", pctSecondary: "" })
    ).toBe("AUTO")
  })
})

describe("splitModeForUpdate", () => {
  it("reenviar el snapshot sin cambios NO congela la operación", () => {
    // Sin esto, editar la fecha o el destino de una venta compartida la dejaba
    // en MANUAL para siempre y nunca más se recalculaba.
    expect(
      splitModeForUpdate({
        secondaryRemoved: false,
        incomingPctPrimary: 10,
        incomingPctSecondary: 25,
        storedPctPrimary: 10,
        storedPctSecondary: 25,
      })
    ).toBeNull()
  })

  it("cambiar un porcentaje sí congela", () => {
    expect(
      splitModeForUpdate({
        secondaryRemoved: false,
        incomingPctPrimary: 12,
        incomingPctSecondary: 25,
        storedPctPrimary: 10,
        storedPctSecondary: 25,
      })
    ).toBe("MANUAL")
  })

  it("cargar porcentajes donde no había congela", () => {
    expect(
      splitModeForUpdate({
        secondaryRemoved: false,
        incomingPctPrimary: 10,
        incomingPctSecondary: 25,
        storedPctPrimary: null,
        storedPctSecondary: null,
      })
    ).toBe("MANUAL")
  })

  it("sacar el vendedor secundario vuelve a automático", () => {
    expect(
      splitModeForUpdate({
        secondaryRemoved: true,
        incomingPctPrimary: 10,
        incomingPctSecondary: 25,
        storedPctPrimary: 10,
        storedPctSecondary: 25,
      })
    ).toBe("AUTO")
  })

  it("un PATCH que no toca las comisiones no cambia el modo", () => {
    expect(
      splitModeForUpdate({
        secondaryRemoved: false,
        incomingPctPrimary: undefined,
        incomingPctSecondary: undefined,
        storedPctPrimary: 10,
        storedPctSecondary: 25,
      })
    ).toBeNull()
  })

  it("tolera diferencias de redondeo del formulario", () => {
    expect(
      splitModeForUpdate({
        secondaryRemoved: false,
        incomingPctPrimary: 6.5,
        incomingPctSecondary: 25,
        storedPctPrimary: "6.50",
        storedPctSecondary: "25.00",
      })
    ).toBeNull()
  })
})
