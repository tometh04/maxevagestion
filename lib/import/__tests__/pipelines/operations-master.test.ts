import { operationsMasterPipeline } from "../../pipelines/operations-master"
import * as fs from "fs"
import * as path from "path"

// Mock the exchange-rates module so the pipeline doesn't try to hit a real DB
jest.mock("@/lib/accounting/exchange-rates", () => ({
  getExchangeRate: jest.fn(),
}))

const AGENCY_ID = "rosario-uuid"

/**
 * Tracking mock: counts inserts by table and returns sequential IDs.
 * For maybeSingle (used by resolvers), returns null (= record doesn't exist, will be created).
 */
function trackingMockSupabase() {
  const inserted: Record<string, any[]> = {}

  const builder: any = {
    from: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
    ilike: jest.fn(),
    maybeSingle: jest.fn(),
    insert: jest.fn(),
    single: jest.fn(),
    _inserted: inserted,
  }

  let lastTable = ""
  let mode: "select" | "insert" = "select"

  builder.from.mockImplementation((table: string) => {
    lastTable = table
    mode = "select"
    return builder
  })
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.ilike.mockReturnValue(builder)

  // resolvers return null (record doesn't exist in this test)
  builder.maybeSingle.mockResolvedValue({ data: null, error: null })

  builder.insert.mockImplementation((data: any) => {
    mode = "insert"
    if (!inserted[lastTable]) inserted[lastTable] = []
    inserted[lastTable].push(data)
    return builder
  })

  builder.single.mockImplementation(() => {
    if (mode === "insert") {
      const t = lastTable
      const idx = inserted[t]?.length ?? 1
      return Promise.resolve({ data: { id: `${t}-${idx}` }, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  })

  return builder
}

describe("operationsMasterPipeline", () => {
  const csv = fs.readFileSync(
    path.join(__dirname, "../fixtures/rosario-sample-3rows.csv"),
    "utf-8"
  )

  it("crea cliente + operador + operación + payments por fila", async () => {
    const supabase = trackingMockSupabase()
    const result = await operationsMasterPipeline(
      supabase,
      csv,
      {
        agencyId: AGENCY_ID,
        exchangeRate: { mode: "manual_fixed", manualRate: 1450 },
      }
    )

    expect(result.totalRows).toBe(3)
    expect(result.successRows).toBe(3)
    expect(result.errorRows).toBe(0)

    // Customers (3 nuevos, todos con agency_id)
    expect(supabase._inserted.customers).toHaveLength(3)
    expect(supabase._inserted.customers[0].agency_id).toBe(AGENCY_ID)

    // Operadores (mock siempre dice null → todos se crean; 3 filas con 1 operador c/u = 3)
    expect(supabase._inserted.operators).toHaveLength(3)

    // Operations (3 con agency_id + operation_date)
    expect(supabase._inserted.operations).toHaveLength(3)
    expect(supabase._inserted.operations[0].agency_id).toBe(AGENCY_ID)
    expect(supabase._inserted.operations[0].operation_date).toBe("2026-02-15")

    // operation_customers + operation_operators
    expect(supabase._inserted.operation_customers).toHaveLength(3)
    expect(supabase._inserted.operation_operators).toHaveLength(3)

    // Payments: cada fila genera entre 2-4 payments
    // Fila 1: cobrado>0, pendiente>0, pagado>0, pendiente_op>0 → 4 payments
    // Fila 2: cobrado>0, pendiente=0, pagado>0, pendiente_op>0 → 3 payments
    // Fila 3: cobrado>0, pendiente>0, pagado>0, pendiente_op>0 → 4 payments
    // Total: 11 payments
    expect(supabase._inserted.payments).toHaveLength(11)
    expect(supabase._inserted.payments[0].agency_id).toBe(AGENCY_ID)
  })

  it("dry-run no inserta nada", async () => {
    const supabase = trackingMockSupabase()
    const result = await operationsMasterPipeline(
      supabase,
      csv,
      {
        agencyId: AGENCY_ID,
        exchangeRate: { mode: "manual_fixed", manualRate: 1450 },
      },
      { dryRun: true }
    )

    expect(result.successRows).toBe(3)
    expect(supabase._inserted.customers).toBeUndefined()
    expect(supabase._inserted.operations).toBeUndefined()
  })

  it("convierte USD→ARS al insertar operación", async () => {
    const supabase = trackingMockSupabase()
    await operationsMasterPipeline(
      supabase,
      csv,
      {
        agencyId: AGENCY_ID,
        exchangeRate: { mode: "manual_fixed", manualRate: 1450 },
      }
    )

    // Fila 1: 13680 USD * 1450 = 19,836,000 ARS
    expect(supabase._inserted.operations[0].sale_amount_total).toBe(19836000)
    expect(supabase._inserted.operations[0].currency).toBe("ARS")
  })
})
