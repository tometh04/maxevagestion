import { z } from "zod"

const docTypeEnum = z.enum(["DNI", "PASAPORTE", "LC", "LE", "CI"])

// 2026-05-18 (Tomi, reportado por VICO): antes phone era required min(8)
// y first_name/last_name min(1) — pero en imports reales muchos clientes
// no tienen phone (sólo email, o sólo nombre). Tomi pidió "no me dejes
// nada como campo requerido a la hora de importar". Ahora TODO es opcional
// a nivel campo individual; la única defensa es a nivel fila vía superRefine:
// la fila debe tener AL MENOS un identificador (nombre, apellido, email,
// teléfono o documento) — sino sería una fila vacía sin sentido.
export const customersSchema = z.object({
  first_name: z.string().trim().optional().or(z.literal("")),
  last_name: z.string().trim().optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().email("formato inválido").optional().or(z.literal("")),
  document_type: docTypeEnum.optional().or(z.literal("")),
  document_number: z.string().trim().optional().or(z.literal("")),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "formato YYYY-MM-DD").optional().or(z.literal("")),
  nationality: z.string().trim().optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  const hasIdentifier =
    !!data.first_name?.trim() ||
    !!data.last_name?.trim() ||
    !!data.email?.trim() ||
    !!data.phone?.trim() ||
    !!data.document_number?.trim()
  if (!hasIdentifier) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "fila vacía: la fila debe tener al menos nombre, apellido, email, teléfono o documento",
      path: ["first_name"],
    })
  }
})

export type CustomersRow = z.infer<typeof customersSchema>

export const customersCsvHeaders = [
  "first_name", "last_name", "phone", "email",
  "document_type", "document_number", "date_of_birth", "nationality",
] as const

export function customersNaturalKey(row: CustomersRow): string {
  if (row.document_number && row.document_number !== "") return `doc:${row.document_number}`
  if (row.email && row.email !== "") return `email:${row.email}`
  // Fallback: nombre+apellido+phone aunque alguno sea vacío. Es menos preciso
  // que doc o email, pero suficiente para dedup dentro del mismo import.
  const first = row.first_name ?? ""
  const last = row.last_name ?? ""
  const phone = row.phone ?? ""
  return `nph:${first}|${last}|${phone}`
}
