import { roundMoney, formatCurrency } from "../currency"

describe("currency", () => {
  describe("roundMoney", () => {
    it("redondea a 2 decimales por defecto", () => {
      expect(roundMoney(1.234)).toBe(1.23)
      expect(roundMoney(100.999)).toBe(101)
    })
    it("maneja 0 y enteros", () => {
      expect(roundMoney(0)).toBe(0)
      expect(roundMoney(100)).toBe(100)
    })
    it("acepta decimals opcional", () => {
      expect(roundMoney(1.2345, 3)).toBe(1.235)
    })
  })

  describe("formatCurrency", () => {
    it("retorna string con monto formateado", () => {
      const s = formatCurrency(1234.5, "ARS")
      expect(typeof s).toBe("string")
      expect(s).toMatch(/\d/)
    })
  })
})
