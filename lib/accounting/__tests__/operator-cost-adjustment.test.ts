/**
 * Ajuste de liquidación de operador — VIB-174.
 *
 * Los casos están escritos con los números del pedido original (hotel estimado
 * en 1.550, vendedor al 20%) para que cualquiera pueda verificarlos a mano y
 * señalar exactamente qué test está mal si discute un resultado.
 *
 * Convención de signos, que es donde se puede errar feo:
 *   delta  = actual − estimado   (>0 = el operador cobró más = PÉRDIDA)
 *   result = −delta              (>0 = GANANCIA para la agencia)
 *   la parte del vendedor es un AJUSTE DE COMISIÓN: negativo = devuelve.
 */
import {
  planOperatorCostAdjustment,
  toSellerSharesPayload,
  type OperatorCostAdjustmentInput,
} from "../operator-cost-adjustment"

const base: OperatorCostAdjustmentInput = {
  currentDebtAmount: 1550,
  paidAmount: 0,
  actualAmount: 1550,
  operationDate: "2026-03-10",
  baseConfig: null,
  splitWithSeller: true,
  commissions: [{ sellerId: "juan", sellerName: "Juan", percentage: 20, kind: "SELLER" }],
  referral: null,
}

describe("el caso del pedido: hotel estimado en 1.550, vendedor al 20%", () => {
  it("el hotel salió 1.600 → pérdida de 50: 40 la agencia, 10 los devuelve el vendedor", () => {
    const plan = planOperatorCostAdjustment({ ...base, actualAmount: 1600 })

    expect(plan.hasAdjustment).toBe(true)
    expect(plan.direction).toBe("LOSS")
    expect(plan.delta).toBe(50) // el costo subió 50
    expect(plan.result).toBe(-50) // la agencia perdió 50
    expect(plan.sellerShares).toEqual([
      { sellerId: "juan", sellerName: "Juan", percentage: 20, amount: -10 },
    ])
    expect(plan.agencyShare).toBe(-40)
  })

  it("el hotel salió 1.500 → ganancia de 50: 40 la agencia, 10 más para el vendedor", () => {
    const plan = planOperatorCostAdjustment({ ...base, actualAmount: 1500 })

    expect(plan.direction).toBe("GAIN")
    expect(plan.delta).toBe(-50)
    expect(plan.result).toBe(50)
    expect(plan.sellerShares[0].amount).toBe(10)
    expect(plan.agencyShare).toBe(40)
  })

  it("las partes siempre suman el resultado exacto", () => {
    for (const actual of [1600, 1500, 1587.33, 1234.56, 1550.01]) {
      const plan = planOperatorCostAdjustment({ ...base, actualAmount: actual })
      const suma =
        plan.sellerShares.reduce((s, x) => s + x.amount, 0) +
        plan.referrerShare +
        plan.agencyShare
      expect(Math.abs(suma - plan.result)).toBeLessThan(0.01)
    }
  })
})

describe("cuándo NO hay ajuste", () => {
  it("si el costo real coincide con la deuda, no hay nada que registrar", () => {
    const plan = planOperatorCostAdjustment({ ...base, actualAmount: 1550 })
    expect(plan.hasAdjustment).toBe(false)
    expect(plan.delta).toBe(0)
  })

  it("una diferencia de menos de un centavo no es un ajuste", () => {
    const plan = planOperatorCostAdjustment({ ...base, actualAmount: 1550.004 })
    expect(plan.hasAdjustment).toBe(false)
  })
})

describe("venta compartida", () => {
  it("cada vendedor ajusta por su propio porcentaje", () => {
    const plan = planOperatorCostAdjustment({
      ...base,
      actualAmount: 1650, // pérdida de 100
      commissions: [
        { sellerId: "a", percentage: 12, kind: "SELLER" },
        { sellerId: "b", percentage: 8, kind: "SELLER" },
      ],
    })

    expect(plan.result).toBe(-100)
    expect(plan.sellerShares.map((s) => s.amount)).toEqual([-12, -8])
    expect(plan.agencyShare).toBe(-80)
  })

  it("el administrador de asesores también participa: cobró sobre el mismo margen", () => {
    const plan = planOperatorCostAdjustment({
      ...base,
      actualAmount: 1650,
      commissions: [
        { sellerId: "vendedor", percentage: 20, kind: "SELLER" },
        { sellerId: "jefe", percentage: 5, kind: "ADVISOR_MANAGER" },
      ],
    })

    expect(plan.sellerShares.map((s) => s.amount)).toEqual([-20, -5])
    expect(plan.agencyShare).toBe(-75)
  })

  it("las comisiones de servicio y las de otros ajustes NO se vuelven a ajustar", () => {
    const plan = planOperatorCostAdjustment({
      ...base,
      actualAmount: 1650,
      commissions: [
        { sellerId: "vendedor", percentage: 20, kind: "SELLER" },
        { sellerId: "otro", percentage: 30, kind: "SERVICE" },
        { sellerId: "vendedor", percentage: 20, kind: "ADJUSTMENT" },
      ],
    })

    expect(plan.sellerShares).toHaveLength(1)
    expect(plan.agencyShare).toBe(-80)
  })
})

