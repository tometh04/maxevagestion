import { calculateARSEquivalent } from '../ledger'

describe('Ledger Service - calculateARSEquivalent', () => {
  describe('ARS currency', () => {
    it('should return the same amount for ARS currency', () => {
      const result = calculateARSEquivalent(1000, 'ARS')
      expect(result).toBe(1000)
    })

    it('should handle decimal amounts for ARS', () => {
      const result = calculateARSEquivalent(1234.56, 'ARS')
      expect(result).toBe(1234.56)
    })
  })

  describe('USD currency', () => {
    it('should convert USD to ARS using exchange rate', () => {
      const result = calculateARSEquivalent(100, 'USD', 1000)
      expect(result).toBe(100000)
    })

    it('should handle decimal exchange rates', () => {
      const result = calculateARSEquivalent(50, 'USD', 1234.56)
      expect(result).toBe(61728)
    })

    it('should throw error if exchange rate is missing for USD', () => {
      expect(() => {
        calculateARSEquivalent(100, 'USD')
      }).toThrow('exchange_rate es requerido para convertir USD a ARS')
    })

    it('should throw error if exchange rate is null for USD', () => {
      expect(() => {
        calculateARSEquivalent(100, 'USD', null)
      }).toThrow('exchange_rate es requerido para convertir USD a ARS')
    })
  })
})

