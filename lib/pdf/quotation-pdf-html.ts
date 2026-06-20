/**
 * Wrapper vibook para los templates HTML de cotización (quote-pdf-designs.ts).
 *
 * Genera el PDF con diseño WholeSale (HTML → html2canvas → jsPDF) para
 * cotizaciones de SOLO vuelos, SOLO hoteles o vuelo + hotel. Cualquier otro
 * contenido (excursiones, visas, paquetes, OTHER) debe seguir usando el
 * generador legacy de lib/pdf/quotation-pdf.ts — chequear con
 * isHtmlQuotePdfEligible() antes de llamar a downloadQuotationHtmlPDF().
 *
 * El branding (logo, color, datos de contacto) sale de organization_settings
 * de la org loggeada (GET /api/settings/organization).
 */

import {
  renderFlightsSimpleHtml,
  renderFlightsMultipleHtml,
  renderCombinedHtml,
  downloadPdfFromHtml,
  type BrandingData as QuotePdfBranding,
  type FlightTemplateData,
  type HotelTemplateData,
  type CombinedTemplateInput,
  type HotelSummaryCard,
  type AddonBreakdown,
  type QuoteAddons,
} from "@/lib/pdf/quote-pdf-designs"
import {
  type QuotationPresentationData,
  type QuotationPresentationItem,
  type QuotationPresentationOption,
  QUOTATION_MEAL_PLAN_LABELS,
  formatQuotationDateShort,
  normalizeQuotationForPresentation,
} from "@/lib/quotations/presentation"

export type OrganizationBrandingSettings = Record<string, string>

const FLIGHT_ITEM_TYPES = new Set(["FLIGHT"])
const HOTEL_ITEM_TYPES = new Set(["HOTEL", "ACCOMMODATION"])
// Items que los templates representan como flags "Incluye", no como secciones propias
const COMPANION_ITEM_TYPES = new Set(["TRANSFER", "ASSISTANCE", "INSURANCE"])

const LEG_FLIGHT_TYPE_LABELS: Record<string, string> = {
  outbound: "Ida",
  inbound: "Regreso",
  return: "Regreso",
  direct: "Directo",
  roundtrip: "Ida y vuelta",
}

// Los templates interpolan strings directo en HTML: escapamos acá los datos.
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// brand_color puede venir como hex ("#6366f1") o HSL Tailwind ("239 84% 67%").
// El segundo formato no es CSS válido al interpolarlo: convertir a hsl().
function normalizeCssColor(value: string, fallback: string): string {
  const v = value.trim()
  if (!v) return fallback
  const hsl = v.match(/^(\d+(?:\.\d+)?)(?:deg)?\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/)
  if (hsl) return `hsl(${hsl[1]}, ${hsl[2]}%, ${hsl[3]}%)`
  return v
}

function fmtDate(dateStr?: string | null): string {
  if (!dateStr) return ""
  try {
    return formatQuotationDateShort(dateStr)
  } catch {
    return dateStr
  }
}

