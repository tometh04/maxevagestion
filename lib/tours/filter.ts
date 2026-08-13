// Filtrado de pasos antes de arrancar una guía.
//
// Puro: recibe la matriz de permisos YA resuelta (vía el callback `can`) en vez
// de re-derivarla. La fuente de verdad sigue siendo resolveUserPermissions; acá
// solo se decide qué pasos tienen sentido mostrarle a este usuario.
//
// Un paso filtrado desaparece de la numeración: si un SELLER no ve el tab de
// contabilidad, la guía dice "Paso 3 de 6", no "Paso 3 de 9" con huecos.

import type { TourDefinition, TourFilterContext, TourStep } from "./types"

export function filterSteps(steps: TourStep[], ctx: TourFilterContext): TourStep[] {
  return steps.filter((step) => {
    if (step.skipOnMobile && ctx.isMobile) return false
    if (step.requirePermission) {
      const { module, permission } = step.requirePermission
      if (!ctx.can(module, permission)) return false
    }
    return true
  })
}

/** Roles con los que un tour gateado por rol puede correr. */
export function rolesAllowTour(tour: TourDefinition, roles: string[]): boolean {
  if (!tour.requireRoles || tour.requireRoles.length === 0) return true
  return roles.some((r) => tour.requireRoles!.includes(r))
}

/** ¿Este usuario puede correr esta guía, y le queda al menos un paso? */
export function resolveVisibleSteps(
  tour: TourDefinition,
  roles: string[],
  ctx: TourFilterContext
): TourStep[] {
  if (!rolesAllowTour(tour, roles)) return []
  return filterSteps(tour.steps, ctx)
}
