/**
 * Armado de los ítems de una factura a partir de una operación.
 *
 * Vivía dentro de `app/(dashboard)/operations/billing/new/page.tsx`. Se baja acá
 * por VIB-121 (facturar varios servicios juntos): el reparto de la venta entre
 * las patas y el corte gravado/no gravado son reglas fiscales, no presentación,
 * y adentro del componente no había forma de testearlas.
 *
 * El criterio de los dos ítems es el de siempre: el costo del operador viaja
 * como **no gravado** (es un pass-through, la agencia no lo vende) y solo la
 * diferencia —su ganancia— va **gravada al 10,5%**, que es la alícuota de
 * intermediación turística.
 */

import type { ItemTaxTreatment } from "@/lib/invoices/calculation"
import { productTypeLabel } from "@/lib/operations/product-types"
import {
  distributeSaleByCost,
  reconcileOperatorSaleBreakdown,
} from "@/lib/operations/operator-sale-breakdown"

export interface InvoiceItemDraft {
  descripcion: string
  cantidad: number
  precio_unitario: number
  iva_porcentaje: number
  tax_treatment: ItemTaxTreatment
}

export interface OperationLeg {
  cost?: number | string | null
  cost_currency?: "ARS" | "USD" | null
  product_type?: string | null
  notes?: string | null
  sale_amount?: number | string | null
  operators?: { id?: string; name?: string } | null
}

export interface InvoiceableOperation {
  file_code?: string
  destination?: string
  sale_currency?: "ARS" | "USD"
  sale_amount_total?: number
  operator_cost?: number | string | null
  operation_operators?: OperationLeg[]
}

/**
 * Etiquetas ES para `operation_operators.product_type`.
 * Espejo de BASE_PRODUCT_LABELS en lib/operations/purchase-summary.ts.
 *
 * Los tipos personalizados por agencia (`operation_settings.custom_product_types`)
 * no están acá: caen en `productTypeLabel()`, que los muestra legibles en vez del
 * valor crudo ("ALOJAMIENTO_Y_TRASLADOS" → "Alojamiento y traslados").
 */
