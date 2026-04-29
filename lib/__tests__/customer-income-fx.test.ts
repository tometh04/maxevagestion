import {
  calculateAmountInSaleCurrency,
  coercePositiveNumber,
  getCustomerIncomeReferenceCurrency,
  getOperationSaleCurrency,
  normalizeSupportedCurrency,
  requiresCustomerIncomeExchangeRate,
} from "../payments/customer-income-fx"

describe("customer-income-fx helpers", () => {
  describe("normalizeSupportedCurrency", () => {
    it("returns ARS when ARS is provided", () => {
      expect(normalizeSupportedCurrency("ARS")).toBe("ARS")
    })

    it("falls back to USD for undefined values", () => {
      expect(normalizeSupportedCurrency(undefined)).toBe("USD")
    })
  })

  describe("getOperationSaleCurrency", () => {
    it("prioritizes sale_currency over legacy currency", () => {
      expect(getOperationSaleCurrency({ sale_currency: "ARS", currency: "USD" })).toBe("ARS")
    })

    it("falls back to legacy currency", () => {
      expect(getOperationSaleCurrency({ currency: "ARS" })).toBe("ARS")
    })
  })

  describe("getCustomerIncomeReferenceCurrency", () => {
    it("prioritizes the service sale currency over the operation currency", () => {
      expect(
        getCustomerIncomeReferenceCurrency({
          operation: { sale_currency: "USD" },
          service: { sale_currency: "ARS" },
        })
      ).toBe("ARS")
    })

    it("falls back to the operation sale currency when there is no service", () => {
      expect(
        getCustomerIncomeReferenceCurrency({
          operation: { sale_currency: "ARS" },
          service: null,
        })
      ).toBe("ARS")
    })
  })

  describe("coercePositiveNumber", () => {
    it("returns null for missing values", () => {
      expect(coercePositiveNumber(null)).toBeNull()
      expect(coercePositiveNumber(undefined)).toBeNull()
      expect(coercePositiveNumber("")).toBeNull()
    })

    it("returns null for non-positive values", () => {
      expect(coercePositiveNumber(0)).toBeNull()
      expect(coercePositiveNumber(-10)).toBeNull()
      expect(coercePositiveNumber("abc")).toBeNull()
    })

    it("parses positive numeric values", () => {
      expect(coercePositiveNumber("1350.5")).toBe(1350.5)
    })
  })

  describe("requiresCustomerIncomeExchangeRate", () => {
    it("requires exchange rate for customer income when currencies differ", () => {
      expect(
        requiresCustomerIncomeExchangeRate({
          payerType: "CUSTOMER",
          direction: "INCOME",
          paymentCurrency: "USD",
          saleCurrency: "ARS",
        })
      ).toBe(true)
    })

    it("does not require exchange rate when currencies match", () => {
      expect(
        requiresCustomerIncomeExchangeRate({
          payerType: "CUSTOMER",
          direction: "INCOME",
          paymentCurrency: "USD",
          saleCurrency: "USD",
        })
      ).toBe(false)
    })

    it("does not apply to non-customer-income flows", () => {
      expect(
        requiresCustomerIncomeExchangeRate({
          payerType: "OPERATOR",
          direction: "EXPENSE",
          paymentCurrency: "USD",
          saleCurrency: "ARS",
        })
      ).toBe(false)
    })

    it("requires exchange rate when a service in ARS is charged in USD even inside a USD operation", () => {
      const saleCurrency = getCustomerIncomeReferenceCurrency({
        operation: { sale_currency: "USD" },
        service: { sale_currency: "ARS" },
      })

      expect(
        requiresCustomerIncomeExchangeRate({
          payerType: "CUSTOMER",
          direction: "INCOME",
          paymentCurrency: "USD",
          saleCurrency,
        })
      ).toBe(true)
    })
  })

  describe("calculateAmountInSaleCurrency", () => {
    it("converts USD payments into ARS sale currency", () => {
      expect(
        calculateAmountInSaleCurrency({
          paymentCurrency: "USD",
          saleCurrency: "ARS",
          amount: 100,
          exchangeRate: 1300,
        })
      ).toBe(130000)
    })

    it("converts ARS payments into USD sale currency", () => {
      expect(
        calculateAmountInSaleCurrency({
          paymentCurrency: "ARS",
          saleCurrency: "USD",
          amount: 130000,
          exchangeRate: 1300,
        })
      ).toBe(100)
    })

    it("returns null when a cross-currency conversion has no exchange rate", () => {
      expect(
        calculateAmountInSaleCurrency({
          paymentCurrency: "USD",
          saleCurrency: "ARS",
          amount: 100,
          exchangeRate: null,
        })
      ).toBeNull()
    })
  })
})
