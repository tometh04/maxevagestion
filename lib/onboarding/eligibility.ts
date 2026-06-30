// Decide si a un usuario se le muestra el onboarding de bienvenida.
//
// Reemplaza el viejo gate por allowlist de email (un solo email de prueba).
// Ahora se muestra a cuentas nuevas (< 30 días) que tengan un rol capaz de
// hacer la configuración inicial — los pasos (datos de empresa, invitar
// equipo, cuenta financiera, AFIP) son tareas de owner/admin, así que no
// tiene sentido mostrárselos a vendedores/viewers.

export const ONBOARDING_MAX_ACCOUNT_AGE_DAYS = 30

// Roles que pueden ejecutar la configuración inicial de la agencia.
export const ONBOARDING_ELIGIBLE_ROLES = ["SUPER_ADMIN", "ORG_OWNER", "ADMIN"]

interface OnboardingUserLike {
  created_at: string | null
  role: string
  roles?: string[]
}

export function isOnboardingEligible(
  user: OnboardingUserLike,
  now: number = Date.now()
): boolean {
  const roles = user.roles ?? [user.role]
  if (!roles.some((r) => ONBOARDING_ELIGIBLE_ROLES.includes(r))) return false

  if (!user.created_at) return false
  const ageMs = now - new Date(user.created_at).getTime()
  if (Number.isNaN(ageMs)) return false

  return ageMs >= 0 && ageMs < ONBOARDING_MAX_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000
}
