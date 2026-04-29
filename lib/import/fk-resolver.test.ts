import { resolveFks, FkMapping } from "./fk-resolver"

// Mock supabase admin client
const mockFrom = jest.fn()
const mockAdmin = { from: mockFrom }

describe("resolveFks", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("resolves single FK by unique key within tenant", async () => {
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe("customers")
      return {
        select: () => ({
          eq: (_col1: string, _val1: string) => ({
            eq: (_col2: string, _val2: string) => ({
              maybeSingle: async () => ({ data: { id: "cust-1" }, error: null }),
            }),
          }),
        }),
      }
    })

    const mapping: FkMapping = {
      column: "customer_document",
      targetTable: "customers",
      targetColumn: "document_number",
      resolvedKey: "customer_id",
    }
    const rows = [{ customer_document: "12345678" }]
    const result = await resolveFks(mockAdmin as any, "org-1", rows, [mapping])

    expect(result[0].customer_id).toBe("cust-1")
    expect(result[0]._fkErrors).toEqual([])
  })

  it("marks row with _fkErrors when FK doesn't resolve", async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    }))

    const mapping: FkMapping = {
      column: "customer_document",
      targetTable: "customers",
      targetColumn: "document_number",
      resolvedKey: "customer_id",
    }
    const rows = [{ customer_document: "99999999" }]
    const result = await resolveFks(mockAdmin as any, "org-1", rows, [mapping])
    expect(result[0]._fkErrors?.[0]).toMatch(/no se encontró/i)
  })
})
