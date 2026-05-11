import { executeInsert, executeRollback } from "../executor"

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

  it("retorna { error } con detalle de Postgres si Supabase devuelve error", async () => {
    const supabase: any = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
    }
    const log: any[] = []
    const result = await executeInsert(supabase, "customers", {}, log)
    expect(result).toEqual({ error: "fail" })
    expect(log).toEqual([])
  })

  it("retorna { error } útil cuando data es null sin error explícito", async () => {
    const supabase: any = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }
    const log: any[] = []
    const result = await executeInsert(supabase, "customers", {}, log)
    expect(result).toHaveProperty("error")
    expect((result as { error: string }).error).toContain("RLS")
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

describe("executeRollback", () => {
  it("borra entries en orden inverso", async () => {
    const calls: Array<{ table: string; id: string }> = []
    const supabase: any = {
      from: jest.fn((table: string) => ({
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockImplementation((_col: string, id: string) => {
            calls.push({ table, id })
            return Promise.resolve({ error: null })
          }),
        }),
      })),
    }
    const entries = [
      { table: "customers", id: "c1" },
      { table: "operators", id: "o1" },
      { table: "operations", id: "op1" },
    ]
    const result = await executeRollback(supabase, entries)
    expect(result.deleted).toBe(3)
    expect(result.failed).toBe(0)
    // Inverso: operations primero, luego operators, luego customers
    expect(calls).toEqual([
      { table: "operations", id: "op1" },
      { table: "operators", id: "o1" },
      { table: "customers", id: "c1" },
    ])
  })

  it("reporta fallas sin tirar excepción", async () => {
    const supabase: any = {
      from: jest.fn(() => ({
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: { message: "RLS" } }),
        }),
      })),
    }
    const result = await executeRollback(supabase, [{ table: "customers", id: "c1" }])
    expect(result.deleted).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.failures[0]).toEqual({ table: "customers", id: "c1", error: "RLS" })
  })
})
