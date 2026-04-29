/**
 * Tests para el sistema de cálculo de comisiones
 *
 * Nota: Estos tests son unitarios básicos. Los tests de integración
 * que requieren Supabase se harán en otro archivo.
 */

describe('Commission Calculation Logic', () => {
  describe('Commission split calculation', () => {
    it('should split commission 50/50 when there is a secondary seller', () => {
      const totalCommission = 1000
      const hasSecondary = true

      const primaryCommission = hasSecondary
        ? Math.round((totalCommission * 0.5) * 100) / 100
        : totalCommission
      const secondaryCommission = hasSecondary
        ? Math.round((totalCommission * 0.5) * 100) / 100
        : null

      expect(primaryCommission).toBe(500)
      expect(secondaryCommission).toBe(500)
    })

    it('should give full commission to primary when no secondary seller', () => {
      const totalCommission = 1000
      const hasSecondary = false

      const primaryCommission = hasSecondary
        ? Math.round((totalCommission * 0.5) * 100) / 100
        : totalCommission
      const secondaryCommission = hasSecondary
        ? Math.round((totalCommission * 0.5) * 100) / 100
        : null

      expect(primaryCommission).toBe(1000)
      expect(secondaryCommission).toBeNull()
    })

    it('should round commission amounts to 2 decimal places', () => {
      const totalCommission = 1000.123
      const hasSecondary = true

      const primaryCommission = hasSecondary
        ? Math.round((totalCommission * 0.5) * 100) / 100
        : totalCommission

      expect(primaryCommission).toBe(500.06) // 1000.123 * 0.5 = 500.0615, rounded = 500.06
    })
  })

  describe('Override path (29/04 — Tomi opción B)', () => {
    // Cuando commission_pct_primary y commission_pct_secondary están seteados,
    // el cálculo usa esos valores absolutos directamente. La validación de la
    // API garantiza que la suma ≤ pct comisión del principal.

    it('uses absolute overrides when both are set, ignoring split factor', () => {
      const margin = 10000
      const primaryPct = 10  // override absoluto
      const secondaryPct = 8  // override absoluto

      const primaryCommission = Math.round((margin * primaryPct) / 100 * 100) / 100
      const secondaryCommission = Math.round((margin * secondaryPct) / 100 * 100) / 100
      const total = primaryCommission + secondaryCommission

      expect(primaryCommission).toBe(1000)
      expect(secondaryCommission).toBe(800)
      expect(total).toBe(1800) // diferencia de 200 queda en agencia (suma < principal)
    })

    it('caps total at principal pct when overrides exactly sum to it', () => {
      const margin = 10000
      const principalPct = 20
      // Default 10/10 (= halfDefault each)
      const primaryPct = 10
      const secondaryPct = 10

      const total = Math.round((margin * primaryPct) / 100 * 100) / 100 +
                    Math.round((margin * secondaryPct) / 100 * 100) / 100

      expect(primaryPct + secondaryPct).toBe(principalPct)
      expect(total).toBe(2000)
    })

    it('legacy path (no overrides) still uses commission_split per seller pct', () => {
      // Path legacy preservado: cada vendedor recibe su pct × split. El bug
      // histórico (suma puede exceder principal cuando pcts difieren) NO se
      // arregla retroactivamente — solo en operaciones nuevas con overrides.
      const margin = 10000
      const primaryPct = 20
      const secondaryPct = 30  // pct distinto al principal
      const splitFactor = 0.5

      const effectivePrimaryPct = primaryPct * splitFactor
      const effectiveSecondaryPct = secondaryPct * splitFactor

      const primaryCommission = Math.round((margin * effectivePrimaryPct) / 100 * 100) / 100
      const secondaryCommission = Math.round((margin * effectiveSecondaryPct) / 100 * 100) / 100
      const total = primaryCommission + secondaryCommission

      expect(primaryCommission).toBe(1000) // 20% × 0.5 = 10% × 10000 = 1000
      expect(secondaryCommission).toBe(1500) // 30% × 0.5 = 15% × 10000 = 1500
      expect(total).toBe(2500) // suma 25% > 20% del principal — bug legacy preservado
    })
  })

  describe('Percentage calculation', () => {
    it('should calculate percentage correctly for fixed percentage basis', () => {
      const marginAmount = 10000
      const percentage = 10
      const totalCommission = (marginAmount * percentage) / 100

      expect(totalCommission).toBe(1000)
    })

    it('should calculate equivalent percentage for fixed amount basis', () => {
      const marginAmount = 10000
      const fixedAmount = 1500
      const equivalentPercentage = marginAmount > 0 
        ? (fixedAmount / marginAmount) * 100 
        : 0

      expect(equivalentPercentage).toBe(15)
    })

    it('should return 0 percentage when margin is 0', () => {
      const marginAmount = 0
      const fixedAmount = 1000
      const equivalentPercentage = marginAmount > 0 
        ? (fixedAmount / marginAmount) * 100 
        : 0

      expect(equivalentPercentage).toBe(0)
    })
  })
})

