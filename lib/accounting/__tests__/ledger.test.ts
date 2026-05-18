import { calculateARSEquivalent, createLedgerMovement, type CreateLedgerMovementParams } from '../ledger'
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

const BASE_PARAMS: CreateLedgerMovementParams = {
  type: "INCOME",
  concept: "Test",
  currency: "ARS",
  amount_original: 1000,
  amount_ars_equivalent: 1000,
  method: "CASH",
  account_id: "account-1",
  org_id: "org-1",
}

describe('createLedgerMovement — idempotency_key', () => {
  it('returns existing id without inserting when key already exists', async () => {
    const mockMaybeSingle = jest.fn().mockResolvedValue({ data: { id: 'existing-ledger' }, error: null })
    const mockEq = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
    const mockFrom = jest.fn().mockReturnValue({ select: mockSelect })
    const mockSupabase = { from: mockFrom } as unknown as SupabaseClient<Database>

    const result = await createLedgerMovement(
      { ...BASE_PARAMS, idempotency_key: 'payment:uuid-1:INCOME' },
      mockSupabase
    )

    expect(result.id).toBe('existing-ledger')
    // Should NOT call insert — only the select check
    const allCalls: string[] = mockFrom.mock.calls.map((c: any[]) => c[0])
    expect(allCalls).not.toContain(expect.arrayContaining(['insert']))
  })

  it('inserts normally and passes key when no existing record', async () => {
    const mockSingleInsert = jest.fn().mockResolvedValue({ data: { id: 'new-ledger' }, error: null })
    const mockSelectAfterInsert = jest.fn().mockReturnValue({ single: mockSingleInsert })
    const mockInsert = jest.fn().mockReturnValue({ select: mockSelectAfterInsert })

    const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null })
    const mockEq = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })

    const mockFrom = jest.fn()
      .mockReturnValueOnce({ select: mockSelect })   // idempotency check
      .mockReturnValue({ insert: mockInsert })        // insert

    const mockSupabase = { from: mockFrom } as unknown as SupabaseClient<Database>

    const result = await createLedgerMovement(
      { ...BASE_PARAMS, idempotency_key: 'payment:uuid-2:INCOME' },
      mockSupabase
    )

    expect(result.id).toBe('new-ledger')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ idempotency_key: 'payment:uuid-2:INCOME' })
    )
  })

  it('resolves race condition (23505) by fetching winner', async () => {
    // First check: no record yet
    const mockCheckMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null })
    const mockCheckEq = jest.fn().mockReturnValue({ maybeSingle: mockCheckMaybeSingle })
    const mockCheckSelect = jest.fn().mockReturnValue({ eq: mockCheckEq })

    // Insert: fails with unique_violation
    const mockSingleInsert = jest.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint', details: '', hint: '' }
    })
    const mockSelectAfterInsert = jest.fn().mockReturnValue({ single: mockSingleInsert })
    const mockInsert = jest.fn().mockReturnValue({ select: mockSelectAfterInsert })

    // Fallback fetch after 23505
    const mockFallbackMaybeSingle = jest.fn().mockResolvedValue({ data: { id: 'race-winner' }, error: null })
    const mockFallbackEq = jest.fn().mockReturnValue({ maybeSingle: mockFallbackMaybeSingle })
    const mockFallbackSelect = jest.fn().mockReturnValue({ eq: mockFallbackEq })

    const mockFrom = jest.fn()
      .mockReturnValueOnce({ select: mockCheckSelect })    // idempotency check
      .mockReturnValueOnce({ insert: mockInsert })         // insert attempt
      .mockReturnValueOnce({ select: mockFallbackSelect }) // fallback after 23505

    const mockSupabase = { from: mockFrom } as unknown as SupabaseClient<Database>

    const result = await createLedgerMovement(
      { ...BASE_PARAMS, idempotency_key: 'payment:uuid-3:INCOME' },
      mockSupabase
    )

    expect(result.id).toBe('race-winner')
  })

  it('inserts null idempotency_key when none provided (legacy behavior)', async () => {
    const mockSingle = jest.fn().mockResolvedValue({ data: { id: 'legacy-ledger' }, error: null })
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle })
    const mockInsert = jest.fn().mockReturnValue({ select: mockSelect })
    const mockFrom = jest.fn().mockReturnValue({ insert: mockInsert })
    const mockSupabase = { from: mockFrom } as unknown as SupabaseClient<Database>

    const result = await createLedgerMovement(BASE_PARAMS, mockSupabase)

    expect(result.id).toBe('legacy-ledger')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ idempotency_key: null })
    )
  })
})

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

