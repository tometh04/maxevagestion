/**
 * Porcentaje EFECTIVO en las listas de vendedores de los diálogos (VIB-173).
 *
 * ── El bug ─────────────────────────────────────────────────────────────────
 *
 * El tope de una venta compartida —"el reparto no puede superar la comisión más
 * alta de los dos"— se calcula dos veces, con la misma fórmula y con fuentes
 * distintas:
 *
 *   cliente  → `SellerOption.default_commission_percentage`, o sea la columna
 *              cruda `users.default_commission_percentage`
 *   servidor → `resolveSellerCommissionProfiles`, que respeta la precedencia
 *              (`commission_rules` del vendedor → la columna → regla de la org)
 *
 * Y `users.default_commission_percentage` es **write-once**: sólo se escribe al
 * dar de alta al usuario. Subirle el porcentaje a alguien en Configuración →
 * Reglas de Comisiones crea una fila en `commission_rules` que hace *shadowing*
 * de esa columna, y la columna queda con el número viejo para siempre.
 *
 * Resultado medido en Lozada: Micaela pasó a 45% por regla, pero su columna
 * seguía en 35, así que el diálogo le mostraba "Tope: 35,00%" en rojo mientras
 * el servidor —con el 45— habría aceptado el reparto sin chistar. Seis
 * vendedores con el mismo desfasaje, dos de ellos en 21 ventas compartidas cada
 * uno. Y Maximiliano al revés: regla en 0 y columna en 50, o sea que ahí la
 * pantalla habilitaba MÁS de lo que el servidor iba a aceptar.
 *
 * ── El arreglo ─────────────────────────────────────────────────────────────
 *
 * Las listas que alimentan los diálogos pasan por acá y salen con el porcentaje
 * que el servidor va a usar de verdad. No se toca
 * `users.default_commission_percentage`: sigue siendo la columna que se edita en
 * Usuarios, y quien la muestre como tal (la pantalla de Usuarios) la sigue
 * viendo tal cual.
 */

import { resolveSellerCommissionProfiles } from "@/lib/commissions/seller-commission-profile"
import { toSellerOptions, type SellerOption } from "@/lib/sellers/seller-option"

/**
 * Convierte filas de `users` en `SellerOption[]` con el porcentaje efectivo.
 *
 * Best-effort a propósito: si la resolución falla, devuelve las opciones con el
 * porcentaje crudo en vez de romper la pantalla. Un tope desactualizado es un
 * cartel equivocado; una lista de vendedores vacía es una operación que no se
 * puede cargar.
 */
export async function resolveEffectiveSellerOptions(
  supabase: any,
  orgId: string | null | undefined,
  rows: any[] | null | undefined,
): Promise<SellerOption[]> {
  const options = toSellerOptions(rows)
  if (!orgId || options.length === 0) return options

  try {
    const profiles = await resolveSellerCommissionProfiles(
      supabase,
      orgId,
      options.map((o) => o.id),
    )

    return options.map((option) => {
      const profile = profiles.get(option.id)
      // `percentage` puede ser null legítimamente ("sin porcentaje en ninguna
      // fuente"), y en ese caso el null tiene que ganar: es distinto de 0 y los
      // diálogos lo muestran como "falta cargar la comisión".
      if (!profile) return option
      return { ...option, default_commission_percentage: profile.percentage }
    })
  } catch (err) {
    console.error("[Sellers] No se pudo resolver el porcentaje efectivo:", err)
    return options
  }
}
