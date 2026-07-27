/**
 * Agregación del Reporte de Ventas por producto (VIB-66).
 *
 * Función pura: recibe las operaciones y sus ítems ya leídos por
 * `lib/operations/fetch-sales-operations.ts` y arma el desglose por producto,
 * vendedor, agencia y mes.
 *
 * ── El prorrateo ────────────────────────────────────────────────────────────
 * La venta vive a nivel operación (`operations.sale_amount_total`), pero lo que
 * se vendió está en los ítems (`operation_operators.product_type`). Para poder
 * decir "cuánto vendimos de vuelos" hay que repartir la venta de la operación
 * entre sus ítems. El peso se elige en cascada:
 *
 *   1. El importe de venta del ítem, si está cargado en al menos uno.
 *   2. Si no, el costo del ítem — pero solo si todos comparten moneda: usar
 *      costos en ARS y USD como pesos deformaría el reparto.
 *   3. Si no, partes iguales.
 *
 * Invariante duro (con test): la suma de todos los buckets es EXACTAMENTE la
 * venta del período. El residuo de redondeo lo absorbe el ítem de mayor peso
 * (no el último: podría ser uno chico y el centavo se notaría).
 *
 * Los servicios adicionales (cuando la flag está prendida) NO se prorratean:
 * van a su propio bucket. Repartirlos entre los productos los volvería
 * invisibles, que es justo lo contrario de lo que pide el reporte.
 *
 * ── Monedas ─────────────────────────────────────────────────────────────────
 * El reporte se arma para UNA moneda. No se convierte nada, así que no hay
 * tipo de cambio que pueda ensuciar el invariante; la venta del vendedor o la
 * agencia en la otra moneda se informa aparte en `otherCurrencySale`.
 */

import { roundMoney } from "@/lib/currency"
import {
  SERVICES_BUCKET_KEY,
  UNSPECIFIED_BUCKET_KEY,
  normalizeProductType,
  productTypeColor,
  productTypeLabel,
} from "@/lib/operations/product-types"
import { seriesColor } from "@/lib/reports/palette"
import { monthKeysBetween, monthLabel, safeDiv } from "@/lib/reports/period"
import type {
  SalesOperationItemRow,
  SalesOperationRow,
} from "@/lib/operations/fetch-sales-operations"

/** De dónde salió el peso con el que se repartió la venta de una operación. */
export type AttributionSource = "item_sale" | "item_cost" | "even" | "operation"

export interface SalesBreakdownBucket {
  key: string
  label: string
  color: string
  sale: number
  cost: number
  /** null si hay costos en otra moneda: un margen mezclado no significa nada. */
  margin: number | null
  marginPct: number | null
  /** Costo de ítems cuya moneda no coincide con la de la venta. */
  costOtherCurrency: number
  operations: number
  items: number
  share: number
}

export interface SalesBreakdownSeller {
  sellerId: string
  sellerName: string
  color: string
  sale: number
  cost: number
  margin: number
  marginPct: number
  operations: number
  share: number
  /** Ventas donde fue vendedor secundario. Informativo: NO suma al total. */
  secondarySale: number
  secondaryOperations: number
  /** Ventas del mismo vendedor en la otra moneda. */
  otherCurrencySale: number
}

export interface SalesBreakdownAgency {
  agencyId: string | null
  agencyName: string
  sale: number
  cost: number
  margin: number
  marginPct: number
  operations: number
  share: number
  otherCurrencySale: number
}

export interface SalesBreakdownMonth {
  key: string
  label: string
  sale: number
  cost: number
  margin: number
  operations: number
}

export interface SalesBreakdownDetailRow {
  operationId: string
  fileCode: string
  date: string
  destination: string
  sellerName: string
  agencyName: string
  products: Array<{ key: string; label: string; sale: number }>
  sale: number
  cost: number
  margin: number
  marginPct: number
  prorated: boolean
  attributionSource: AttributionSource
}

