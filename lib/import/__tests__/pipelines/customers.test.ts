import { customersPipeline } from "../../pipelines/customers"
import * as fs from "fs"
import * as path from "path"

const AGENCY_ID = "rosario-uuid"

function mockSupabase(opts: { existing?: any; insertResult?: any } = {}) {
  return {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: opts.existing ?? null, error: null }),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: opts.insertResult ?? { id: "new-id" },
      error: null,
    }),
  } as any
}

describe("customersPipeline", () => {
  const csvContent = fs.readFileSync(
    path.join(__dirname, "../fixtures/customers-sample.csv"),
    "utf-8"
  )

  it("dry-run cuenta filas válidas e inválidas sin insertar", async () => {
    const supabase = mockSupabase()
    const result = await customersPipeline(
      supabase,
      csvContent,
      { agencyId: AGENCY_ID, exchangeRate: { mode: "manual_fixed", manualRate: 1450 } },
      { dryRun: true }
    )

    expect(result.totalRows).toBe(3)
    expect(result.successRows).toBe(2)
    expect(result.errorRows).toBe(1) // fila sin nombre
    expect(supabase.insert).not.toHaveBeenCalled()
  })

  it("ejecución real inserta filas válidas con agency_id", async () => {
    const supabase = mockSupabase({ existing: null, insertResult: { id: "x" } })
    const result = await customersPipeline(
      supabase,
      csvContent,
      { agencyId: AGENCY_ID, exchangeRate: { mode: "manual_fixed", manualRate: 1450 } }
    )

    expect(result.successRows).toBe(2)
    expect(supabase.insert).toHaveBeenCalledTimes(2)
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({ agency_id: AGENCY_ID })
    )
  })

  it("skipea customers que ya existen (dedupe)", async () => {
    const supabase = mockSupabase({ existing: { id: "existing-id" } })
    const result = await customersPipeline(
      supabase,
      csvContent,
      { agencyId: AGENCY_ID, exchangeRate: { mode: "manual_fixed", manualRate: 1450 } }
    )

    expect(result.successRows).toBe(0)
    expect(result.warningRows).toBe(2) // dos warnings de "ya existía"
    expect(supabase.insert).not.toHaveBeenCalled()
  })
})
