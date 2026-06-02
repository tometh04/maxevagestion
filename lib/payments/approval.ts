export type ApprovalRule = {
  role: string
  max_amount_ars: number | null  // null = ilimitado
}

export function requiresApproval(
  amountArs: number,
  userRole: string,
  rules: ApprovalRule[],
): boolean {
  if (!rules || rules.length === 0) return false
  const rule = rules.find((r) => r.role === userRole)
  if (!rule) return false
  if (rule.max_amount_ars === null) return false
  return amountArs > rule.max_amount_ars
}

export function canApprove(
  amountArs: number,
  approverRole: string,
  rules: ApprovalRule[],
): boolean {
  // ADMIN y SUPER_ADMIN pueden aprobar cualquier monto, siempre
  if (approverRole === "ADMIN" || approverRole === "SUPER_ADMIN") return true
  if (!rules || rules.length === 0) return true
  const rule = rules.find((r) => r.role === approverRole)
  if (!rule) return true
  if (rule.max_amount_ars === null) return true
  return amountArs <= rule.max_amount_ars
}

export function convertToArs(
  amount: number,
  currency: "ARS" | "USD",
  arsPerUsd: number,
): number {
  return currency === "USD" ? amount * arsPerUsd : amount
}
