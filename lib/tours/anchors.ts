// Anclas: los `data-tour` que los pasos referencian por nombre lógico.
//
// Convención: `<area>.<elemento>`, kebab-case, exactamente dos segmentos.
// Los pasos nunca llevan un selector CSS — así no entran selectores arbitrarios
// a la capa de datos, todas las anclas son grepeables y el test de invariantes
// puede validar el formato.

import type { TourStep } from "./types"

export const ANCHOR_FORMAT = /^[a-z0-9-]+\.[a-z0-9-]+$/

/** Nombres de ancla que el paso referencia, incluidos los del prepare. */
export function stepAnchorNames(step: TourStep): string[] {
  const names: string[] = []
  if (step.target) names.push(...(Array.isArray(step.target) ? step.target : [step.target]))
  if (step.prepare?.click) {
    names.push(...(Array.isArray(step.prepare.click) ? step.prepare.click : [step.prepare.click]))
  }
  return names
}

/** Solo los targets a iluminar (el prepare no se mide). */
export function stepTargets(step: TourStep): string[] {
  if (!step.target) return []
  return Array.isArray(step.target) ? step.target : [step.target]
}

export function anchorSelector(name: string): string {
  return `[data-tour="${name}"]`
}
