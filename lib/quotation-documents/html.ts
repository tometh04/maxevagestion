import type {
  QuotationDocumentDataV1,
  QuotationDocumentItem,
  QuotationDocumentOption,
  QuotationModelManifestV1,
} from "@/lib/quotation-documents/types"
import { getQuotationCustomerTotal } from "@/lib/quotations/totals"

export const A4_WIDTH_PX = 794
export const A4_HEIGHT_PX = 1123
export const OPEN_SANS_FONT_ASSET_PATH = "/quotation-models/fonts/open-sans/open-sans-latin-400-800.woff2"

const OPEN_SANS_FONT_FAMILY = "Vibook Open Sans"

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export function safeImageSource(value: unknown): string | null {
  const source = String(value ?? "").trim()
  if (!source) return null
  if (/^\/[A-Za-z0-9/_\-.]+$/.test(source)) return source
  if (source.length <= 7 * 1024 * 1024 && /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(source)) return source

  try {
    const url = new URL(source)
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

export function formatDocumentDate(value?: string | null, long = false): string {
  if (!value) return ""
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("es-AR", long
    ? { day: "numeric", month: "long", year: "numeric" }
    : { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function formatDocumentMoney(amount: number, currency: string): string {
  const value = Number.isFinite(amount) ? amount : 0
  const prefix = currency === "USD" ? "USD" : currency === "ARS" ? "$" : currency
  return `${prefix} ${value.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`.trim()
}

export function getDocumentOptionPricing(
  model: QuotationDocumentDataV1,
  option: QuotationDocumentOption
): {
  baseAmount: number
  addonsAmount: number
  finalTotalAmount: number
  primaryAmount: number
  primaryLabel: string
  secondaryAmount?: number
  secondaryLabel?: string
} {
  const baseAmount = Number(option.totalAmount || 0)
  const addonsAmount = Number(model.commercial.insuranceAmount || 0)
    + Number(model.commercial.transferAmount || 0)
  const finalTotalAmount = getQuotationCustomerTotal(
    { total_amount: baseAmount },
    {
      insuranceAmount: model.commercial.insuranceAmount,
      transferAmount: model.commercial.transferAmount,
    }
  )
  const passengers = model.trip.adults + model.trip.children + model.trip.infants
  const perPerson = passengers > 0 ? finalTotalAmount / passengers : finalTotalAmount

  if (model.commercial.pricingMode === "PER_PERSON" && passengers > 0) {
    return {
      baseAmount,
      addonsAmount,
      finalTotalAmount,
      primaryAmount: perPerson,
      primaryLabel: "Precio por persona",
      secondaryAmount: passengers > 1 ? finalTotalAmount : undefined,
      secondaryLabel: passengers > 1 ? "Precio total" : undefined,
    }
  }

  return {
    baseAmount,
    addonsAmount,
    finalTotalAmount,
    primaryAmount: finalTotalAmount,
    primaryLabel: "Precio total",
    secondaryAmount: passengers > 1 ? perPerson : undefined,
    secondaryLabel: passengers > 1 ? "Precio por persona" : undefined,
  }
}

export function isDocumentBlockVisible(
  manifest: QuotationModelManifestV1,
  kind: QuotationModelManifestV1["blocks"][number]["kind"]
): boolean {
  return manifest.blocks.some(block => block.kind === kind && block.visible)
}

export function getDocumentBranding(
  model: QuotationDocumentDataV1,
  manifest: QuotationModelManifestV1
): QuotationDocumentDataV1["agency"] {
  return {
    ...model.agency,
    name: manifest.branding.displayName || model.agency.name,
    logoUrl: manifest.assets.logoPath || model.agency.logoUrl,
    phone: manifest.branding.phone || model.agency.phone,
    email: manifest.branding.email || model.agency.email,
    website: manifest.branding.website || model.agency.website,
    instagram: manifest.branding.instagram || model.agency.instagram,
    address: manifest.branding.address || model.agency.address,
    legalName: manifest.branding.legalName || model.agency.legalName,
    taxId: manifest.branding.taxId || model.agency.taxId,
    travelLicense: manifest.branding.travelLicense || model.agency.travelLicense,
  }
}

export function optionItemVisible(
  item: QuotationDocumentItem,
  manifest: QuotationModelManifestV1
): boolean {
  if (item.type === "FLIGHT") return isDocumentBlockVisible(manifest, "flight-options")
  if (item.type === "HOTEL" || item.type === "ACCOMMODATION") {
    return isDocumentBlockVisible(manifest, "hotel-options")
  }
  return isDocumentBlockVisible(manifest, "services-included")
}

export function passengerSummary(model: QuotationDocumentDataV1): string {
  const parts = [`${model.trip.adults} adulto${model.trip.adults === 1 ? "" : "s"}`]
  if (model.trip.children > 0) parts.push(`${model.trip.children} menor${model.trip.children === 1 ? "" : "es"}`)
  if (model.trip.infants > 0) parts.push(`${model.trip.infants} bebé${model.trip.infants === 1 ? "" : "s"}`)
  return parts.join(", ")
}

export function itemLabel(item: QuotationDocumentItem): string {
  const labels: Record<string, string> = {
    FLIGHT: "Vuelo",
    HOTEL: "Alojamiento",
    ACCOMMODATION: "Alojamiento",
    TRANSFER: "Traslado",
    ASSISTANCE: "Asistencia al viajero",
    INSURANCE: "Seguro de viaje",
    EXCURSION: "Excursión",
    ACTIVITY: "Actividad",
    VISA: "Visa",
    OTHER: "Servicio",
  }
  return labels[item.type] || "Servicio"
}

export function splitTextAtWord(value: string, maxChars: number): string[] {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) return []
  if (normalized.length <= maxChars) return [normalized]

  const words = normalized.split(" ")
  const chunks: string[] = []
  let current = ""
  for (const word of words) {
    if (word.length > maxChars) {
      if (current) {
        chunks.push(current)
        current = ""
      }
      for (let offset = 0; offset < word.length; offset += maxChars) {
        const fragment = word.slice(offset, offset + maxChars)
        if (fragment.length === maxChars) chunks.push(fragment)
        else current = fragment
      }
      continue
    }
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      chunks.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) chunks.push(current)
  return chunks
}

/**
 * Aclara (ratio > 0) u oscurece (ratio < 0) un color hexadecimal mezclándolo
 * con blanco o negro. Permite derivar bordes, fondos y sombras de la paleta del
 * manifiesto sin agregar colores nuevos al vocabulario configurable.
 */
export function shadeColor(hex: string, ratio: number): string {
  const value = hex.replace("#", "")
  const channels = [0, 2, 4].map(offset => parseInt(value.slice(offset, offset + 2), 16))
  const target = ratio < 0 ? 0 : 255
  const amount = Math.min(1, Math.abs(ratio))
  return `#${channels
    .map(channel => Math.round(channel + (target - channel) * amount).toString(16).padStart(2, "0"))
    .join("")}`
}

/**
 * Alto estimado de un párrafo, en píxeles, para paginar sin navegador.
 * El ancho medio de carácter de Open Sans ronda 0,52em; el resultado se usa
 * como peso de bloque y conviene que sobreestime antes que quedarse corto,
 * porque una página con overflow recorta contenido en silencio.
 */
export function estimateTextHeight(
  value: string,
  boxWidth: number,
  fontPx: number,
  lineHeight: number
): number {
  const perLine = Math.max(8, Math.floor(boxWidth / (fontPx * 0.52)))
  const lines = Math.max(1, Math.ceil(value.length / perLine))
  return lines * Math.round(fontPx * lineHeight)
}

export function chunkByWeight<T>(
  values: readonly T[],
  weight: (value: T) => number,
  maxWeight: number
): T[][] {
  const chunks: T[][] = []
  let current: T[] = []
  let currentWeight = 0

  for (const value of values) {
    const valueWeight = Math.max(1, weight(value))
    if (current.length > 0 && currentWeight + valueWeight > maxWeight) {
      chunks.push(current)
      current = []
      currentWeight = 0
    }
    current.push(value)
    currentWeight += valueWeight
  }

  if (current.length > 0) chunks.push(current)
  return chunks
}

export function baseDocumentStyle(manifest: QuotationModelManifestV1): string {
  const usesOpenSans = manifest.theme.fontFamily === "OPEN_SANS"
  const fontFamily = usesOpenSans
    ? `'${OPEN_SANS_FONT_FAMILY}','Segoe UI',Arial,sans-serif`
    : manifest.theme.fontFamily === "INTER"
      ? "Inter,'Segoe UI',Arial,sans-serif"
      : "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"
  const fontFace = usesOpenSans
    ? `@font-face{font-family:'${OPEN_SANS_FONT_FAMILY}';font-style:normal;font-weight:400 800;font-stretch:100%;font-display:block;src:url('${OPEN_SANS_FONT_ASSET_PATH}') format('woff2')}`
    : ""

  return `
    ${fontFace}
    *{box-sizing:border-box}
    .quotation-document{margin:0;padding:0;background:#e8e8e8;font-family:${fontFamily};color:${manifest.theme.textColor}}
    .quotation-page{position:relative;width:${A4_WIDTH_PX}px;height:${A4_HEIGHT_PX}px;min-height:${A4_HEIGHT_PX}px;max-height:${A4_HEIGHT_PX}px;overflow:hidden;background:${manifest.theme.paperColor};break-inside:avoid;page-break-inside:avoid}
    @media print{
      @page{size:A4 portrait;margin:0}
      html,body,.quotation-document{margin:0!important;padding:0!important;background:${manifest.theme.paperColor}!important}
      .quotation-page{width:210mm!important;height:296.8mm!important;min-height:296.8mm!important;max-height:296.8mm!important;box-shadow:none!important;margin:0!important;break-before:page!important;page-break-before:always!important;break-after:auto!important;page-break-after:auto!important}
    }
  `
}

export function wrapDocument(pages: string[], manifest: QuotationModelManifestV1): string {
  return `<div class="quotation-document" data-quotation-layout="${escapeHtml(manifest.layoutKey)}">
    <style>${baseDocumentStyle(manifest)}</style>
    ${pages.join("")}
  </div>`
}

export function countRenderedPages(html: string): number {
  return (html.match(/data-pdf-page/g) || []).length
}
