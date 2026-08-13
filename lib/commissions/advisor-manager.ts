/**
 * Comisión del administrador de un vendedor (VIB-102).
 *
 * Función pura: no toca Supabase, no hace `await`, no lee configuración. Recibe
 * los vendedores de la operación con su vínculo ya resuelto y devuelve qué
 * administrador cobra y cuánto.
 *
 * ── La regla, como la planteó el cliente ───────────────────────────────────
 *
 * Un asesor de viajes independiente (free) comisiona sobre el margen de su
 * venta. Alguien del equipo lo administra y cobra un porcentaje de CADA venta
 * de ese free:
 *
 *     margen 1000 · free 50% → 500 · administrador 5% → 50 · agencia → 450
 *
 * El 45% de la agencia no se calcula ni se guarda en ningún lado: es lo que
 * queda. Modelarlo como un tercer porcentaje sería un número más que puede
 * quedar desincronizado de los otros dos.
 *
 * ── Decisiones ─────────────────────────────────────────────────────────────
 *
 * **El porcentaje del administrador se aplica sobre el margen COMPLETO**, no
 * sobre la parte que le quedó al free. Es lo que pidió el cliente y es lo único
 * que se puede explicar sin una cuenta: el administrador cobra 5% de la venta,
 * punto. En una venta compartida entre un free y un vendedor de planta, el
 * reparto entre esos dos no cambia lo que cobra el administrador.
 *
 * **Sin porcentaje configurado no se cobra nada.** Un administrador asignado
 * pero sin porcentaje NO cae a un default: sería plata que nadie eligió. Se
 * reporta como warning para que se vea en pantalla en vez de aparecer sola en
 * la liquidación.
 *
 * **Un administrador cobra una sola vez por operación**, aunque administre a
 * los dos vendedores de una venta compartida: es una venta, no dos.
 */

import { roundMoney } from "@/lib/currency"

export interface AdvisorManagerParticipant {
  /** Vendedor de la operación (principal o secundario). */
  sellerId: string
  /** Quién lo administra. null = nadie. */
  advisorManagerId: string | null
  /** % del administrador sobre el margen. null/0 = no cobra. */
  advisorManagerPercentage: number | null
}

export type AdvisorManagerWarning =
  /** Hay administrador asignado pero sin porcentaje: no cobra nada. */
  | { code: "manager_missing_percentage"; sellerId: string; managerId: string }
  /**
   * El vendedor figura como su propio administrador. La base lo prohíbe con un
   * CHECK; el motor igual lo ignora para no duplicarle el porcentaje si una
   * fila vieja se coló antes de la migración.
   */
  | { code: "manager_is_self"; sellerId: string }

export interface AdvisorManagerOverride {
  managerId: string
  /** % sobre el margen de la operación, con 2 decimales. */
  percentage: number
  /**
   * Vendedores administrados que lo generaron, ordenados. Normalmente uno; son
   * dos solo si administra a ambos vendedores de una venta compartida.
   */
  sourceSellerIds: string[]
}

export interface AdvisorManagerResult {
  overrides: AdvisorManagerOverride[]
  warnings: AdvisorManagerWarning[]
}

function usablePct(raw: number | null): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return 0
  return value
}

/**
 * Resuelve las comisiones de administrador de una operación.
 *
 * El resultado es estable: no depende del orden en que vengan los vendedores,
 * igual que `resolveSharedSplit`. Un cambio de quién quedó cargado como
 * principal no puede cambiar lo que cobra un administrador.
 */
export function resolveAdvisorManagerOverrides(
  participants: AdvisorManagerParticipant[]
): AdvisorManagerResult {
  const warnings: AdvisorManagerWarning[] = []
  const byManager = new Map<string, { percentage: number; sourceSellerIds: Set<string> }>()

  for (const participant of participants) {
    const managerId = participant.advisorManagerId
    if (!managerId) continue

    if (managerId === participant.sellerId) {
      warnings.push({ code: "manager_is_self", sellerId: participant.sellerId })
      continue
    }

    const percentage = usablePct(participant.advisorManagerPercentage)
    if (percentage <= 0) {
      warnings.push({
        code: "manager_missing_percentage",
        sellerId: participant.sellerId,
        managerId,
      })
      continue
    }

    const current = byManager.get(managerId)
    if (!current) {
      byManager.set(managerId, {
        percentage,
        sourceSellerIds: new Set([participant.sellerId]),
      })
      continue
    }

    // Administra a los dos vendedores de la venta. Cobra UNA vez: sumar los dos
    // porcentajes le pagaría dos veces la misma operación. Se toma el mayor —el
    // trato más favorable configurado— en vez del primero, para que el
    // resultado no dependa del orden de los argumentos.
    current.percentage = Math.max(current.percentage, percentage)
    current.sourceSellerIds.add(participant.sellerId)
  }

  const overrides: AdvisorManagerOverride[] = Array.from(byManager.entries())
    .map(([managerId, acc]) => ({
      managerId,
      percentage: roundMoney(acc.percentage, 2),
      sourceSellerIds: Array.from(acc.sourceSellerIds).sort(),
    }))
    .sort((a, b) => a.managerId.localeCompare(b.managerId))

  const sortedWarnings = [...warnings].sort(
    (x, y) => x.code.localeCompare(y.code) || x.sellerId.localeCompare(y.sellerId)
  )

  return { overrides, warnings: sortedWarnings }
}