export interface SalesBreakdownReport {
  currency: string
  dateFrom: string
  dateTo: string
  summary: {
    sale: number
    cost: number
    margin: number
    marginPct: number
    operations: number
    averageTicket: number
    includeServices: boolean
    truncated: boolean
    otherCurrency: { currency: string; sale: number; operations: number } | null
    attribution: {
      operationsByItemSale: number
      operationsByItemCost: number
      operationsEven: number
      operationsWithoutItems: number
      itemsTotal: number
      /** Suma de los ajustes de redondeo aplicados. Debería ser centavos. */
      residualAdjusted: number
    }
  }
  byProduct: SalesBreakdownBucket[]
  bySeller: SalesBreakdownSeller[]
  byAgency: SalesBreakdownAgency[]
  byMonth: SalesBreakdownMonth[]
  byProductSeller: Array<{
    sellerId: string
    sellerName: string
    cells: Record<string, number>
  }>
  detail: SalesBreakdownDetailRow[]
}

export interface BuildSalesBreakdownReportParams {
  operations: SalesOperationRow[]
  itemsByOperation: Map<string, SalesOperationItemRow[]>
  serviceExtras: Record<string, { saleExtra: number; costExtra: number }>
  includeServices: boolean
  sellerNames: Map<string, string>
  agencyNames: Map<string, string>
  currency: string
  dateFrom: string
  dateTo: string
  truncated?: boolean
}

interface ProratedSlice {
  key: string
  sale: number
  cost: number
  costOtherCurrency: number
  items: number
}

interface ProratedOperation {
  slices: ProratedSlice[]
  source: AttributionSource
  residual: number
}

function currencyOf(op: SalesOperationRow): string {
  return op.sale_currency || op.currency || "USD"
}

