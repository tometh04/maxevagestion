import { z } from "zod"

const currencyEnum = z.enum(["ARS", "USD"])
const directionEnum = z.enum(["INCOME", "EXPENSE"])
const statusEnum = z.enum(["PENDING", "PAID", "CANCELLED"])
const methodEnum = z.enum(["CASH", "TRANSFER", "CARD", "OTHER"])

export const paymentsSchema = z.object({
  operation_file_code: z.string().trim().min(1, "requerido"),
  direction: directionEnum,
  amount: z.coerce.number().positive("debe ser > 0"),
  currency: currencyEnum,
  date_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "formato YYYY-MM-DD"),
  date_paid: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  status: statusEnum.optional().default("PENDING"),
  method: methodEnum.optional().or(z.literal("")),
  reference: z.string().trim().optional().or(z.literal("")),
})

export type PaymentsRow = z.infer<typeof paymentsSchema>

export const paymentsCsvHeaders = [
  "operation_file_code", "direction", "amount", "currency",
  "date_due", "date_paid", "status", "method", "reference",
] as const

export function paymentsNaturalKey(row: PaymentsRow): string {
  return `${row.operation_file_code}|${row.amount}|${row.date_due}|${row.direction}`
}
