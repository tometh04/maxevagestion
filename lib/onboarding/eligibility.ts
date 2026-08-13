// Decide si a un usuario se le ofrece la guía de configuración inicial.
//
// Los pasos (datos de empresa, invitar equipo, cuenta financiera, AFIP) son
// tareas de owner/admin, así que no tiene sentido mostrárselos a vendedores ni
// viewers.
//
// Antes había además un corte por antigüedad de cuenta (< 30 días) porque el
// onboarding viejo se auto-mostraba y no había forma de volver a abrirlo. Las
// guías in-app se cierran y se retoman desde el menú "Guías", así que castigar
// a una cuenta vieja por serlo no aporta: un admin que nunca configuró AFIP
// sigue necesitando la guía.

// Roles que pueden ejecutar la configuración inicial de la agencia.
export const ONBOARDING_ELIGIBLE_ROLES = ["SUPER_ADMIN", "ORG_OWNER", "ADMIN"]

interface OnboardingUserLike {
  role: string
  roles?: string[]
}

export function canRunSetupTour(user: OnboardingUserLike): boolean {
  const roles = user.roles ?? [user.role]
  return roles.some((r) => ONBOARDING_ELIGIBLE_ROLES.includes(r))
}
