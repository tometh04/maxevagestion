/**
 * Crédito fiscal según la condición del operador (VIB-144).
 *
 * Hasta agosto 2026 el crédito fiscal de compras se calculaba asumiendo que
 * TODO operador discrimina IVA al 21%: `createPurchaseIVA` se llamaba sin tasa
 * y caía al default. Medido en producción: 2.554 registros, una sola alícuota
 * (0,21), $37.764.491 de crédito fiscal.
 *
 * Pero un monotributista no discrimina IVA, y un exento o un proveedor del
 * exterior tampoco. Computarles crédito fiscal lo infla y subestima el IVA a
 * pagar.
 *
 * La condición es OPT-IN: mientras un operador no la tenga cargada, el cálculo
 * se comporta exactamente como antes. Esa retrocompatibilidad es lo que hace
 * que la migración no cambie ningún número existente, y está fijada acá.
 */

import {
  getPurchaseIVARateForOperator,
  calculatePurchaseIVA,
  OPERATOR_IVA_CONDITION_LABELS,
  type OperatorIVACondition,
} from "../iva"

describe("getPurchaseIVARateForOperator", () => {
  it("Responsable Inscripto genera crédito fiscal al 21%", () => {
    expect(getPurchaseIVARateForOperator("RESPONSABLE_INSCRIPTO")).toBe(0.21)
  })

  it.each<OperatorIVACondition>(["MONOTRIBUTO", "EXENTO", "CONSUMIDOR_FINAL", "EXTERIOR"])(
    "%s no genera crédito fiscal",
    (condicion) => {
      expect(getPurchaseIVARateForOperator(condicion)).toBe(0)
    }
  )

  it("sin condición cargada mantiene el comportamiento histórico (21%)", () => {
    // Es la garantía de que la migración no cambia ningún número: hoy los 482
    // operadores tienen la condición en NULL.
    expect(getPurchaseIVARateForOperator(null)).toBe(0.21)
    expect(getPurchaseIVARateForOperator(undefined)).toBe(0.21)
  })

  it("un valor desconocido no rompe: cae al comportamiento histórico", () => {
    expect(getPurchaseIVARateForOperator("ALGO_RARO")).toBe(0.21)
  })

  it("toda condición tiene etiqueta para mostrar", () => {
    const condiciones: OperatorIVACondition[] = [
      "RESPONSABLE_INSCRIPTO",
      "MONOTRIBUTO",
      "EXENTO",
      "CONSUMIDOR_FINAL",
      "EXTERIOR",
    ]
    for (const c of condiciones) {
      expect(OPERATOR_IVA_CONDITION_LABELS[c]).toBeTruthy()
    }
  })
})

describe("efecto sobre el crédito fiscal calculado", () => {
  const costo = 121_000

  it("un Responsable Inscripto: el costo trae IVA incluido", () => {
    const r = calculatePurchaseIVA(costo, getPurchaseIVARateForOperator("RESPONSABLE_INSCRIPTO"))

    expect(r.iva_rate).toBe(0.21)
    expect(r.net_amount).toBe(100_000)
    expect(r.iva_amount).toBe(21_000)
  })

  it("un monotributista: el costo es todo neto, sin crédito fiscal", () => {
    const r = calculatePurchaseIVA(costo, getPurchaseIVARateForOperator("MONOTRIBUTO"))

    expect(r.iva_rate).toBe(0)
    expect(r.net_amount).toBe(costo)
    expect(r.iva_amount).toBe(0)
  })

  it("cargar la condición no cambia el costo total, solo cómo se reparte", () => {
    // El costo del operador es el mismo; lo que cambia es cuánto de eso es
    // crédito fiscal recuperable y cuánto es costo neto.
    const ri = calculatePurchaseIVA(costo, getPurchaseIVARateForOperator("RESPONSABLE_INSCRIPTO"))
    const mono = calculatePurchaseIVA(costo, getPurchaseIVARateForOperator("MONOTRIBUTO"))

    expect(ri.net_amount + ri.iva_amount).toBeCloseTo(costo, 2)
    expect(mono.net_amount + mono.iva_amount).toBeCloseTo(costo, 2)
  })
})