describe("base neta de IVA (VIB-95)", () => {
  // Si la agencia comisiona sobre la ganancia neta de IVA, el ajuste tiene que
  // usar la MISMA base: si no, se le descuenta al vendedor un porcentaje sobre
  // una base distinta de aquella con la que se le liquidó.
  const netConfig = { enabled: true, rate: 0.105, from: null }

  it("descuenta el IVA de la base antes de aplicar el porcentaje", () => {
    const plan = planOperatorCostAdjustment({
      ...base,
      actualAmount: 1650, // pérdida de 100
      baseConfig: netConfig,
    })

    // Base neta = −100 × (1 − 0,105) = −89,50 → 20% = −17,90
    expect(plan.ivaApplied).toBe(true)
    expect(plan.commissionBase).toBe(-89.5)
    expect(plan.sellerShares[0].amount).toBe(-17.9)
    expect(plan.agencyShare).toBe(-82.1)
  })

  it("con la perilla apagada usa la base bruta", () => {
    const plan = planOperatorCostAdjustment({
      ...base,
      actualAmount: 1650,
      baseConfig: { enabled: false, rate: 0.105, from: null },
    })

    expect(plan.ivaApplied).toBe(false)
    expect(plan.sellerShares[0].amount).toBe(-20)
  })

  it("respeta el corte por fecha: una operación anterior va con base bruta", () => {
    const plan = planOperatorCostAdjustment({
      ...base,
      actualAmount: 1650,
      operationDate: "2026-01-15",
      baseConfig: { enabled: true, rate: 0.105, from: "2026-06-01" },
    })

    expect(plan.ivaApplied).toBe(false)
    expect(plan.sellerShares[0].amount).toBe(-20)
  })
})

describe("cuando el resultado queda entero en la agencia", () => {
  it("la perilla de reparto apagada deja todo en la agencia y avisa", () => {
    const plan = planOperatorCostAdjustment({
      ...base,
      actualAmount: 1600,
      splitWithSeller: false,
    })

    expect(plan.sellerShares).toEqual([])
    expect(plan.agencyShare).toBe(-50)
    expect(plan.warnings.map((w) => w.code)).toContain("split_disabled")
  })

  it("una operación sin comisiones no reparte nada, y lo avisa", () => {
    const plan = planOperatorCostAdjustment({ ...base, actualAmount: 1600, commissions: [] })

    expect(plan.agencyShare).toBe(-50)
    expect(plan.warnings.map((w) => w.code)).toContain("no_commission")
  })

  it("un vendedor sin porcentaje no participa, y lo avisa", () => {
    const plan = planOperatorCostAdjustment({
      ...base,
      actualAmount: 1600,
      commissions: [{ sellerId: "x", percentage: null, kind: "SELLER" }],
    })

    expect(plan.sellerShares).toEqual([])
    expect(plan.agencyShare).toBe(-50)
    expect(plan.warnings.map((w) => w.code)).toContain("seller_without_percentage")
  })
})

describe("referidor", () => {
  it("si comisiona sobre el margen, se ajusta como el vendedor", () => {
    const plan = planOperatorCostAdjustment({
      ...base,
      actualAmount: 1600,
      referral: { percentage: 10, basis: "MARGIN" },
    })

    expect(plan.referrerShare).toBe(-5)
    expect(plan.agencyShare).toBe(-35) // −50 − (−10) − (−5)
  })

  it("si comisiona sobre la VENTA no se toca: la venta no cambió", () => {
    const plan = planOperatorCostAdjustment({
      ...base,
      actualAmount: 1600,
      referral: { percentage: 10, basis: "SALE" },
    })

    expect(plan.referrerShare).toBe(0)
    expect(plan.warnings.map((w) => w.code)).toContain("referrer_basis_sale")
  })
})

describe("guardas", () => {
  it("avisa si el costo real queda por debajo de lo ya pagado al operador", () => {
    const plan = planOperatorCostAdjustment({
      ...base,
      currentDebtAmount: 1550,
      paidAmount: 1400,
      actualAmount: 1200,
    })

    expect(plan.warnings.map((w) => w.code)).toContain("below_paid_amount")
  })

  it("el redondeo lo absorbe la agencia, nunca el vendedor", () => {
    // Pérdida de 33,33 al 15% → −4,9995 que redondea a −5,00.
    const plan = planOperatorCostAdjustment({
      ...base,
      actualAmount: 1583.33,
      commissions: [{ sellerId: "a", percentage: 15, kind: "SELLER" }],
    })

    expect(plan.sellerShares[0].amount).toBe(-5)
    expect(plan.agencyShare).toBe(-28.33)
    expect(plan.sellerShares[0].amount + plan.agencyShare).toBeCloseTo(plan.result, 2)
  })
})

describe("payload para la RPC", () => {
  it("manda seller_id, percentage y amount en snake_case", () => {
    const plan = planOperatorCostAdjustment({ ...base, actualAmount: 1600 })
    expect(toSellerSharesPayload(plan)).toEqual([
      { seller_id: "juan", percentage: 20, amount: -10 },
    ])
  })
})
