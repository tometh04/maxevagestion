/**
 * Comparación campo-a-campo entre el voucher enviado a AFIP y lo que
 * getVoucherInfo devuelve al hacer read-back. Tolerancia de 1 centavo
 * en importes porque AFIP a veces redondea raro.
 */

export interface VoucherFields {
  CAE: string
  CAEFchVto: string
  ImpTotal: number
  ImpNeto: number
  ImpIVA: number
  DocNro: number
  DocTipo: number
  CbteFch: string
  CbteDesde: number
  CbteHasta: number
}

export type VoucherDiff =
  | null
  | { _not_found: true }
  | Partial<Record<keyof VoucherFields, { sent: unknown; received: unknown }>>

const MONEY_FIELDS: (keyof VoucherFields)[] = ["ImpTotal", "ImpNeto", "ImpIVA"]
// AFIP WSFE usa pesos decimales (ej: 12100.00 = $12.100). Toleramos 1 centavo
// de diferencia porque AFIP a veces redondea alícuotas independiente del total.
const MONEY_TOLERANCE = 0.01

export function diffVoucher(
  sent: VoucherFields,
  received: Partial<VoucherFields> | null
): VoucherDiff {
  if (received === null) {
    return { _not_found: true }
  }

  const diff: Record<string, { sent: unknown; received: unknown }> = {}

  for (const key of Object.keys(sent) as (keyof VoucherFields)[]) {
    const s = sent[key]
    const r = received[key]

    if (MONEY_FIELDS.includes(key)) {
      const sn = Number(s)
      const rn = Number(r)
      if (Math.abs(sn - rn) > MONEY_TOLERANCE) {
        diff[key] = { sent: s, received: r }
      }
    } else {
      if (String(s) !== String(r)) {
        diff[key] = { sent: s, received: r }
      }
    }
  }

  return Object.keys(diff).length === 0 ? null : (diff as VoucherDiff)
}
