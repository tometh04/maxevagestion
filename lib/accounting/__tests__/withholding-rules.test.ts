import {
  calculateWithholdings,
  DEFAULT_WITHHOLDING_RULES,
  type WithholdingRule,
  type CalculateWithholdingsParams,
} from "../withholding-rules"

describe("Withholding Rules - calculateWithholdings", () => {
  describe("with default rules", () => {
    it("should apply PERCEPCION_IVA (3%) for amounts >= 50,000", () => {
      const params: CalculateWithholdingsParams = {
        amount: 100_000,
        currency: "ARS",
        type: "OPERATOR_PAYMENT",
      }
      const results = calculateWithholdings(DEFAULT_WITHHOLDING_RULES, params)
      const percIva = results.find((r) => r.type === "PERCEPCION_IVA")

      expect(percIva).toBeDefined()
      expect(percIva!.amount).toBe(3000) // 100000 * 3 / 100
      expect(percIva!.rate).toBe(3)
    })

    it("should apply PERCEPCION_IIBB (2.5%) for amounts >= 10,000", () => {
      const params: CalculateWithholdingsParams = {
        amount: 100_000,
        currency: "ARS",
        type: "CUSTOMER_PAYMENT",
      }
      const results = calculateWithholdings(DEFAULT_WITHHOLDING_RULES, params)
      const percIIBB = results.find((r) => r.type === "PERCEPCION_IIBB")

      expect(percIIBB).toBeDefined()
      expect(percIIBB!.amount).toBe(2500) // 100000 * 2.5 / 100
    })

    it("should apply RETENCION_GANANCIAS (2%) only for OPERATOR_PAYMENT >= 100,000", () => {
      const params: CalculateWithholdingsParams = {
        amount: 200_000,
        currency: "ARS",
        type: "OPERATOR_PAYMENT",
      }
      const results = calculateWithholdings(DEFAULT_WITHHOLDING_RULES, params)
      const retGanancias = results.find((r) => r.type === "RETENCION_GANANCIAS")

      expect(retGanancias).toBeDefined()
      expect(retGanancias!.amount).toBe(4000) // 200000 * 2 / 100
    })

    it("should NOT apply RETENCION_GANANCIAS for CUSTOMER_PAYMENT", () => {
      const params: CalculateWithholdingsParams = {
        amount: 200_000,
        currency: "ARS",
        type: "CUSTOMER_PAYMENT",
      }
      const results = calculateWithholdings(DEFAULT_WITHHOLDING_RULES, params)
      const retGanancias = results.find((r) => r.type === "RETENCION_GANANCIAS")

      expect(retGanancias).toBeUndefined()
    })

    it("should NOT apply inactive rules (RETENCION_IVA, RETENCION_IIBB)", () => {
      const params: CalculateWithholdingsParams = {
        amount: 500_000,
        currency: "ARS",
        type: "OPERATOR_PAYMENT",
      }
      const results = calculateWithholdings(DEFAULT_WITHHOLDING_RULES, params)
      const retIva = results.find((r) => r.type === "RETENCION_IVA")
      const retIIBB = results.find((r) => r.type === "RETENCION_IIBB")

      expect(retIva).toBeUndefined()
      expect(retIIBB).toBeUndefined()
    })

    it("should return empty array for amounts below all thresholds", () => {
      const params: CalculateWithholdingsParams = {
        amount: 5_000,
        currency: "ARS",
        type: "CUSTOMER_PAYMENT",
      }
      const results = calculateWithholdings(DEFAULT_WITHHOLDING_RULES, params)

      expect(results).toHaveLength(0)
    })

    it("should return multiple applicable withholdings for large OPERATOR_PAYMENT", () => {
      const params: CalculateWithholdingsParams = {
        amount: 200_000,
        currency: "ARS",
        type: "OPERATOR_PAYMENT",
      }
      const results = calculateWithholdings(DEFAULT_WITHHOLDING_RULES, params)

      // Should include: PERCEPCION_IVA (3%), PERCEPCION_IIBB (2.5%), RETENCION_GANANCIAS (2%)
      expect(results.length).toBe(3)
      const types = results.map((r) => r.type)
      expect(types).toContain("PERCEPCION_IVA")
      expect(types).toContain("PERCEPCION_IIBB")
      expect(types).toContain("RETENCION_GANANCIAS")
    })
  })

  describe("minimum amount threshold", () => {
    it("should not apply rule when amount is below min_amount", () => {
      const params: CalculateWithholdingsParams = {
        amount: 49_999,
        currency: "ARS",
        type: "OPERATOR_PAYMENT",
      }
      const results = calculateWithholdings(DEFAULT_WITHHOLDING_RULES, params)
      const percIva = results.find((r) => r.type === "PERCEPCION_IVA")

      expect(percIva).toBeUndefined()
    })

    it("should apply rule when amount equals min_amount", () => {
      const params: CalculateWithholdingsParams = {
        amount: 50_000,
        currency: "ARS",
        type: "OPERATOR_PAYMENT",
      }
      const results = calculateWithholdings(DEFAULT_WITHHOLDING_RULES, params)
      const percIva = results.find((r) => r.type === "PERCEPCION_IVA")

      // 50000 is NOT < 50000, so rule applies
      expect(percIva).toBeDefined()
      expect(percIva!.amount).toBe(1500) // 50000 * 3%
    })
  })

  describe("exempt CUITs", () => {
    it("should skip rule for exempt CUIT", () => {
      const rules: WithholdingRule[] = [
        {
          type: "PERCEPCION_IVA",
          applies_to: "ALL",
          rate: 3,
          min_amount: 0,
          exempt_cuits: ["20-12345678-9"],
          is_active: true,
        },
      ]
      const params: CalculateWithholdingsParams = {
        amount: 100_000,
        currency: "ARS",
        type: "OPERATOR_PAYMENT",
        counterpart_cuit: "20-12345678-9",
      }
      const results = calculateWithholdings(rules, params)

      expect(results).toHaveLength(0)
    })

    it("should apply rule for non-exempt CUIT", () => {
      const rules: WithholdingRule[] = [
        {
          type: "PERCEPCION_IVA",
          applies_to: "ALL",
          rate: 3,
          min_amount: 0,
          exempt_cuits: ["20-12345678-9"],
          is_active: true,
        },
      ]
      const params: CalculateWithholdingsParams = {
        amount: 100_000,
        currency: "ARS",
        type: "OPERATOR_PAYMENT",
        counterpart_cuit: "30-99999999-0",
      }
      const results = calculateWithholdings(rules, params)

      expect(results).toHaveLength(1)
      expect(results[0].amount).toBe(3000)
    })

    it("should apply rule when no counterpart_cuit is provided even with exemptions", () => {
      const rules: WithholdingRule[] = [
        {
          type: "PERCEPCION_IVA",
          applies_to: "ALL",
          rate: 5,
          min_amount: 0,
          exempt_cuits: ["20-12345678-9"],
          is_active: true,
        },
      ]
      const params: CalculateWithholdingsParams = {
        amount: 10_000,
        currency: "ARS",
        type: "OPERATOR_PAYMENT",
        // no counterpart_cuit
      }
      const results = calculateWithholdings(rules, params)

      expect(results).toHaveLength(1)
    })
  })

  describe("custom rules", () => {
    it("should skip rules with 0 rate", () => {
      const rules: WithholdingRule[] = [
        {
          type: "RETENCION_IVA",
          applies_to: "ALL",
          rate: 0,
          min_amount: 0,
          exempt_cuits: [],
          is_active: true,
        },
      ]
      const results = calculateWithholdings(rules, {
        amount: 100_000,
        currency: "ARS",
        type: "OPERATOR_PAYMENT",
      })

      expect(results).toHaveLength(0)
    })

    it("should round amounts to 2 decimal places", () => {
      const rules: WithholdingRule[] = [
        {
          type: "PERCEPCION_IVA",
          applies_to: "ALL",
          rate: 3.33,
          min_amount: 0,
          exempt_cuits: [],
          is_active: true,
        },
      ]
      const results = calculateWithholdings(rules, {
        amount: 10_000,
        currency: "ARS",
        type: "CUSTOMER_PAYMENT",
      })

      expect(results[0].amount).toBe(333) // 10000 * 3.33 / 100 = 333.0
    })

    it("should handle empty rules array", () => {
      const results = calculateWithholdings([], {
        amount: 100_000,
        currency: "ARS",
        type: "OPERATOR_PAYMENT",
      })

      expect(results).toHaveLength(0)
    })
  })

  describe("applies_to filtering", () => {
    it("should apply ALL rules to both payment types", () => {
      const rules: WithholdingRule[] = [
        {
          type: "PERCEPCION_IVA",
          applies_to: "ALL",
          rate: 5,
          min_amount: 0,
          exempt_cuits: [],
          is_active: true,
        },
      ]

      const opResult = calculateWithholdings(rules, {
        amount: 10_000,
        currency: "ARS",
        type: "OPERATOR_PAYMENT",
      })
      const custResult = calculateWithholdings(rules, {
        amount: 10_000,
        currency: "ARS",
        type: "CUSTOMER_PAYMENT",
      })

      expect(opResult).toHaveLength(1)
      expect(custResult).toHaveLength(1)
    })

    it("should apply OPERATOR_PAYMENT rules only to operator payments", () => {
      const rules: WithholdingRule[] = [
        {
          type: "RETENCION_GANANCIAS",
          applies_to: "OPERATOR_PAYMENT",
          rate: 2,
          min_amount: 0,
          exempt_cuits: [],
          is_active: true,
        },
      ]

      const opResult = calculateWithholdings(rules, {
        amount: 10_000,
        currency: "ARS",
        type: "OPERATOR_PAYMENT",
      })
      const custResult = calculateWithholdings(rules, {
        amount: 10_000,
        currency: "ARS",
        type: "CUSTOMER_PAYMENT",
      })

      expect(opResult).toHaveLength(1)
      expect(custResult).toHaveLength(0)
    })
  })
})
