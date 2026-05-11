export type StatusColors = {
  bg: string
  text: string
  border: string
}

export const QUOTATION_STATUS_COLORS: Record<string, StatusColors> = {
  DRAFT: { bg: "bg-muted", text: "text-foreground", border: "border-border" },
  SENT: { bg: "bg-primary/10", text: "text-primary", border: "border-primary/15" },
  PENDING_APPROVAL: { bg: "bg-accent-coral/10", text: "text-accent-coral", border: "border-accent-coral/15" },
  APPROVED: { bg: "bg-success/10", text: "text-success", border: "border-success/15" },
  REJECTED: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/15" },
  EXPIRED: { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" },
  CONVERTED: { bg: "bg-success/10", text: "text-success", border: "border-success/15" },
}

export const QUOTATION_ITEM_TYPE_COLORS: Record<string, StatusColors> = {
  FLIGHT: { bg: "bg-primary/5", text: "text-primary", border: "border-primary/20" },
  HOTEL: { bg: "bg-accent-coral/5", text: "text-accent-coral", border: "border-accent-coral/20" },
  ACCOMMODATION: { bg: "bg-accent-coral/5", text: "text-accent-coral", border: "border-accent-coral/20" },
  TRANSFER: { bg: "bg-success/5", text: "text-success", border: "border-success/20" },
  ASSISTANCE: { bg: "bg-accent-violet/5", text: "text-accent-violet", border: "border-accent-violet/20" },
  INSURANCE: { bg: "bg-accent-violet/5", text: "text-accent-violet", border: "border-accent-violet/20" },
  EXCURSION: { bg: "bg-destructive/5", text: "text-destructive", border: "border-destructive/20" },
  ACTIVITY: { bg: "bg-destructive/5", text: "text-destructive", border: "border-destructive/20" },
  VISA: { bg: "bg-primary/5", text: "text-primary", border: "border-primary/20" },
  OTHER: { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" },
}

const FALLBACK: StatusColors = {
  bg: "bg-muted",
  text: "text-muted-foreground",
  border: "border-border",
}

export function getQuotationStatusColors(status: string | null | undefined): StatusColors {
  if (!status) return FALLBACK
  return QUOTATION_STATUS_COLORS[status.toUpperCase()] ?? FALLBACK
}

export function getQuotationItemTypeColors(type: string | null | undefined): StatusColors {
  if (!type) return FALLBACK
  return QUOTATION_ITEM_TYPE_COLORS[type.toUpperCase()] ?? FALLBACK
}
