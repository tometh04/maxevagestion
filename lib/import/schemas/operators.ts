import { z } from "zod"

// 2026-05-18 (Tomi): mismo patrón que customers, `name` ya no es required
// a nivel schema. Si la fila no trae nombre, el pipeline usa fallback
// "Sin nombre - fila N" (único por fila). Defensa de "fila no vacía con
// identificador" en superRefine.
export const operatorsSchema = z.object({
  name: z.string().trim().optional().or(z.literal("")),
  cuit: z.string().trim().optional().or(z.literal("")),
  contact_name: z.string().trim().optional().or(z.literal("")),
  contact_email: z.string().email("formato inválido").optional().or(z.literal("")),
  contact_phone: z.string().trim().optional().or(z.literal("")),
  credit_limit: z.coerce.number().default(0),
}).superRefine((data, ctx) => {
  const hasIdentifier =
    !!data.name?.trim() ||
    !!data.cuit?.trim() ||
    !!data.contact_name?.trim() ||
    !!data.contact_email?.trim() ||
    !!data.contact_phone?.trim()
  if (!hasIdentifier) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "fila vacía: necesita al menos nombre, CUIT, contacto, email o teléfono",
      path: ["name"],
    })
  }
})

export type OperatorsRow = z.infer<typeof operatorsSchema>

export const operatorsCsvHeaders = [
  "name", "cuit", "contact_name", "contact_email", "contact_phone", "credit_limit",
] as const

export function operatorsNaturalKey(row: OperatorsRow): string {
  if (row.cuit && row.cuit !== "") return `cuit:${row.cuit}`
  // Si tampoco hay name, el pipeline pondrá un fallback único por fila
  return `name:${row.name ?? ""}`
}
