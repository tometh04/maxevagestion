import { z } from "zod"

export const operatorsSchema = z.object({
  name: z.string().trim().min(1, "requerido"),
  cuit: z.string().trim().optional().or(z.literal("")),
  contact_name: z.string().trim().optional().or(z.literal("")),
  contact_email: z.string().email("formato inválido").optional().or(z.literal("")),
  contact_phone: z.string().trim().optional().or(z.literal("")),
  credit_limit: z.coerce.number().default(0),
})

export type OperatorsRow = z.infer<typeof operatorsSchema>

export const operatorsCsvHeaders = [
  "name", "cuit", "contact_name", "contact_email", "contact_phone", "credit_limit",
] as const

export function operatorsNaturalKey(row: OperatorsRow): string {
  if (row.cuit && row.cuit !== "") return `cuit:${row.cuit}`
  return `name:${row.name}`
}
