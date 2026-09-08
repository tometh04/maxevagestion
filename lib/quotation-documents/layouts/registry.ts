import { editorialRightRailV1Layout } from "@/lib/quotation-documents/layouts/editorial-right-rail-v1"
import { vibookStandardV1Layout } from "@/lib/quotation-documents/layouts/standard-v1"
import { travelSummaryV1Layout } from "@/lib/quotation-documents/layouts/travel-summary-v1"
import type { QuotationLayoutCatalogEntry, QuotationLayoutRenderer } from "@/lib/quotation-documents/types"

const layouts: readonly QuotationLayoutRenderer[] = [
  vibookStandardV1Layout,
  editorialRightRailV1Layout,
  travelSummaryV1Layout,
]

const layoutByKey = new Map(layouts.map(layout => [layout.catalog.key, layout]))

export function getQuotationLayout(layoutKey: string): QuotationLayoutRenderer {
  const layout = layoutByKey.get(layoutKey)
  if (!layout) {
    throw new Error(`Layout de cotización no soportado: ${layoutKey}`)
  }
  return layout
}

export function getQuotationLayoutCatalog(): QuotationLayoutCatalogEntry[] {
  return layouts.map(layout => ({
    ...layout.catalog,
    supports: [...layout.catalog.supports],
  }))
}
