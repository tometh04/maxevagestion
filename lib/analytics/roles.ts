// Rol como DIMENSION de analitica.
//
// El repo tiene tres formas de resolver el rol de una persona y las tres son
// legitimas en su contexto:
//
//   1. `users.role` crudo — ignora `additional_roles`, asi que clasifica mal
//      justo a los 12 usuarios que hacen de todo, que son los interesantes.
//   2. `user.roles[]` fusionado (`lib/auth.ts`) — es un array. Como dimension
//      convierte cada filtro en un `@>` y cada GROUP BY en una explosion
//      combinatoria. Para segmentar hace falta UN valor.
//   3. `getEffectiveAgencyScopeRole(roles)` (`lib/permissions.ts`) — puro,
//      determinista, con prioridad fija, y es la funcion con la que la app ya
//      decide hasta donde llega cada persona.
//
// Se usa la tercera: que la dimension de uso signifique lo mismo que la
// dimension de alcance es exactamente lo que se quiere al leer un heatmap por
// rol.

import { getEffectiveAgencyScopeRole, type UserRole } from "../permissions"

/**
 * El asesor de viajes independiente va como valor propio y no como columna
 * booleana aparte.
 *
 * Por que: tiene un techo de permisos duro (`INDEPENDENT_ADVISOR_PERMS`), o sea
 * que su perfil de uso ES distinto al de un SELLER de la agencia y merece ser
 * un segmento, no un filtro cruzado. Ademas la UI queda con un solo `<Select>`
 * en vez de dos controles que el que mira tiene que combinar mentalmente.
 */
export const USAGE_ROLES = [
  "SUPER_ADMIN",
  "ORG_OWNER",
  "ADMIN",
  "CONTABLE",
  "POST_VENTA",
  "SELLER",
  "SELLER_AVI",
  "VIEWER",
] as const

export type UsageRole = (typeof USAGE_ROLES)[number]

const USAGE_ROLE_SET = new Set<string>(USAGE_ROLES)

export function isUsageRole(value: string | null | undefined): value is UsageRole {
  return !!value && USAGE_ROLE_SET.has(value)
}

export const USAGE_ROLE_LABELS: Record<UsageRole, string> = {
  SUPER_ADMIN: "Super admin",
  ORG_OWNER: "Dueño",
  ADMIN: "Admin",
  CONTABLE: "Contable",
  POST_VENTA: "Post venta",
  SELLER: "Vendedor",
  SELLER_AVI: "Asesor independiente",
  VIEWER: "Solo lectura",
}

/**
 * Rol de analitica de un usuario. Se resuelve en el server y se CONGELA en el
 * evento: si alguien pasa de SELLER a ADMIN, los eventos viejos siguen diciendo
 * SELLER, que es la verdad historica y lo que hace comparables las cohortes.
 */
export function usageRoleFor(user: {
  role?: string | null
  additional_roles?: string[] | null
  is_independent_advisor?: boolean | null
}): UsageRole | null {
  if (!user?.role) return null

  const roles = Array.from(
    new Set([user.role, ...(user.additional_roles ?? [])])
  ) as UserRole[]

  // Nunca devuelve null: ante un array vacio o desconocido cae en "VIEWER".
  const effective = getEffectiveAgencyScopeRole(roles)

  // El techo del AVI aplica sobre un SELLER. Si la persona ademas tiene un rol
  // de mayor alcance, ese rol manda: el flag no la achica.
  if (effective === "SELLER" && user.is_independent_advisor) return "SELLER_AVI"

  // Un rol que no este en el catalogo (constraint nueva en DB sin deploy del
  // front) entra como null en vez de romper el insert del batch entero.
  return isUsageRole(effective) ? effective : null
}
