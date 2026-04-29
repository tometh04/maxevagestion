import { paymentsSueltoPipeline } from "../../pipelines/payments-suelto"

const AGENCY_ID = "rosario-uuid"

const CSV_SAMPLE = `Código Operación,Monto,Moneda,Fecha Vencimiento,Fecha Pago,Dirección
OP-2026-001,500000,ARS,2026-04-15,2026-04-10,INCOME
OP-2026-002,300000,ARS,2026-05-15,,INCOME
OP-NOEXISTE,100000,ARS,2026-04-15,,INCOME
,200000,ARS,2026-04-15,,INCOME`

function mockSupabase(opts: { operationExists?: boolean; insertResult?: any } = {}) {
  return {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockImplementation(() => {
      // Simula que OP-NOEXISTE no existe en la agencia
      const calls = (mockSupabase as any)._calls ?? 0
      ;(mockSupabase as any)._calls = calls + 1
      return Promise.resolve({
        data: opts.operationExists ? { id: `op-id-${calls + 1}`, agency_id: AGENCY_ID } : null,
        error: null,
      })
    }),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: opts.insertResult ?? { id: "new-payment-id" },
      error: null,
    }),
  } as any
}

describe("paymentsSueltoPipeline", () => {
  beforeEach(() => {
    ;(mockSupabase as any)._calls = 0
  })

  it("inserta payments vinculados a operations existentes en la misma agencia", async () => {
    const supabase = mockSupabase({ operationExists: true })
    const result = await paymentsSueltoPipeline(
      supabase,
      CSV_SAMPLE,
      { agencyId: AGENCY_ID, exchangeRate: { mode: "manual_fixed", manualRate: 1450 } }
    )

    // 4 filas: 3 con file_code válido (todas matchean en este mock), 1 sin file_code
    expect(result.successRows).toBe(3)
    expect(result.errorRows).toBe(1)
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        agency_id: AGENCY_ID,
        amount: 500000,
        currency: "ARS",
        direction: "INCOME",
        status: "PAID", // tiene date_paid
      })
    )
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 300000,
        status: "PENDING", // sin date_paid
      })
    )
  })

  it("rechaza filas con operation no encontrada", async () => {
    const supabase = mockSupabase({ operationExists: false })
    const result = await paymentsSueltoPipeline(
      supabase,
      CSV_SAMPLE,
      { agencyId: AGENCY_ID, exchangeRate: { mode: "manual_fixed", manualRate: 1450 } }
    )

    expect(result.successRows).toBe(0)
    // 4 filas: 1 sin file_code (required error) + 3 con operation no encontrada (4 errors)
    expect(result.errorRows).toBeGreaterThanOrEqual(3)
    expect(supabase.insert).not.toHaveBeenCalled()
  })

  it("dry-run no inserta", async () => {
    const supabase = mockSupabase({ operationExists: true })
    const result = await paymentsSueltoPipeline(
      supabase,
      CSV_SAMPLE,
      { agencyId: AGENCY_ID, exchangeRate: { mode: "manual_fixed", manualRate: 1450 } },
      { dryRun: true }
    )

    expect(result.successRows).toBe(3)
    expect(supabase.insert).not.toHaveBeenCalled()
  })
})
