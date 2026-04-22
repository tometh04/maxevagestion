import { z } from "zod"

export const agenciesSchema = z.object({
  name: z.string().trim().min(1, "requerido"),
  city: z.string().trim().min(1, "requerido"),
  timezone: z.string().trim().default("America/Argentina/Buenos_Aires"),
})

export type AgenciesRow = z.infer<typeof agenciesSchema>

export const agenciesCsvHeaders = ["name", "city", "timezone"] as const

export function agenciesNaturalKey(row: AgenciesRow): string {
  return row.name
}
