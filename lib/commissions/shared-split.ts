/**
 * Reparto de comisión en una venta compartida entre dos vendedores (VIB-63).
 *
 * Función pura: no toca Supabase, no hace await, no lee configuración. Recibe
 * los dos participantes ya resueltos (porcentaje + modo) y devuelve el
 * porcentaje efectivo de cada uno sobre el margen.
 *
 * ── Las reglas, como las planteó el cliente ────────────────────────────────
 *
 * General: en una venta compartida cada vendedor cobra la MITAD de su propio
 * porcentaje.
 *
 * Especial: ciertos vendedores "absorben". El otro cobra la mitad de lo suyo y
 * el absorbente cobra su porcentaje MENOS lo que cobró el otro:
 *
 *     Jose (20%) + Santi (35% absorbe)   → Jose 10 · Santi 35 − 10 = 25
 *     Jose (20%) + Julieta (60% absorbe) → Jose 10 · Julieta 60 − 10 = 50
 *
 * El total pasa a ser exactamente el porcentaje del absorbente: él paga de su
 * parte lo que cobra el socio. Absorber NO es un premio, es un techo — con un
 * socio de porcentaje alto el absorbente puede terminar cobrando menos que la
 * mitad de lo suyo.
 *
 * ── Simetría ───────────────────────────────────────────────────────────────
 *
 * El requisito central del ticket es que el resultado NO dependa de quién quedó
 * cargado como vendedor principal ("a veces el secundario la carga pero se pone
 * como principal"). Por eso la única decisión asimétrica posible —quién absorbe—
 * se deriva de `(modo, porcentaje, sellerId)` y nunca de la posición del
 * argumento. Eso hace que `resolveSharedSplit(a, b)` y `resolveSharedSplit(b, a)`
 * sean idénticos, y que sea verificable de forma exhaustiva en los tests.
 */

import { roundMoney } from "@/lib/currency"

export type SharedSaleMode = "HALF" | "ABSORB"

/** Regla que terminó aplicándose, para poder explicarla en pantalla y auditar. */
export type SharedSplitRule = "HALF_HALF" | "ABSORB" | "SINGLE"

export type SharedSplitWarning =
  /** El vendedor no tiene porcentaje configurado: cobra 0. */
  | { code: "missing_percentage"; sellerId: string }
  /**
   * Al absorbente no le alcanza su porcentaje para cubrir la parte del socio.
   * Cobra 0 y NO se le recorta al otro: "cada uno cobra la mitad de lo suyo" es
   * el piso que fijó el cliente; lo que flexiona es el porcentaje del absorbente.
   */
  | { code: "absorber_underwater"; sellerId: string; shortfall: number }
  /** Los dos participantes son la misma persona: no es una venta compartida. */
  | { code: "same_seller"; sellerId: string }

export interface SharedSplitParticipant {
  sellerId: string
  /** Porcentaje sobre el margen. null = sin configurar. */
  percentage: number | null
  mode: SharedSaleMode
}

export interface SharedSplitResult {
  /** sellerId → porcentaje efectivo sobre el margen, con 2 decimales. */
  bySellerId: Record<string, number>
  rule: SharedSplitRule
  absorberId: string | null
  /** Suma de los efectivos. Útil para validar y para mostrar el reparto. */
  totalPct: number
  warnings: SharedSplitWarning[]
}

/** Porcentaje utilizable: null, NaN y negativos cuentan como 0. */
function usablePct(participant: SharedSplitParticipant): number {
  const value = Number(participant.percentage)
  if (!Number.isFinite(value) || value <= 0) return 0
  return value
}

function round2(value: number): number {
  return roundMoney(value, 2)
}

/**
 * Orden estable de los warnings. Sin esto el array saldría en el orden de los
 * argumentos y `resolveSharedSplit(a,b)` no sería estrictamente igual a
 * `resolveSharedSplit(b,a)`: la simetría valdría para la plata pero no para el
 * resultado completo, y el test exhaustivo tendría que aflojarse para pasar.
 */
function sortWarnings(warnings: SharedSplitWarning[]): SharedSplitWarning[] {
  return [...warnings].sort(
    (x, y) => x.code.localeCompare(y.code) || x.sellerId.localeCompare(y.sellerId)
  )
}

export function resolveSharedSplit(
  a: SharedSplitParticipant,
  b: SharedSplitParticipant
): SharedSplitResult {
  const warnings: SharedSplitWarning[] = []
  const pctA = usablePct(a)
  const pctB = usablePct(b)

  if (pctA <= 0) warnings.push({ code: "missing_percentage", sellerId: a.sellerId })
  if (pctB <= 0) warnings.push({ code: "missing_percentage", sellerId: b.sellerId })

  // Degenerado: la misma persona dos veces. No hay reparto que hacer; cobra su
  // porcentaje completo una sola vez.
  if (a.sellerId === b.sellerId) {
    warnings.push({ code: "same_seller", sellerId: a.sellerId })
    // Si el sellerId es el mismo, ambos participantes salieron del mismo perfil
    // y los porcentajes deberían ser idénticos. Tomamos el mayor en vez de
    // `pctA` para que ni siquiera este caso degenerado dependa del orden.
    const total = round2(Math.max(pctA, pctB))
    return {
      bySellerId: { [a.sellerId]: total },
      rule: "SINGLE",
      absorberId: null,
      totalPct: total,
      warnings: sortWarnings(warnings),
    }
  }

  // Elección del absorbente: determinística y sin mirar el orden de los
  // argumentos. Un vendedor sin porcentaje configurado no puede absorber —
  // si pudiera, daría 0 y taparía un error de configuración como si fuera regla.
  const candidates = [
    { participant: a, pct: pctA },
    { participant: b, pct: pctB },
  ]
    .filter((c) => c.participant.mode === "ABSORB" && c.pct > 0)
    // Mayor porcentaje primero; el sellerId desempata para que sea estable.
    .sort(
      (x, y) => y.pct - x.pct || x.participant.sellerId.localeCompare(y.participant.sellerId)
    )

  if (candidates.length === 0) {
    const effA = round2(pctA / 2)
    const effB = round2(pctB / 2)
    return {
      bySellerId: { [a.sellerId]: effA, [b.sellerId]: effB },
      rule: "HALF_HALF",
      absorberId: null,
      totalPct: round2(effA + effB),
      warnings: sortWarnings(warnings),
    }
  }

  const absorber = candidates[0].participant
  const absorberPct = candidates[0].pct
  const other = absorber.sellerId === a.sellerId ? b : a
  const otherPct = absorber.sellerId === a.sellerId ? pctB : pctA

  const otherEff = round2(otherPct / 2)
  let absorberEff = round2(absorberPct - otherEff)

  if (absorberEff < 0) {
    warnings.push({
      code: "absorber_underwater",
      sellerId: absorber.sellerId,
      shortfall: round2(-absorberEff),
    })
    absorberEff = 0
  }

  return {
    bySellerId: { [absorber.sellerId]: absorberEff, [other.sellerId]: otherEff },
    rule: "ABSORB",
    absorberId: absorber.sellerId,
    totalPct: round2(absorberEff + otherEff),
    warnings: sortWarnings(warnings),
  }
}

/**
 * Porcentaje de un vendedor que NO comparte la venta: cobra el suyo completo.
 * Vive acá para que todo el vocabulario del reparto esté en un solo módulo.
 */
export function resolveSoloPercentage(percentage: number | null): number {
  const value = Number(percentage)
  if (!Number.isFinite(value) || value <= 0) return 0
  return round2(value)
}
