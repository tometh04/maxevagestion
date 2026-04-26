export const ORGS_PAGE_SIZE = 50

export const TAX_CATEGORIES = [
  { value: "RESPONSABLE_INSCRIPTO", label: "Responsable Inscripto" },
  { value: "MONOTRIBUTO", label: "Monotributo" },
  { value: "EXENTO", label: "Exento" },
  { value: "CONSUMIDOR_FINAL", label: "Consumidor Final" },
  { value: "NO_RESPONSABLE", label: "No Responsable" },
] as const

export type TaxCategory = (typeof TAX_CATEGORIES)[number]["value"]

export const ORG_SUBSCRIPTION_STATUSES = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "SUSPENDED",
  "PENDING_PAYMENT",
] as const

export const ORG_PLANS = ["STARTER", "PRO", "ENTERPRISE"] as const

export type ProfileCompletionFilter = "empty" | "partial" | "complete"