function num(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Reparte la venta de una operación entre sus ítems. Exportada para poder
 * testear el invariante de suma en aislamiento.
 */
export function prorateOperation(
  op: SalesOperationRow,
  items: SalesOperationItemRow[],
  serviceExtra: { saleExtra: number; costExtra: number } | undefined
): ProratedOperation {
  const saleCurrency = currencyOf(op)
  const base = roundMoney(num(op.sale_amount_total))
  const slices: ProratedSlice[] = []

  // Los servicios adicionales van aparte, sin prorratear.
  const saleExtra = roundMoney(num(serviceExtra?.saleExtra))
  if (saleExtra > 0) {
    slices.push({
      key: SERVICES_BUCKET_KEY,
      sale: saleExtra,
      cost: roundMoney(num(serviceExtra?.costExtra)),
      costOtherCurrency: 0,
      items: 0,
    })
  }

  if (items.length === 0) {
    slices.push({
      key: normalizeProductType(op.product_type || op.type),
      sale: base,
      cost: roundMoney(num(op.operator_cost)),
      costOtherCurrency: 0,
      items: 0,
    })
    return { slices, source: "operation", residual: 0 }
  }

  // Orden determinístico: el mismo input siempre produce el mismo reparto.
  const ordered = [...items].sort((a, b) => {
    const ka = normalizeProductType(a.product_type)
    const kb = normalizeProductType(b.product_type)
    return ka.localeCompare(kb) || String(a.id).localeCompare(String(b.id))
  })

  let weights = ordered.map((item) => Math.max(0, num(item.sale_amount)))
  let source: AttributionSource = "item_sale"

  if (weights.reduce((acc, w) => acc + w, 0) <= 0) {
    const currencies = new Set(ordered.map((i) => i.cost_currency || saleCurrency))
    if (currencies.size === 1) {
      weights = ordered.map((item) => Math.max(0, num(item.cost)))
      source = "item_cost"
    } else {
      weights = ordered.map(() => 1)
      source = "even"
    }
  }
  if (weights.reduce((acc, w) => acc + w, 0) <= 0) {
    weights = ordered.map(() => 1)
    source = "even"
  }

  const totalWeight = weights.reduce((acc, w) => acc + w, 0)
  const shares = weights.map((w) => roundMoney((base * w) / totalWeight))

  // El residuo de redondeo lo absorbe el ítem de mayor peso.
  const residual = roundMoney(base - shares.reduce((acc, s) => acc + s, 0))
  if (residual !== 0) {
    let maxIndex = 0
    for (let i = 1; i < weights.length; i++) {
      if (weights[i] > weights[maxIndex]) maxIndex = i
    }
    shares[maxIndex] = roundMoney(shares[maxIndex] + residual)
  }

  ordered.forEach((item, i) => {
    // El costo NO se prorratea: cada ítem tiene el suyo. Si está en otra
    // moneda que la venta, no entra al margen y se informa aparte.
    const itemCurrency = item.cost_currency || saleCurrency
    const cost = roundMoney(num(item.cost))
    slices.push({
      key: normalizeProductType(item.product_type),
      sale: shares[i],
      cost: itemCurrency === saleCurrency ? cost : 0,
      costOtherCurrency: itemCurrency === saleCurrency ? 0 : cost,
      items: 1,
    })
  })

  return { slices, source, residual: Math.abs(residual) }
}

export function buildSalesBreakdownReport({
  operations,
  itemsByOperation,
  serviceExtras,
  includeServices,
  sellerNames,
  agencyNames,
  currency,
  dateFrom,
  dateTo,
  truncated = false,
}: BuildSalesBreakdownReportParams): SalesBreakdownReport {
  const inCurrency = operations.filter((op) => currencyOf(op) === currency)
  const otherCurrencyCode = currency === "ARS" ? "USD" : "ARS"
  const otherOps = operations.filter((op) => currencyOf(op) === otherCurrencyCode)

  const attribution = {
    operationsByItemSale: 0,
    operationsByItemCost: 0,
    operationsEven: 0,
    operationsWithoutItems: 0,
    itemsTotal: 0,
    residualAdjusted: 0,
  }

  interface BucketAcc {
    sale: number
    cost: number
    costOtherCurrency: number
    operations: Set<string>
    items: number
  }
  const productAcc = new Map<string, BucketAcc>()

  interface SellerAcc {
    sale: number
    cost: number
    operations: Set<string>
    secondarySale: number
    secondaryOperations: Set<string>
    otherCurrencySale: number
    byProduct: Map<string, number>
  }
  const sellerAcc = new Map<string, SellerAcc>()

  interface AgencyAcc {
    sale: number
    cost: number
    operations: Set<string>
    otherCurrencySale: number
  }
  const agencyAcc = new Map<string, AgencyAcc>()

  const monthAcc = new Map<
    string,
    { sale: number; cost: number; operations: Set<string> }
  >()

  const detail: SalesBreakdownDetailRow[] = []
  let totalSale = 0
  let totalCost = 0

  for (const op of inCurrency) {
    const items = itemsByOperation.get(op.id) ?? []
    const { slices, source, residual } = prorateOperation(op, items, serviceExtras[op.id])

    attribution.itemsTotal += items.length
    attribution.residualAdjusted = roundMoney(attribution.residualAdjusted + residual)
    if (source === "operation") attribution.operationsWithoutItems++
    else if (source === "item_sale") attribution.operationsByItemSale++
    else if (source === "item_cost") attribution.operationsByItemCost++
    else attribution.operationsEven++

    const opSale = roundMoney(slices.reduce((acc, s) => acc + s.sale, 0))
    const opCost = roundMoney(slices.reduce((acc, s) => acc + s.cost, 0))
    totalSale = roundMoney(totalSale + opSale)
    totalCost = roundMoney(totalCost + opCost)

    for (const slice of slices) {
      const acc =
        productAcc.get(slice.key) ??
        {
          sale: 0,
          cost: 0,
          costOtherCurrency: 0,
          operations: new Set<string>(),
          items: 0,
        }
      acc.sale = roundMoney(acc.sale + slice.sale)
      acc.cost = roundMoney(acc.cost + slice.cost)
      acc.costOtherCurrency = roundMoney(acc.costOtherCurrency + slice.costOtherCurrency)
      acc.operations.add(op.id)
      acc.items += slice.items
      productAcc.set(slice.key, acc)
    }

    // Vendedor: la venta entera se atribuye al principal para que
    // Σ bySeller.sale === summary.sale sea exacto. La participación del
    // secundario se informa aparte, sin sumar.
    const primaryId = op.seller_id || ""
    const primary =
      sellerAcc.get(primaryId) ??
      {
        sale: 0,
        cost: 0,
        operations: new Set<string>(),
        secondarySale: 0,
        secondaryOperations: new Set<string>(),
        otherCurrencySale: 0,
        byProduct: new Map<string, number>(),
      }
    primary.sale = roundMoney(primary.sale + opSale)
    primary.cost = roundMoney(primary.cost + opCost)
    primary.operations.add(op.id)
    for (const slice of slices) {
      primary.byProduct.set(
        slice.key,
        roundMoney((primary.byProduct.get(slice.key) || 0) + slice.sale)
      )
    }
    sellerAcc.set(primaryId, primary)

    if (op.seller_secondary_id) {
      const secondary =
        sellerAcc.get(op.seller_secondary_id) ??
        {
          sale: 0,
          cost: 0,
          operations: new Set<string>(),
          secondarySale: 0,
          secondaryOperations: new Set<string>(),
          otherCurrencySale: 0,
          byProduct: new Map<string, number>(),
        }
      secondary.secondarySale = roundMoney(secondary.secondarySale + opSale)
      secondary.secondaryOperations.add(op.id)
      sellerAcc.set(op.seller_secondary_id, secondary)
    }

    const agencyKey = op.agency_id || ""
    const agency =
      agencyAcc.get(agencyKey) ??
      { sale: 0, cost: 0, operations: new Set<string>(), otherCurrencySale: 0 }
    agency.sale = roundMoney(agency.sale + opSale)
    agency.cost = roundMoney(agency.cost + opCost)
    agency.operations.add(op.id)
    agencyAcc.set(agencyKey, agency)

    const monthKey = (op.operation_date || "").slice(0, 7)
    if (monthKey) {
      const month =
        monthAcc.get(monthKey) ?? { sale: 0, cost: 0, operations: new Set<string>() }
      month.sale = roundMoney(month.sale + opSale)
      month.cost = roundMoney(month.cost + opCost)
      month.operations.add(op.id)
      monthAcc.set(monthKey, month)
    }

    const products = slices
      .reduce<Array<{ key: string; sale: number }>>((acc, slice) => {
        const found = acc.find((p) => p.key === slice.key)
        if (found) found.sale = roundMoney(found.sale + slice.sale)
        else acc.push({ key: slice.key, sale: slice.sale })
        return acc
      }, [])
      .sort((a, b) => b.sale - a.sale)
      .map((p) => ({ key: p.key, label: productTypeLabel(p.key), sale: p.sale }))

    detail.push({
      operationId: op.id,
      fileCode: op.file_code || "-",
      date: op.operation_date || "",
      destination: op.destination || "-",
      sellerName: sellerNames.get(op.seller_id || "") || "Sin vendedor",
      agencyName: agencyNames.get(op.agency_id || "") || "Sin agencia",
      products,
      sale: opSale,
      cost: opCost,
      margin: roundMoney(opSale - opCost),
      marginPct: roundMoney(safeDiv(opSale - opCost, opSale) * 100, 1),
      prorated: source !== "operation" && slices.length > 1,
      attributionSource: source,
    })
  }

  // Ventas en la otra moneda, para no perderlas de vista sin mezclarlas.
  for (const op of otherOps) {
    const opSale = roundMoney(num(op.sale_amount_total))
    const primaryId = op.seller_id || ""
    const primary = sellerAcc.get(primaryId)
    if (primary) primary.otherCurrencySale = roundMoney(primary.otherCurrencySale + opSale)
    const agency = agencyAcc.get(op.agency_id || "")
    if (agency) agency.otherCurrencySale = roundMoney(agency.otherCurrencySale + opSale)
  }

  const byProduct: SalesBreakdownBucket[] = Array.from(productAcc.entries())
    .map(([key, acc]) => ({ key, ...acc }))
    .sort((a, b) => b.sale - a.sale || a.key.localeCompare(b.key))
    .map((row, i) => {
      const hasMixedCost = row.costOtherCurrency > 0
      const margin = hasMixedCost ? null : roundMoney(row.sale - row.cost)
      return {
        key: row.key,
        label: productTypeLabel(row.key),
        color: productTypeColor(row.key, i),
        sale: row.sale,
        cost: row.cost,
        margin,
        marginPct: margin != null ? roundMoney(safeDiv(margin, row.sale) * 100, 1) : null,
        costOtherCurrency: row.costOtherCurrency,
        operations: row.operations.size,
        items: row.items,
        share: roundMoney(safeDiv(row.sale, totalSale) * 100, 1),
      }
    })

  const bySeller: SalesBreakdownSeller[] = Array.from(sellerAcc.entries())
    .map(([sellerId, acc]) => ({ sellerId, acc }))
    .sort((a, b) => b.acc.sale - a.acc.sale)
    .map(({ sellerId, acc }, i) => ({
      sellerId,
      sellerName: sellerNames.get(sellerId) || "Sin vendedor",
      color: seriesColor(i),
      sale: acc.sale,
      cost: acc.cost,
      margin: roundMoney(acc.sale - acc.cost),
      marginPct: roundMoney(safeDiv(acc.sale - acc.cost, acc.sale) * 100, 1),
      operations: acc.operations.size,
      share: roundMoney(safeDiv(acc.sale, totalSale) * 100, 1),
      secondarySale: acc.secondarySale,
      secondaryOperations: acc.secondaryOperations.size,
      otherCurrencySale: acc.otherCurrencySale,
    }))

  const byAgency: SalesBreakdownAgency[] = Array.from(agencyAcc.entries())
    .map(([key, acc]) => ({
      agencyId: key || null,
      agencyName: key ? agencyNames.get(key) || "Sin agencia" : "Sin agencia",
      sale: acc.sale,
      cost: acc.cost,
      margin: roundMoney(acc.sale - acc.cost),
      marginPct: roundMoney(safeDiv(acc.sale - acc.cost, acc.sale) * 100, 1),
      operations: acc.operations.size,
      share: roundMoney(safeDiv(acc.sale, totalSale) * 100, 1),
      otherCurrencySale: acc.otherCurrencySale,
    }))
    .sort((a, b) => b.sale - a.sale || a.agencyName.localeCompare(b.agencyName))

  const monthKeys = monthKeysBetween(dateFrom, dateTo)
  const keys = monthKeys.length > 0 ? monthKeys : Array.from(monthAcc.keys()).sort()
  const byMonth: SalesBreakdownMonth[] = keys.map((key) => {
    const acc = monthAcc.get(key)
    return {
      key,
      label: monthLabel(key),
      sale: roundMoney(acc?.sale || 0),
      cost: roundMoney(acc?.cost || 0),
      margin: roundMoney((acc?.sale || 0) - (acc?.cost || 0)),
      operations: acc?.operations.size || 0,
    }
  })

  const byProductSeller = bySeller.map((seller) => {
    const acc = sellerAcc.get(seller.sellerId)
    const cells: Record<string, number> = {}
    for (const bucket of byProduct) {
      cells[bucket.key] = roundMoney(acc?.byProduct.get(bucket.key) || 0)
    }
    return { sellerId: seller.sellerId, sellerName: seller.sellerName, cells }
  })

  detail.sort(
    (a, b) => b.date.localeCompare(a.date) || a.fileCode.localeCompare(b.fileCode)
  )

  const otherSale = otherOps.reduce((acc, op) => acc + num(op.sale_amount_total), 0)

  return {
    currency,
    dateFrom,
    dateTo,
    summary: {
      sale: totalSale,
      cost: totalCost,
      margin: roundMoney(totalSale - totalCost),
      marginPct: roundMoney(safeDiv(totalSale - totalCost, totalSale) * 100, 1),
      operations: inCurrency.length,
      averageTicket: roundMoney(safeDiv(totalSale, inCurrency.length)),
      includeServices,
      truncated,
      otherCurrency: otherOps.length
        ? {
            currency: otherCurrencyCode,
            sale: roundMoney(otherSale),
            operations: otherOps.length,
          }
        : null,
      attribution,
    },
    byProduct,
    bySeller,
    byAgency,
    byMonth,
    byProductSeller,
    detail,
  }
}

export { SERVICES_BUCKET_KEY, UNSPECIFIED_BUCKET_KEY }