function fmtAmount(amount: number): string {
  return Number(amount || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

// Adicionales globales (seguro/traslado) de la cotización. 0 → null para que
// el template no renderice esa fila/nota.
function fmtAddon(amount: number): string | null {
  return amount > 0 ? fmtAmount(amount) : null
}

function getQuotationAddons(data: QuotationPresentationData): {
  insurance: number
  transfer: number
  sum: number
} {
  const insurance = Math.max(0, Number(data.insurance_amount || 0))
  const transfer = Math.max(0, Number(data.transfer_amount || 0))
  return { insurance, transfer, sum: insurance + transfer }
}

/** Desglose Precio base / Seguro / Traslado / Total para boxes de total único. */
function buildAddonBreakdown(
  baseTotal: number,
  insurance: number,
  transfer: number,
  currency: string
): AddonBreakdown | undefined {
  if (insurance <= 0 && transfer <= 0) return undefined
  return {
    base: fmtAmount(baseTotal),
    insurance: fmtAddon(insurance),
    transfer: fmtAddon(transfer),
    total: fmtAmount(baseTotal + insurance + transfer),
    currency,
  }
}

/** Nota compacta "Incluye Seguro $X · Traslado $Y" para boxes por opción. */
function buildAddonNote(insurance: number, transfer: number, currency: string): QuoteAddons | undefined {
  if (insurance <= 0 && transfer <= 0) return undefined
  return { insurance: fmtAddon(insurance), transfer: fmtAddon(transfer), currency }
}

function computeNightsLabel(checkin?: string | null, checkout?: string | null): string {
  if (!checkin || !checkout) return ""
  const ci = new Date(`${checkin}T12:00:00`)
  const co = new Date(`${checkout}T12:00:00`)
  if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) return ""
  const diff = Math.round((co.getTime() - ci.getTime()) / 86400000)
  if (diff <= 0) return ""
  return `${diff} ${diff === 1 ? "Noche" : "Noches"}`
}

function isFlightItem(item: QuotationPresentationItem): boolean {
  return FLIGHT_ITEM_TYPES.has(item.item_type)
}

function isHotelItem(item: QuotationPresentationItem): boolean {
  return HOTEL_ITEM_TYPES.has(item.item_type)
}

function flightHasRenderableLegs(item: QuotationPresentationItem): boolean {
  const legs = item.flight_details?.legs
  return Array.isArray(legs) && legs.length > 0 && legs.some((leg) => leg?.departure && leg?.arrival)
}

/**
 * Una cotización es elegible para los templates HTML si TODAS sus opciones
 * contienen solo vuelos/hoteles (más traslados/asistencias, que se muestran
 * como flags) y hay al menos un vuelo renderizable o un hotel.
 */
export function isHtmlQuotePdfEligible(data: QuotationPresentationData): boolean {
  const options = data.options || []
  if (options.length === 0) return false

  let hasRenderableContent = false

  for (const option of options) {
    const items = option.items || []
    if (items.length === 0) return false

    for (const item of items) {
      if (isFlightItem(item)) {
        // Vuelos sin legs estructurados (solo screenshot/texto) se ven mejor
        // en el generador legacy, que muestra la imagen del itinerario.
        if (!flightHasRenderableLegs(item)) return false
        hasRenderableContent = true
      } else if (isHotelItem(item)) {
        if (!item.hotel_name && !item.destination_city) return false
        hasRenderableContent = true
      } else if (!COMPANION_ITEM_TYPES.has(item.item_type)) {
        return false
      }
    }
  }

  return hasRenderableContent
}

export function buildQuotePdfBranding(
  settings: OrganizationBrandingSettings,
  data: QuotationPresentationData
): QuotePdfBranding {
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const value = settings[key]
      if (typeof value === "string" && value.trim()) return value.trim()
    }
    return ""
  }

  const agencyName = get("company_name") || data.agency_name || "Agencia"
  const phone = get("company_phone", "phone")
  const email = get("company_email", "email")
  const instagram = get("company_instagram", "instagram")
  const legajo = get("company_legajo", "legajo")
  const taxId = get("company_tax_id", "tax_id")
  const address = get("company_address", "address")
  const website = get("company_website", "website")

  const contactLine = [phone && `Tel: ${phone}`, email].filter(Boolean).join(" · ")
  const fiscalLine = [
    instagram && `Instagram: ${instagram.startsWith("@") ? instagram : `@${instagram}`}`,
    legajo && `Legajo: ${legajo}`,
    taxId && `CUIT: ${taxId}`,
  ]
    .filter(Boolean)
    .join(" · ")

  const footerText = [agencyName, address, contactLine, website, fiscalLine]
    .filter(Boolean)
    .map(esc)
    .join("\n")

  const primaryColor = normalizeCssColor(get("brand_color"), "#f97316")

  return {
    agency_name: esc(agencyName),
    agency_logo_url: get("brand_logo"),
    agency_primary_color: primaryColor,
    agency_secondary_color: primaryColor,
    agency_contact_name: esc(data.seller_name || ""),
    agency_contact_email: esc(email),
    agency_contact_phone: esc(phone),
    pdf_footer_text: footerText,
  }
}

