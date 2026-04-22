import { z } from "zod"

const currencyEnum = z.enum(["ARS", "USD"])
const statusEnum = z.enum(["RESERVED", "CONFIRMED", "CLOSED", "CANCELLED"])

export const operationsSchema = z.object({
  file_code: z.string().trim().min(1, "requerido"),
  customer_document: z.string().trim().min(1, "requerido"),
  operator_name: z.string().trim().min(1, "requerido"),
  seller_email: z.string().email("formato inválido"),
  agency_name: z.string().trim().min(1, "requerido"),
  destination: z.string().trim().min(1, "requerido"),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "formato YYYY-MM-DD"),
  return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  adults: z.coerce.number().int().positive().default(1),
  children: z.coerce.number().int().min(0).default(0),
  sale_amount: z.coerce.number().positive("debe ser > 0"),
  operator_cost: z.coerce.number().positive("debe ser > 0"),
  currency: currencyEnum,
  status: statusEnum,
})

export type OperationsRow = z.infer<typeof operationsSchema>

export const operationsCsvHeaders = [
  "file_code", "customer_document", "operator_name", "seller_email", "agency_name",
  "destination", "departure_date", "return_date", "adults", "children",
  "sale_amount", "operator_cost", "currency", "status",
] as const

export function operationsNaturalKey(row: OperationsRow): string {
  return row.file_code
}
