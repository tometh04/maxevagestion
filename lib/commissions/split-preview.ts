/**
 * Reparto sugerido para mostrar en los diálogos de operación (VIB-63).
 *
 * Usa la misma función pura que el servidor (`resolveSharedSplit`), así que los
 * números de la pantalla y los de la base salen del mismo lugar. Antes cada
 * diálogo hacía su propia cuenta y le mostraba al secundario la mitad del
 * porcentaje **del principal**, que no es lo que cobra.
 *
 * ⚠️ Alcance: el navegador no conoce el modo de reparto de cada vendedor
 * (HALF/ABSORB), así que esta previsualización asume la regla general. Hoy eso
 * coincide con la realidad porque ningún vendedor tiene ABSORB configurado. En
 * cualquier caso es solo un valor sugerido: si el usuario no lo edita, la
 * operación queda en AUTO y el porcentaje definitivo lo calcula el servidor.
 */

import { resolveSharedSplit } from "@/lib/commissions/shared-split"
import type { SellerOption } from "@/lib/sellers/seller-option"

export interface SharedSplitPreview {
  primary: number
  secondary: number
  total: number
  primaryMax: number | null
  secondaryMax: number | null
  /** Tope del reparto: el mayor de los dos porcentajes. */
  ceiling: number
  exceedsCeiling: boolean
}

export function previewSharedSplit(
  sellers: Array<Pick<SellerOption, "id" | "default_commission_percentage">>,
  primaryId: string | null | undefined,
  secondaryId: string | null | undefined,
  assigned?: { primary?: number | null; secondary?: number | null }
): SharedSplitPreview {
  const pctOf = (id: string | null | undefined) => {
    if (!id) return null
    const found = sellers.find((s) => s.id === id)
    const raw = found?.default_commission_percentage
    return raw == null ? null : Number(raw)
  }

  const primaryMax = pctOf(primaryId)
  const secondaryMax = pctOf(secondaryId)

  const split = resolveSharedSplit(
    { sellerId: "primary", percentage: primaryMax, mode: "HALF" },
    { sellerId: "secondary", percentage: secondaryMax, mode: "HALF" }
  )

  const primary = assigned?.primary != null ? Number(assigned.primary) : split.bySellerId.primary ?? 0
  const secondary =
    assigned?.secondary != null ? Number(assigned.secondary) : split.bySellerId.secondary ?? 0

  const total = Math.round((primary + secondary) * 100) / 100
  const ceiling = Math.max(primaryMax ?? 0, secondaryMax ?? 0)

  return {
    primary,
    secondary,
    total,
    primaryMax,
    secondaryMax,
    ceiling,
    exceedsCeiling: ceiling > 0 && total > ceiling + 0.01,
  }
}