function buildAirlineCode(airline: string): string {
  const words = airline
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase()
  return airline.slice(0, 2).toUpperCase()
}

function mapFlightItem(
  item: QuotationPresentationItem,
  data: QuotationPresentationData,
  optionTotal: number
): FlightTemplateData {
  const rawLegs = item.flight_details?.legs || []

  const legs = rawLegs.map((leg) => ({
    departure: {
      city_code: esc(leg?.departure?.city_code || ""),
      city_name: esc(leg?.departure?.city_name || ""),
      time: esc(leg?.departure?.time || ""),
    },
    arrival: {
      city_code: esc(leg?.arrival?.city_code || ""),
      city_name: esc(leg?.arrival?.city_name || ""),
      time: esc(leg?.arrival?.time || ""),
    },
    duration: esc(leg?.duration || ""),
    flight_type: esc(
      LEG_FLIGHT_TYPE_LABELS[(leg?.flight_type || "").toLowerCase()] || leg?.flight_type || ""
    ),
    layovers: (leg?.layovers || []).map((l) => ({
      waiting_time: esc(l?.waiting_time || ""),
      destination_city: esc(l?.destination_city || ""),
      destination_code: esc(l?.destination_code || ""),
    })),
  }))

  const luggage = rawLegs.some((leg) =>
    (leg?.options || []).some((opt) =>
      (opt?.segments || []).some((seg) => {
        const baggage = (seg?.baggage || "").trim()
        return baggage !== "" && baggage !== "0"
      })
    )
  )

  const airlineName = item.airline || "Aerolínea"

  return {
    airline: { code: esc(buildAirlineCode(airlineName)), name: esc(airlineName) },
    departure_date: fmtDate(item.flight_date || data.departure_date),
    return_date: fmtDate(item.flight_return_date || data.return_date),
    luggage,
    adults: data.adults,
    childrens: data.children,
    legs,
    price: { amount: fmtAmount(optionTotal), currency: esc(data.currency) },
    travel_assistance: 0,
    transfers: 0,
  }
}

function mapHotelItem(item: QuotationPresentationItem, optionTotal: number): HotelTemplateData {
  return {
    name: esc(item.hotel_name || item.description || "Hotel"),
    stars: esc(item.hotel_stars != null ? String(item.hotel_stars) : "—"),
    location: esc(item.destination_city || item.hotel_address || ""),
    roomDescription: item.room_type ? esc(item.room_type) : undefined,
    mealPlan: item.meal_plan ? esc(QUOTATION_MEAL_PLAN_LABELS[item.meal_plan] || item.meal_plan) : null,
    price: fmtAmount(optionTotal),
  }
}

function optionHasItemType(option: QuotationPresentationOption, types: Set<string>): boolean {
  return (option.items || []).some((item) => types.has(item.item_type))
}

function getReferenceOption(data: QuotationPresentationData): QuotationPresentationOption {
  return data.options.find((o) => o.is_selected) || data.options[0]
}

