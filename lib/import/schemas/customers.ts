import { z } from "zod"

const docTypeEnum = z.enum(["DNI", "PASAPORTE", "LC", "LE", "CI"])

export const customersSchema = z.object({
  first_name: z.string().trim().min(1, "requerido"),
  last_name: z.string().trim().min(1, "requerido"),
  phone: z.string().trim().min(8, "mínimo 8 caracteres"),
  email: z.string().email("formato inválido").optional().or(z.literal("")),
  document_type: docTypeEnum.optional().or(z.literal("")),
  document_number: z.string().trim().optional().or(z.literal("")),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "formato YYYY-MM-DD").optional().or(z.literal("")),
  nationality: z.string().trim().optional().or(z.literal("")),
})

export type CustomersRow = z.infer<typeof customersSchema>

export const customersCsvHeaders = [
  "first_name", "last_name", "phone", "email",
  "document_type", "document_number", "date_of_birth", "nationality",
] as const

export function customersNaturalKey(row: CustomersRow): string {
  if (row.document_number && row.document_number !== "") return `doc:${row.document_number}`
  if (row.email && row.email !== "") return `email:${row.email}`
  return `nph:${row.first_name}|${row.last_name}|${row.phone}`
}
