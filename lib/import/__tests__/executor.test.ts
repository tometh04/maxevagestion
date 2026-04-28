import { executeInsert } from "../executor"

describe("executeInsert", () => {
  it("inserta y agrega entrada al rollback log", async () => {
    const supabase: any = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: "new-id" }, error: null }),
    }
    const log: any[] = []

    const result = await executeInsert(supabase, "customers", { name: "X", agency_id: "a1" }, log)

    expect(result).toEqual({ id: "new-id" })
    expect(supabase.from).toHaveBeenCalledWith("customers")
    expect(supabase.insert).toHaveBeenCalledWith({ name: "X", agency_id: "a1" })
    expect(log).toEqual([{ table: "customers", id: "new-id" }])
  })

  it("retorna null si Supabase devuelve error", async () => {
    const supabase: any = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
    }
    const log: any[] = []
    const result = await executeInsert(supabase, "customers", {}, log)
    expect(result).toBeNull()
    expect(log).toEqual([])
  })

  it("acumula múltiples entries en el log", async () => {
    let counter = 0
    const supabase: any = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockImplementation(() => Promise.resolve({ data: { id: `id-${++counter}` }, error: null })),
    }
    const log: any[] = []
    await executeInsert(supabase, "customers", {}, log)
    await executeInsert(supabase, "operators", {}, log)
    await executeInsert(supabase, "payments", {}, log)

    expect(log).toEqual([
      { table: "customers", id: "id-1" },
      { table: "operators", id: "id-2" },
      { table: "payments", id: "id-3" },
    ])
  })
})
