/**
 * Soft-launch de Complementos.
 *
 * Mientras se valida en producción, la vitrina existe solo para estas cuentas.
 * Para el resto del mundo la sección no existe: ni en el sidebar, ni entrando
 * por URL, ni desde la API. Es el mismo criterio que ya usa el módulo Eve con
 * `EVE_SIDEBAR_ALLOWED_EMAIL`, con una diferencia deliberada: acá el corte NO
 * vive solo en el sidebar. En Complementos se contrata y se cobra, así que
 * esconder el ítem no alcanza.
 *
 * Ojo con lo que NO gatea: el catálogo (`subscription_addons.active`) y el
 * enforcement son globales. Publicar un complemento para probarlo lo publica
 * para todos los tenants; lo que esta lista garantiza es que ninguna otra cuenta
 * tenga pantalla ni endpoint para contratarlo.
 *
 * Para liberar a todos: borrar este módulo y sus tres usos (sidebar, página
 * /addons y /api/billing/addons). No hay que tocar nada más.
 */

/** En minúscula: la comparación normaliza el mail del usuario. */
export const ADDONS_SOFT_LAUNCH_EMAILS: string[] = ["mypupybox@gmail.com"]

export function isAddonsSoftLaunchUser(email: string | null | undefined): boolean {
  if (!email) return false
  return ADDONS_SOFT_LAUNCH_EMAILS.includes(email.trim().toLowerCase())
}
