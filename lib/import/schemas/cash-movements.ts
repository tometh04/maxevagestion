import { z } from "zod"

const currencyEnum = z.enum(["ARS", "USD"])
const typeEnum = z.enum(["INCOME", "EXPENSE", "TRANSFER_IN", "TRANSFER_OUT"])

export const cashMovementsSchema = z.object({
  account_name: z.string().trim().min(1, "requerido"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "formato YYYY-MM-DD"),
  type: typeEnum,
  amount: z.coerce.number().positive("debe ser > 0"),
  currency: currencyEnum,
  category: z.string().trim().min(1, "requerido"),
  notes: z.string().trim().optional().or(z.literal("")),
})

export type CashMovementsRow = z.infer<typeof cashMovementsSchema>

export const cashMovementsCsvHeaders = [
  "account_name", "date", "type", "amount", "currency", "category", "notes",
] as const

export function cashMovementsNaturalKey(row: CashMovementsRow): string {
  return `${row.account_name}|${row.date}|${row.amount}|${row.type}|${row.notes ?? ""}`
}
