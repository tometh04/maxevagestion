import { cashMovementsPipeline } from "../../pipelines/cash-movements"

const AGENCY_ID = "rosario-uuid"

const CSV_SAMPLE = `Fecha,Tipo,Monto,Moneda,Cuenta,Categoría,Notas,Código Operación
2026-04-15,INCOME,500000,ARS,Caja Principal,SALE,Cobro Juan Pérez,OP-2026-001
2026-04-16,EXPENSE,200000,ARS,Caja Principal,OTHER,Pago varios,
2026-04-17,INVALID,100000,ARS,,,bad row,
,INCOME,300000,ARS,,,sin fecha,`

function mockSupabase(opts: { operationExists?: boolean } = {}) {
  return {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: opts.operationExists ? { id: "op-id-1", agency_id: AGENCY_ID } : null,
      error: null,
    }),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: { id: "new-cm-id" },
      error: null,
    }),
  } as any
}

describe("cashMovementsPipeline", () => {
  it("inserta movimientos válidos con agency_id", async () => {
    const supabase = mockSupabase({ operationExists: true })
    const result = await cashMovementsPipeline(
      supabase,
      CSV_SAMPLE,
      { agencyId: AGENCY_ID, exchangeRate: { mode: "manual_fixed", manualRate: 1450 }, userId: "test-user-id" }
    )

    expect(result.totalRows).toBe(4)
    expect(result.successRows).toBe(2) // INCOME y EXPENSE válidos
    expect(result.errorRows).toBe(2) // INVALID type + sin fecha
    expect(supabase.insert).toHaveBeenCalledTimes(2)
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        agency_id: AGENCY_ID,
        type: "INCOME",
        amount: 500000,
        currency: "ARS",
        operation_id: "op-id-1",
      })
    )
  })

  it("vincula operation_id si file_code coincide en la agencia", async () => {
    const supabase = mockSupabase({ operationExists: true })
    await cashMovementsPipeline(
      supabase,
      CSV_SAMPLE,
      { agencyId: AGENCY_ID, exchangeRate: { mode: "manual_fixed", manualRate: 1450 }, userId: "test-user-id" }
    )

    const calls = supabase.insert.mock.calls
    // First valid row has operation_file_code → operation_id set
    expect(calls[0][0].operation_id).toBe("op-id-1")
    // Second valid row has no operation_file_code → operation_id null
    expect(calls[1][0].operation_id).toBeNull()
  })

  it("dry-run no inserta", async () => {
    const supabase = mockSupabase({ operationExists: true })
    const result = await cashMovementsPipeline(
      supabase,
      CSV_SAMPLE,
      { agencyId: AGENCY_ID, exchangeRate: { mode: "manual_fixed", manualRate: 1450 }, userId: "test-user-id" },
      { dryRun: true }
    )

    expect(result.successRows).toBe(2)
    expect(supabase.insert).not.toHaveBeenCalled()
  })
})
