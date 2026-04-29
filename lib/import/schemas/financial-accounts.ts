import { z } from "zod"

const typeEnum = z.enum(["CAJA", "BANCO", "TARJETA_CREDITO", "BILLETERA_VIRTUAL", "OTRO"])
const currencyEnum = z.enum(["ARS", "USD"])

export const financialAccountsSchema = z.object({
  name: z.string().trim().min(1, "requerido"),
  type: typeEnum,
  currency: currencyEnum,
  initial_balance: z.coerce.number().default(0),
  agency_name: z.string().trim().optional().or(z.literal("")),
  bank_name: z.string().trim().optional().or(z.literal("")),
  account_number: z.string().trim().optional().or(z.literal("")),
})

export type FinancialAccountsRow = z.infer<typeof financialAccountsSchema>

export const financialAccountsCsvHeaders = [
  "name", "type", "currency", "initial_balance",
  "agency_name", "bank_name", "account_number",
] as const

export function financialAccountsNaturalKey(row: FinancialAccountsRow): string {
  return row.name
}
