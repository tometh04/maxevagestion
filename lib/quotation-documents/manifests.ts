import { parseQuotationModelManifest } from "@/lib/quotation-documents/schemas"
import type { QuotationModelManifestV1 } from "@/lib/quotation-documents/types"
import { cloneQuotationJson } from "@/lib/quotation-documents/clone"

const STANDARD_BLOCKS: QuotationModelManifestV1["blocks"] = [
  { kind: "hero", visible: true, emptyPolicy: "reject" },
  { kind: "trip-summary", visible: true, emptyPolicy: "reject" },
  { kind: "flight-options", visible: true, emptyPolicy: "hide" },
  { kind: "hotel-options", visible: true, emptyPolicy: "hide" },
  { kind: "services-included", visible: true, emptyPolicy: "hide" },
  { kind: "pricing", visible: true, emptyPolicy: "reject" },
  { kind: "itinerary", visible: true, emptyPolicy: "hide", pageBreakBefore: true },
  { kind: "recommendations", visible: true, emptyPolicy: "hide" },
  { kind: "restrictions", visible: true, emptyPolicy: "hide" },
  { kind: "legal-terms", visible: true, emptyPolicy: "hide" },
  { kind: "payment-schedule", visible: true, emptyPolicy: "hide" },
  { kind: "advisor-signature", visible: true, emptyPolicy: "hide" },
]

export const VIBOOK_STANDARD_MANIFEST: QuotationModelManifestV1 = parseQuotationModelManifest({
  schemaVersion: 1,
  documentKind: "quotation",
  layoutKey: "vibook-standard-v1",
  layoutVersion: 1,
  locale: "es-AR",
  theme: {
    primaryColor: "#1E3A5F",
    secondaryColor: "#526579",
    accentColor: "#D89035",
    paperColor: "#FCFCFA",
    textColor: "#25313C",
    fontFamily: "INTER",
  },
  assets: {},
  branding: {},
  copy: {
    documentTitle: "Propuesta de viaje",
    availabilityNote: "Cotización sujeta a disponibilidad al momento de reservar.",
    priceDisclaimer: "Los importes y condiciones se confirman al momento de reservar.",
  },
  blocks: STANDARD_BLOCKS,
})

export const KYO_2026_MANIFEST: QuotationModelManifestV1 = parseQuotationModelManifest({
  schemaVersion: 1,
  documentKind: "quotation",
  layoutKey: "editorial-right-rail-v1",
  layoutVersion: 1,
  locale: "es-AR",
  theme: {
    primaryColor: "#153B5B",
    secondaryColor: "#9D765D",
    accentColor: "#CC661B",
    paperColor: "#FCFCFA",
    textColor: "#243746",
    fontFamily: "OPEN_SANS",
  },
  assets: {
    backgroundPath: "/quotation-models/kyo-2026/background.jpg",
  },
  branding: {
    displayName: "KYO Viajes y Turismo",
    travelLicense: "Leg. 13123",
  },
  copy: {
    documentTitle: "Presupuesto de viaje",
    availabilityNote: "Cotización sujeta a disponibilidad y modificaciones al momento de reservar.",
    priceDisclaimer: "Tarifas expresadas en la moneda indicada. Consultar condiciones de pago y cancelación.",
  },
  blocks: STANDARD_BLOCKS,
})

export const EDITORIAL_GENERIC_MANIFEST: QuotationModelManifestV1 = parseQuotationModelManifest({
  ...cloneQuotationJson(VIBOOK_STANDARD_MANIFEST),
  layoutKey: "editorial-right-rail-v1",
  theme: {
    primaryColor: "#1E3A5F",
    secondaryColor: "#6B7783",
    accentColor: "#D89035",
    paperColor: "#FCFCFA",
    textColor: "#25313C",
    fontFamily: "OPEN_SANS",
  },
  assets: {},
  branding: {},
})

export function createDefaultManifest(layoutKey: string): QuotationModelManifestV1 {
  if (layoutKey === KYO_2026_MANIFEST.layoutKey) {
    return cloneQuotationJson(EDITORIAL_GENERIC_MANIFEST)
  }
  return cloneQuotationJson(VIBOOK_STANDARD_MANIFEST)
}
