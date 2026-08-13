import { operatorsPipeline } from "../../pipelines/operators"

const AGENCY_ID = "rosario-uuid"

// La tercera fila solo trae "Límite Crédito" (no es identificador) → debe
// contar como error "fila vacía", no insertarse.
const CSV_SAMPLE = `Nombre,CUIT,Contacto,Email Contacto,Teléfono Contacto,Límite Crédito
Despegar,30-70838507-3,Juan García,contacto@despegar.com,+54 11 1234-5678,1000000
Booking,,María Pérez,maria@booking.com,+54 11 8765-4321,
,,,,,0`

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

describe("operatorsPipeline", () => {
  it("dry-run cuenta filas válidas e inválidas sin insertar", async () => {
    const supabase = mockSupabase()
    const result = await operatorsPipeline(
      supabase,
      CSV_SAMPLE,
      { agencyId: AGENCY_ID, exchangeRate: { mode: "manual_fixed", manualRate: 1450 } },
      { dryRun: true }
    )

    expect(result.totalRows).toBe(3)
    expect(result.successRows).toBe(2)
    expect(result.errorRows).toBe(1) // fila sin nombre
    expect(supabase.insert).not.toHaveBeenCalled()
  })

  it("ejecución real inserta operadores con agency_id y credit_limit parseado", async () => {
    const supabase = mockSupabase()
    const result = await operatorsPipeline(
      supabase,
      CSV_SAMPLE,
      { agencyId: AGENCY_ID, exchangeRate: { mode: "manual_fixed", manualRate: 1450 } }
    )

    expect(result.successRows).toBe(2)
    expect(supabase.insert).toHaveBeenCalledTimes(2)
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        agency_id: AGENCY_ID,
        name: "Despegar",
        cuit: "30-70838507-3",
        credit_limit: 1000000,
      })
    )
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        agency_id: AGENCY_ID,
        name: "Booking",
        cuit: null,
        credit_limit: null,
      })
    )
  })

  it("skipea operadores que ya existen (dedupe por nombre)", async () => {
    const supabase = mockSupabase({ existing: { id: "existing-id" } })
    const result = await operatorsPipeline(
      supabase,
      CSV_SAMPLE,
      { agencyId: AGENCY_ID, exchangeRate: { mode: "manual_fixed", manualRate: 1450 } }
    )

    expect(result.successRows).toBe(0)
    expect(result.warningRows).toBe(2)
    expect(supabase.insert).not.toHaveBeenCalled()
  })
})
