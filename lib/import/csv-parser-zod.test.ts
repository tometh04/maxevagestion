import { parseCsv } from "./csv-parser-zod"
import { z } from "zod"

const testSchema = z.object({
  name: z.string().trim().min(1),
  age: z.coerce.number().int().positive(),
  email: z.string().email().optional().or(z.literal("")),
})
const testHeaders = ["name", "age", "email"] as const

describe("parseCsv", () => {
  it("parses valid CSV with exact headers", async () => {
    const csv = "name,age,email\nAlice,30,a@b.com\nBob,25,"
    const result = await parseCsv(csv, testSchema, testHeaders as any)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ rowNumber: 2, data: { name: "Alice", age: 30, email: "a@b.com" }, errors: [], warnings: [] })
    expect(result.rows[1].data).toEqual({ name: "Bob", age: 25, email: "" })
    expect(result.headerError).toBeNull()
  })

  it("returns headerError when headers don't match", async () => {
    const csv = "nombre,edad\nAlice,30"
    const result = await parseCsv(csv, testSchema, testHeaders as any)
    expect(result.headerError).toMatch(/headers/i)
    expect(result.rows).toHaveLength(0)
  })

  it("marks rows with validation errors", async () => {
    const csv = "name,age,email\n,abc,bademail"
    const result = await parseCsv(csv, testSchema, testHeaders as any)
    expect(result.rows[0].errors.length).toBeGreaterThan(0)
  })

  it("handles BOM correctly", async () => {
    const csv = "\uFEFFname,age,email\nAlice,30,"
    const result = await parseCsv(csv, testSchema, testHeaders as any)
    expect(result.headerError).toBeNull()
    expect(result.rows[0].data.name).toBe("Alice")
  })

  it("ignores empty lines", async () => {
    const csv = "name,age,email\nAlice,30,\n\nBob,25,"
    const result = await parseCsv(csv, testSchema, testHeaders as any)
    expect(result.rows).toHaveLength(2)
  })
})