function buildCombinedInput(data: QuotationPresentationData): CombinedTemplateInput {
  const referenceOption = getReferenceOption(data)
  const refItems = referenceOption.items || []
  const refFlights = refItems.filter(isFlightItem)
  const refHotels = refItems.filter(isHotelItem)
  const firstHotel = refHotels[0]

  const checkinIso = firstHotel?.checkin_date || data.departure_date
  const checkoutIso = firstHotel?.checkout_date || data.return_date

  const selectedFlights = refFlights.map((item) =>
    mapFlightItem(item, data, referenceOption.total_amount)
  )

  // Adicionales globales: se suman al total mostrado y se desglosan.
  const addons = getQuotationAddons(data)
  const currency = esc(data.currency)

  const input: CombinedTemplateInput = {
    selected_flights: selectedFlights,
    has_flights: selectedFlights.length > 0,
    checkin: fmtDate(checkinIso),
    checkout: fmtDate(checkoutIso),
    nights_label:
      firstHotel?.nights != null && firstHotel.nights > 0
        ? `${firstHotel.nights} ${firstHotel.nights === 1 ? "Noche" : "Noches"}`
        : computeNightsLabel(checkinIso, checkoutIso),
    adults: data.adults,
    childrens: data.children,
    infants: data.infants,
    total_price: fmtAmount(referenceOption.total_amount + addons.sum),
    total_currency: currency,
    travel_assistance:
      addons.insurance > 0 ||
      refItems.some((i) => i.item_type === "ASSISTANCE" || i.item_type === "INSURANCE")
        ? 1
        : 0,
    transfers:
      addons.transfer > 0 || refItems.some((i) => i.item_type === "TRANSFER") ? 1 : 0,
    hotel_destination: esc(firstHotel?.destination_city || data.destination || ""),
    addons: buildAddonBreakdown(referenceOption.total_amount, addons.insurance, addons.transfer, data.currency),
    addonNote: buildAddonNote(addons.insurance, addons.transfer, data.currency),
  }

  if (firstHotel?.meal_plan === "ALL_INCLUSIVE") {
    input.meal_plan = "all_inclusive"
  }

  // Varios hoteles dentro de la MISMA opción = segmentos del itinerario
  // (ej. Madrid + Barcelona). Opciones distintas = alternativas a elegir.
  if (refHotels.length > 1) {
    input.has_hotel_segments = true
    input.hotel_summary_cards = refHotels.map(
      (item): HotelSummaryCard => ({
        city: esc(item.destination_city || ""),
        short_dates: [fmtDate(item.checkin_date), fmtDate(item.checkout_date)]
          .filter(Boolean)
          .join(" - "),
        hotel_name: esc(item.hotel_name || ""),
        stars: esc(item.hotel_stars != null ? String(item.hotel_stars) : "—"),
        location: esc(item.destination_city || item.hotel_address || ""),
        room_description: item.room_type ? esc(item.room_type) : undefined,
        meal_plan: item.meal_plan
          ? esc(QUOTATION_MEAL_PLAN_LABELS[item.meal_plan] || item.meal_plan)
          : undefined,
      })
    )
    input.hotel_destinations_summary = esc(
      refHotels
        .map((item) => item.destination_city)
        .filter(Boolean)
        .join(" · ") || data.destination
    )
    return input
  }

  // Una alternativa de hotel por opción de cotización (máx 3 cards)
  const hotelOptions = data.options
    .filter((option) => optionHasItemType(option, HOTEL_ITEM_TYPES))
    .slice(0, 3)

  hotelOptions.forEach((option, index) => {
    const hotelItem = (option.items || []).find(isHotelItem)
    if (!hotelItem) return
    const hotel = mapHotelItem(hotelItem, option.total_amount)
    const total = fmtAmount(option.total_amount + addons.sum)
    if (index === 0) {
      input.option_1_hotel = hotel
      input.option_1_total = total
    } else if (index === 1) {
      input.option_2_hotel = hotel
      input.option_2_total = total
    } else {
      input.option_3_hotel = hotel
      input.option_3_total = total
    }
  })
  input.has_multiple_hotels = hotelOptions.length > 1

  return input
}

