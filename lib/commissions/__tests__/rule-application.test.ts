/**
 * @jest-environment node
 *
 * Arrastrar una regla de comisión a lo ya calculado.
 *
 * Lo que se fija acá es el alcance, que es donde está el riesgo: la ventana
 * tiene que salir de la regla y no de una fecha elegida aparte, porque un
 * recálculo que se pase de período le cambia el porcentaje a un mes que ya se
 * cerró. Y que lo que tiene plata atrás se cuente como intocable antes de
 * aplicar, no después.
 */
import {
  ruleApplicability,
  previewApplication,
} from "../rule-application"

const SANTI = "seller-santi"

describe("ruleApplicability", () => {
  it("una regla de vendedor con fecha de inicio alcanza desde esa fecha en adelante", () => {
    expect(
      ruleApplicability({ seller_id: SANTI, valid_from: "2026-08-01", valid_to: null })
    ).toEqual({ applicable: true, sellerId: SANTI, window: { from: "2026-08-01", to: null } })
  })

  it("respeta la fecha de fin cuando la regla tiene una", () => {
    const res = ruleApplicability({
      seller_id: SANTI,
      valid_from: "2026-08-01",
      valid_to: "2026-08-31",
    })
    expect(res).toEqual({
      applicable: true,
      sellerId: SANTI,
      window: { from: "2026-08-01", to: "2026-08-31" },
    })
  })

  it("recorta el timestamp: accrual_date es una fecha, no un instante", () => {
    const res = ruleApplicability({
      seller_id: SANTI,
      valid_from: "2026-08-01T00:00:00.000Z",
      valid_to: null,
    })
    expect(res).toEqual({
      applicable: true,
      sellerId: SANTI,
      window: { from: "2026-08-01", to: null },
    })
  })

  it("no arrastra la regla general de la organización", () => {
    // Alcanzaría a todos los que no tienen porcentaje propio, o sea a gente que
    // nadie nombró al tocar la regla.
    const res = ruleApplicability({ seller_id: null, valid_from: "2026-08-01", valid_to: null })
    expect(res.applicable).toBe(false)
  })

  it("sin fecha de inicio no hay período que recalcular", () => {
    expect(ruleApplicability({ seller_id: SANTI, valid_from: null, valid_to: null }).applicable).toBe(
      false
    )
  })

  it("rechaza una ventana invertida", () => {
    expect(
      ruleApplicability({
        seller_id: SANTI,
        valid_from: "2026-08-31",
        valid_to: "2026-08-01",
      }).applicable
    ).toBe(false)
  })
})

describe("previewApplication", () => {
  const pendiente = (percentage: number) => ({
    status: "PENDING",
    amount_paid: 0,
    settled_at: null,
    percentage,
  })

  it("cuenta cuántas se van a recalcular", () => {
    expect(previewApplication([pendiente(35), pendiente(35), pendiente(35)], 45)).toEqual({
      aRecalcular: 3,
      bloqueadas: 0,
      yaEnElPorcentaje: 0,
    })
  })

  it("no cuenta como recalculable una comisión ya pagada", () => {
    expect(
      previewApplication([{ status: "PAID", amount_paid: 100, settled_at: null, percentage: 35 }], 45)
    ).toEqual({ aRecalcular: 0, bloqueadas: 1, yaEnElPorcentaje: 0 })
  })

  it("un pago parcial también bloquea, aunque siga en PENDING", () => {
    // El registro queda PENDING con amount_paid > 0: recalcularlo cambiaría el
    // monto de algo que ya se cobró en parte.
    expect(
      previewApplication(
        [{ status: "PENDING", amount_paid: 50, settled_at: null, percentage: 35 }],
        45
      ).bloqueadas
    ).toBe(1)
  })

  it("una comisión saldada tampoco se toca", () => {
    expect(
      previewApplication(
        [{ status: "PENDING", amount_paid: 0, settled_at: "2026-07-31", percentage: 35 }],
        45
      ).bloqueadas
    ).toBe(1)
  })

  it("avisa cuántas ya estaban en el porcentaje nuevo", () => {
    // Sirve para que "23 comisiones" no asuste cuando en realidad 2 ya estaban
    // bien: son las que se cargaron después de cambiar la regla.
    expect(previewApplication([pendiente(45), pendiente(45), pendiente(35)], 45)).toEqual({
      aRecalcular: 3,
      bloqueadas: 0,
      yaEnElPorcentaje: 2,
    })
  })

  it("trata un status ausente como pendiente", () => {
    expect(previewApplication([{ percentage: 35 }], 45).aRecalcular).toBe(1)
  })

  it("sin comisiones en el período no hay nada que hacer", () => {
    expect(previewApplication([], 45)).toEqual({
      aRecalcular: 0,
      bloqueadas: 0,
      yaEnElPorcentaje: 0,
    })
  })
})
