/**
 * Validación de un reparto de comisión cargado a mano (VIB-63).
 *
 * Reemplaza los dos bloques duplicados que había en `POST /api/operations` y
 * `PATCH /api/operations/[id]` — que además ya habían divergido entre sí.
 *
 * ── Por qué cambió la regla ────────────────────────────────────────────────
 *
 * Antes el tope era "la suma no puede superar el porcentaje del vendedor
 * PRINCIPAL". Eso hacía imposible cargar una venta legítima cuando quien la
 * cargaba tenía un porcentaje chico: con un principal de 13% y una secundaria
 * de 50%, darle a ella lo suyo devolvía un 400. El equipo lo resolvía poniendo
 * como principal a quien no había cargado la venta, que es exactamente el
 * síntoma que reportó el cliente ("no importa quién carga la venta").
 *
 * Las reglas nuevas son simétricas: no dependen de quién quedó como principal.
 *
 *   1. Individual: nadie puede cobrar más que su propio porcentaje.
 *   2. Total: el reparto no puede superar al mayor de los dos porcentajes.
 *
 * La segunda es el techo real del negocio: en el peor caso la venta cuesta lo
 * que habría costado si la hubiera hecho sola la persona de porcentaje más alto.
 */

const TOLERANCE = 0.01

export interface ManualSplitParticipant {
  sellerId: string
  /** Para que el mensaje nombre a la persona y no diga "vendedor principal". */
  name: string | null
  /** Porcentaje configurado del vendedor: su techo individual. */
  maxPercentage: number | null
  /** Porcentaje que se le asignó a mano en esta operación. */
  assignedPercentage: number
}

export type ManualSplitValidation = { ok: true } | { ok: false; error: string }

function label(participant: ManualSplitParticipant): string {
  return participant.name?.trim() || "El vendedor"
}

function fmt(value: number): string {
  return value.toFixed(2)
}

export function validateManualSplit(
  a: ManualSplitParticipant,
  b: ManualSplitParticipant
): ManualSplitValidation {
  for (const participant of [a, b]) {
    const assigned = Number(participant.assignedPercentage)
    if (!Number.isFinite(assigned) || assigned < 0) {
      return { ok: false, error: "Las comisiones deben ser números no negativos" }
    }
  }

  for (const participant of [a, b]) {
    const max = participant.maxPercentage

    if (max == null) {
      if (Number(participant.assignedPercentage) > 0) {
        return {
          ok: false,
          error: `${label(participant)} no tiene un porcentaje de comisión configurado. Cargalo en Configuración → Usuarios antes de repartir la comisión.`,
        }
      }
      continue
    }

    if (Number(participant.assignedPercentage) > max + TOLERANCE) {
      return {
        ok: false,
        error: `${label(participant)} no puede cobrar ${fmt(Number(participant.assignedPercentage))}%: su comisión es del ${fmt(max)}%.`,
      }
    }
  }

  const total = Number(a.assignedPercentage) + Number(b.assignedPercentage)
  const ceiling = Math.max(a.maxPercentage ?? 0, b.maxPercentage ?? 0)

  if (total > ceiling + TOLERANCE) {
    return {
      ok: false,
      error: `El reparto suma ${fmt(total)}% y no puede superar el ${fmt(ceiling)}% del vendedor con la comisión más alta.`,
    }
  }

  return { ok: true }
}