function buildQuotationHtml(data: QuotationPresentationData, branding: QuotePdfBranding): string {
  const hasAnyHotel = data.options.some((option) => optionHasItemType(option, HOTEL_ITEM_TYPES))

  if (hasAnyHotel) {
    return renderCombinedHtml(buildCombinedInput(data), branding)
  }

  // Solo vuelos: un FlightTemplateData por vuelo. El precio mostrado de cada
  // opción ya incluye los adicionales globales (seguro/traslado) — el desglose
  // se renderiza aparte (box en el caso simple, nota por opción en múltiples).
  const addons = getQuotationAddons(data)
  const flights = data.options.flatMap((option) =>
    (option.items || [])
      .filter(isFlightItem)
      .map((item) => mapFlightItem(item, data, option.total_amount + addons.sum))
  )

  const referenceOption = getReferenceOption(data)
  const refItems = referenceOption.items || []
  const flightsData = {
    selected_flights: flights,
    travel_assistance:
      addons.insurance > 0 ||
      refItems.some((i) => i.item_type === "ASSISTANCE" || i.item_type === "INSURANCE")
        ? 1
        : 0,
    transfers:
      addons.transfer > 0 || refItems.some((i) => i.item_type === "TRANSFER") ? 1 : 0,
  }

  if (flights.length === 1) {
    return renderFlightsSimpleHtml(
      {
        ...flightsData,
        addons: buildAddonBreakdown(
          referenceOption.total_amount,
          addons.insurance,
          addons.transfer,
          data.currency
        ),
      },
      branding
    )
  }
  return renderFlightsMultipleHtml(
    { ...flightsData, addonNote: buildAddonNote(addons.insurance, addons.transfer, data.currency) },
    branding
  )
}

/**
 * Devuelve el HTML del template de cotización (mismo diseño que el PDF) para
 * embeberlo en pantalla (página pública). Es un string puro: NO dispara
 * html2canvas/jspdf, así que es seguro de llamar en render. Usar solo si
 * isHtmlQuotePdfEligible(data) es true.
 */
export function renderQuotationHtmlDocument(
  data: QuotationPresentationData,
  settings: OrganizationBrandingSettings
): string {
  const branding = buildQuotePdfBranding(settings, data)
  return buildQuotationHtml(data, branding)
}

/**
 * Genera y descarga el PDF de cotización con los templates HTML.
 * Llamar solo si isHtmlQuotePdfEligible(data) es true.
 */
export async function downloadQuotationHtmlPDF(
  data: QuotationPresentationData,
  settings: OrganizationBrandingSettings
): Promise<void> {
  const branding = buildQuotePdfBranding(settings, data)
  const html = buildQuotationHtml(data, branding)
  if (!html) {
    throw new Error("No se pudo generar el HTML de la cotización")
  }
  const filename = `cotizacion-${data.quotation_number || "presupuesto"}.pdf`
  await downloadPdfFromHtml(html, filename)
}

/**
 * Branding de la org loggeada (logo, color, datos de empresa) desde
 * organization_settings vía el endpoint autenticado. No usar
 * /api/public/branding sin token: devuelve {} y el PDF sale sin branding.
 */
export async function fetchOrganizationBrandingSettings(): Promise<OrganizationBrandingSettings> {
  const res = await fetch("/api/settings/organization")
  if (!res.ok) return {}
  const json = await res.json()
  const settings: OrganizationBrandingSettings = {}
  for (const row of json.data || []) {
    if (row?.key != null) settings[row.key] = row.value ?? ""
  }
  return settings
}

/**
 * Intenta generar el PDF HTML (vuelos/hoteles) para una cotización por id.
 * Devuelve false si la cotización no es elegible — el caller decide su
 * fallback (vista print pública o generador legacy).
 */
export async function tryDownloadQuotationHtmlPDFById(quotationId: string): Promise<boolean> {
  const res = await fetch(`/api/quotations/${quotationId}`)
  if (!res.ok) throw new Error("Error obteniendo la cotización")
  const json = await res.json()
  const data = normalizeQuotationForPresentation(json.data)
  if (!isHtmlQuotePdfEligible(data)) return false
  const settings = await fetchOrganizationBrandingSettings()
  await downloadQuotationHtmlPDF(data, settings)
  return true
}
