/**
 * Quién puede ver el Reporte Societario (VIB-101).
 *
 * El permiso `accounting.read` NO alcanza como gate: VIEWER lo tiene en `true`
 * (`lib/permissions.ts`) y este reporte expone el resultado del negocio y el
 * reparto entre socios. De ahí la lista explícita, que se aplica ADEMÁS del
 * permiso, nunca en su lugar.
 *
 * Sin imports server-only a propósito: la API (gate real) y la pestaña (gate
 * cosmético) tienen que leer la misma constante, o se separan con el tiempo.
 */

/** Dueños del negocio y quienes llevan su contabilidad. */
export const SOCIETARIO_ROLES = ["SUPER_ADMIN", "ORG_OWNER", "ADMIN", "CONTABLE"] as const

export interface SocietarioAccessUser {
  role?: string | null
  /** `role` + `additional_roles`, tal como lo arma `getCurrentUser()`. */
  roles?: readonly string[] | null
}

/**
 * Se miran TODOS los roles, no solo el primario: un usuario cargado como
 * SELLER con CONTABLE en `additional_roles` tiene que entrar, igual que en
 * `canPerformAction`.
 */
export function canViewSocietarioReport(
  user: SocietarioAccessUser | null | undefined
): boolean {
  if (!user) return false
  const roles = (user.roles?.length ? user.roles : [user.role]).filter(Boolean) as string[]
  return roles.some((r) => (SOCIETARIO_ROLES as readonly string[]).includes(r))
}
