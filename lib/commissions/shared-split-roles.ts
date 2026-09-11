/**
 * Quién puede tipear a mano el reparto de comisión de una venta compartida.
 *
 * Vivía duplicado como literal en los dos diálogos de operación. Acá está una
 * sola vez porque es una regla de negocio ("quién reparte la comisión"), no una
 * decisión de cada pantalla: con dos copias, corregir una y olvidar la otra
 * deja el alta y la edición discrepando sobre la misma venta.
 *
 * ⚠️ No es la matriz de permisos. El equivalente por matriz sería
 * `commissions.write`, que hoy le dice que NO a CONTABLE — y CONTABLE sí carga
 * estos repartos. Cambiar el gate a la matriz es un cambio de quién cobra qué,
 * no un refactor; si se hace, va con el cliente de acuerdo.
 *
 * ORG_OWNER está incluido porque es el alias SaaS del dueño del tenant y hereda
 * los permisos de SUPER_ADMIN: sin él, la lista dejaría afuera justo al dueño
 * (ver VIB-127, el barrido de gates que comparan el rol como string).
 */

import type { UserRole } from "@/lib/permissions"

export const SHARED_SPLIT_EDITOR_ROLES: readonly UserRole[] = [
  "SUPER_ADMIN",
  "ORG_OWNER",
  "ADMIN",
  "CONTABLE",
]

export function canEditSharedSplit(role: UserRole | null | undefined): boolean {
  return !!role && SHARED_SPLIT_EDITOR_ROLES.includes(role)
}