const PRODUCT_TYPE_LABELS: Record<string, string> = {
  FLIGHT: "Aéreo",
  HOTEL: "Hotel",
  PACKAGE: "Paquete",
  CRUISE: "Crucero",
  TRANSFER: "Transfer",
  MIXED: "Mixto",
  ASSISTANCE: "Asistencia",
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/** Nombre legible de una pata, para el selector y la descripción del ítem. */
export function getLegLabel(leg: OperationLeg, index: number): string {
  const typeLabel = leg.product_type
    ? PRODUCT_TYPE_LABELS[leg.product_type] || productTypeLabel(leg.product_type)
    : null
  const operatorName = leg.operators?.name?.trim() || null
  if (typeLabel && operatorName) return `${typeLabel} - ${operatorName}`
  if (typeLabel) return typeLabel
  if (operatorName) return operatorName
  return `Servicio ${index + 1}`
}

export function createDefaultItem(cbteTipo: number): InvoiceItemDraft {
  // El comprobante 19 (factura E, exportación) no lleva IVA.
  const taxTreatment: ItemTaxTreatment = cbteTipo === 19 ? "EXENTO" : "GRAVADO"
  return {
    descripcion: "",
    cantidad: 1,
    precio_unitario: 0,
    iva_porcentaje: taxTreatment === "GRAVADO" ? 21 : 0,
    tax_treatment: taxTreatment,
  }
}

/** Los dos ítems del criterio: pass-through no gravado + ganancia al 10,5%. */
function buildPair(
  label: string,
  nonGravado: number,
  taxableDifference: number
): InvoiceItemDraft[] {
  const items: InvoiceItemDraft[] = []
  if (nonGravado > 0) {
    items.push({
      descripcion: `Costo de venta no gravado - ${label}`,
      cantidad: 1,
      precio_unitario: nonGravado,
      iva_porcentaje: 0,
      tax_treatment: "NO_GRAVADO",
    })
  }
  if (taxableDifference > 0) {
    items.push({
      descripcion: `Diferencia gravada 10.5% - ${label}`,
      cantidad: 1,
      precio_unitario: taxableDifference,
      iva_porcentaje: 10.5,
      tax_treatment: "GRAVADO",
    })
  }
  return items
}

/** Facturar la venta completa: el comportamiento clásico, sin abrir por servicio. */
export function buildFullSaleItems(
  operation: InvoiceableOperation,
  cbteTipo: number
): InvoiceItemDraft[] {
  const saleTotal = Number(operation.sale_amount_total || 0)
  const operatorCost = Number(operation.operator_cost || 0)
  const taxableDifference = roundMoney(Math.max(0, saleTotal - operatorCost))
  const destinationLabel = operation.destination || "Operacion"
  const fileCode = operation.file_code || ""
  const suffix = fileCode ? `${destinationLabel} (${fileCode})` : destinationLabel

  const items: InvoiceItemDraft[] = []
  if (operatorCost > 0) {
    items.push({
      descripcion: `Costo de venta no gravado - ${suffix}`,
      cantidad: 1,
      precio_unitario: roundMoney(Math.min(operatorCost, saleTotal || operatorCost)),
      iva_porcentaje: 0,
      tax_treatment: "NO_GRAVADO",
    })
  }
  if (taxableDifference > 0) {
    items.push({
      descripcion: `Diferencia gravada 10.5% - ${suffix}`,
      cantidad: 1,
      precio_unitario: taxableDifference,
      iva_porcentaje: 10.5,
      tax_treatment: "GRAVADO",
    })
  }

  return items.length > 0 ? items : [createDefaultItem(cbteTipo)]
}

/**
 * Facturar uno o varios servicios (patas) de la operación — VIB-121.
 *
 * El precio de venta de cada pata (`share`) sale de:
 *   1. VIB-112: el `sale_amount` cargado en la operación, si el desglose de
 *      TODAS las patas cuadra con `sale_amount_total`. Es lo que la agencia
 *      definió para controlar la base gravada.
 *   2. Si no hay desglose o no cuadra: reparto proporcional al costo, el default
 *      histórico. Así la suma de las patas sigue reconciliando con el total.
 *
 * Con varias patas seleccionadas se emite **un par de ítems por servicio**, en
 * el orden en que están cargados en la operación. Se eligió eso sobre un par
 * consolidado porque el pass-through y la ganancia se calculan pata por pata:
 * sumarlos primero mezclaría servicios con margen distinto y cambiaría la base
 * gravada. Además, en la factura el pasajero ve qué le están cobrando.
 *
 * `exchangeRate` es USD→ARS y solo se usa para expresar el costo de una pata en
 * la moneda de venta de la operación cuando difieren.
 */
export function buildLegInvoiceItems(input: {
  operation: InvoiceableOperation
  legIndexes: number[]
  cbteTipo: number
  exchangeRate?: number
}): InvoiceItemDraft[] {
  const { operation, legIndexes, cbteTipo } = input
  const legs = operation.operation_operators || []

  // Índices válidos, deduplicados, y siempre en el orden de la operación:
  // el orden en que el usuario tildó las casillas no debe cambiar la factura.
  const indexes = Array.from(new Set(legIndexes))
    .filter((i) => Number.isInteger(i) && i >= 0 && i < legs.length)
    .sort((a, b) => a - b)

  if (indexes.length === 0) return buildFullSaleItems(operation, cbteTipo)

  const saleCurrency = operation.sale_currency === "USD" ? "USD" : "ARS"
  const rate = (input.exchangeRate ?? 1) > 1 ? (input.exchangeRate as number) : 1
  const saleTotal = Number(operation.sale_amount_total || 0)

  const costInSaleCurrency = (leg: OperationLeg): number => {
    const cost = Number(leg.cost || 0)
    const currency = leg.cost_currency === "USD" ? "USD" : "ARS"
    if (currency === saleCurrency) return cost
    return saleCurrency === "USD" ? cost / rate : cost * rate
  }

  // Se resuelve UNA vez para todas las patas: el reparto depende del conjunto
  // completo, no de las que se estén facturando ahora.
  const breakdown = reconcileOperatorSaleBreakdown({
    legs,
    saleAmountTotal: saleTotal,
  })
  const distributed =
    breakdown.status === "BALANCED"
      ? null
      : distributeSaleByCost({
          legs,
          saleAmountTotal: saleTotal,
          saleCurrency,
          exchangeRate: rate,
        })

  const fileCode = operation.file_code || ""
  const suffix = fileCode ? ` (${fileCode})` : ""

  const items = indexes.flatMap((legIndex) => {
    const leg = legs[legIndex]
    const legCost = costInSaleCurrency(leg)
    const share = distributed
      ? distributed[legIndex] ?? 0
      : Number(leg.sale_amount || 0)

    const nonGravado = roundMoney(Math.min(legCost, share))
    const taxableDifference = roundMoney(Math.max(0, share - nonGravado))

    return buildPair(`${getLegLabel(leg, legIndex)}${suffix}`, nonGravado, taxableDifference)
  })

  return items.length > 0 ? items : [createDefaultItem(cbteTipo)]
}
