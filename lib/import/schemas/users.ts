import { z } from "zod"

const userRoleEnum = z.enum(["SELLER", "ADMIN", "CONTABLE", "VIEWER"]) // no SUPER_ADMIN

export const usersSchema = z.object({
  email: z.string().email("formato inválido"),
  name: z.string().trim().min(1, "requerido"),
  role: userRoleEnum,
  agency_name: z.string().trim().optional().or(z.literal("")),
  commission_percentage: z.coerce.number().min(0).max(100).default(0),
})

export type UsersRow = z.infer<typeof usersSchema>

export const usersCsvHeaders = [
  "email", "name", "role", "agency_name", "commission_percentage",
] as const

export function usersNaturalKey(row: UsersRow): string {
  return row.email
}
