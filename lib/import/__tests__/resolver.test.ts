import {
  resolveCustomer,
  resolveOperator,
  resolveSeller,
  resolveOperationByFileCode,
} from "../resolver"

const AGENCY_ID = "rosario-uuid"

function mockSupabase(data: any) {
  const builder: any = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
    limit: jest.fn().mockReturnThis(),
  }
  return builder
}

describe("resolveCustomer", () => {
  it("matchea por document_number scopeado a agency_id", async () => {
    const supabase = mockSupabase({ id: "cust-123" })
    const result = await resolveCustomer(supabase as any, AGENCY_ID, {
      documentNumber: "12345678",
      email: undefined,
      name: undefined,
    })

    expect(result).toEqual({ id: "cust-123" })
    expect(supabase.from).toHaveBeenCalledWith("customers")
    expect(supabase.eq).toHaveBeenCalledWith("agency_id", AGENCY_ID)
    expect(supabase.eq).toHaveBeenCalledWith("document_number", "12345678")
  })

  it("matchea por email si no hay documento", async () => {
    const supabase = mockSupabase({ id: "cust-456" })
    const result = await resolveCustomer(supabase as any, AGENCY_ID, {
      email: "juan@test.com",
    })

    expect(result).toEqual({ id: "cust-456" })
    expect(supabase.eq).toHaveBeenCalledWith("email", "juan@test.com")
  })

  it("retorna null si no encuentra", async () => {
    const supabase = mockSupabase(null)
    const result = await resolveCustomer(supabase as any, AGENCY_ID, {
      email: "noexiste@test.com",
    })
    expect(result).toBeNull()
  })

  it("retorna null si no hay criterios de búsqueda", async () => {
    const supabase = mockSupabase(null)
    const result = await resolveCustomer(supabase as any, AGENCY_ID, {})
    expect(result).toBeNull()
  })
})

describe("resolveOperator", () => {
  it("matchea por nombre case-insensitive scopeado a agency", async () => {
    const supabase = mockSupabase({ id: "op-789" })
    const result = await resolveOperator(supabase as any, AGENCY_ID, "Despegar")

    expect(result).toEqual({ id: "op-789" })
    expect(supabase.from).toHaveBeenCalledWith("operators")
    expect(supabase.eq).toHaveBeenCalledWith("agency_id", AGENCY_ID)
    expect(supabase.ilike).toHaveBeenCalledWith("name", "Despegar")
  })
})

describe("resolveSeller", () => {
  it("matchea por email primero", async () => {
    const supabase = mockSupabase({ id: "user-1" })
    const result = await resolveSeller(supabase as any, AGENCY_ID, {
      email: "vendedor@test.com",
    })

    expect(result).toEqual({ id: "user-1" })
  })
})

describe("resolveOperationByFileCode", () => {
  it("matchea por file_code scopeado a agency", async () => {
    const supabase = mockSupabase({ id: "op-x", agency_id: AGENCY_ID })
    const result = await resolveOperationByFileCode(
      supabase as any,
      AGENCY_ID,
      "OP-2026-001"
    )

    expect(result).toEqual({ id: "op-x", agency_id: AGENCY_ID })
    expect(supabase.eq).toHaveBeenCalledWith("file_code", "OP-2026-001")
    expect(supabase.eq).toHaveBeenCalledWith("agency_id", AGENCY_ID)
  })
})
