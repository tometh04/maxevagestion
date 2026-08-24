import {
  chunkByWeight,
  escapeHtml,
  formatDocumentDate,
  formatDocumentMoney,
  getDocumentBranding,
  getDocumentOptionPricing,
  isDocumentBlockVisible,
  itemLabel,
  passengerSummary,
  safeImageSource,
  splitTextAtWord,
  wrapDocument,
} from "@/lib/quotation-documents/html"
import type {
  QuotationDocumentDataV1,
  QuotationDocumentItem,
  QuotationDocumentOption,
  QuotationLayoutRenderer,
  QuotationModelManifestV1,
} from "@/lib/quotation-documents/types"

function page(
  manifest: QuotationModelManifestV1,
  pageNumber: number,
  kind: string,
  body: string
): string {
  return `<section class="quotation-page kyo-page kyo-page--${escapeHtml(kind)}" data-pdf-page="${pageNumber}" style="background-color:${manifest.theme.paperColor}">
    <div class="kyo-safe-area">${body}</div>
    <div class="kyo-page-number">${pageNumber}</div>
  </section>`
}

function sectionTitle(title: string, eyebrow?: string): string {
  return `<header class="kyo-section-title">
    ${eyebrow ? `<span>${escapeHtml(eyebrow)}</span>` : ""}
    <h2>${escapeHtml(title)}</h2>
  </header>`
}

function tripDates(model: QuotationDocumentDataV1): string {
  if (!model.trip.returnDate) return formatDocumentDate(model.trip.departureDate, true)
  return `${formatDocumentDate(model.trip.departureDate, true)} al ${formatDocumentDate(model.trip.returnDate, true)}`
}

function flightItems(option?: QuotationDocumentOption): QuotationDocumentItem[] {
  return (option?.items || []).filter(item => item.type === "FLIGHT")
}

function hotelItems(option?: QuotationDocumentOption): QuotationDocumentItem[] {
  return (option?.items || []).filter(item => item.type === "HOTEL" || item.type === "ACCOMMODATION")
}

function otherItems(option?: QuotationDocumentOption): QuotationDocumentItem[] {
  return (option?.items || []).filter(item => !["FLIGHT", "HOTEL", "ACCOMMODATION"].includes(item.type))
}

function renderFlight(item: QuotationDocumentItem, continuation = false): string {
  const flight = item.flight
  const screenshot = safeImageSource(flight?.screenshotUrl)
  const legs = flight?.legs || []

  return `<article class="kyo-flight">
    <div class="kyo-flight-head">
      <div><span>Vuelo${continuation ? " · continuación" : ""}</span><strong>${escapeHtml(flight?.airline || item.provider || "Itinerario aéreo")}</strong></div>
      ${flight?.cabin ? `<small>${escapeHtml(flight.cabin)}</small>` : ""}
    </div>
    ${legs.length > 0 ? `<div class="kyo-flight-legs">${legs.map((leg, index) => `<div class="kyo-flight-leg">
      <span class="kyo-leg-index">${index + 1}</span>
      <div><b>${escapeHtml(leg.departureCode || leg.departureCity || "Origen")}</b><small>${escapeHtml(leg.departureCity || "")}</small><time>${escapeHtml(leg.departureTime || "")}</time></div>
      <div class="kyo-route-line"><i></i><span>✈</span><i></i>${leg.duration ? `<small>${escapeHtml(leg.duration)}</small>` : ""}</div>
      <div><b>${escapeHtml(leg.arrivalCode || leg.arrivalCity || "Destino")}</b><small>${escapeHtml(leg.arrivalCity || "")}</small><time>${escapeHtml(leg.arrivalTime || "")}</time></div>
      ${leg.baggage ? `<div class="kyo-baggage">Equipaje: ${escapeHtml(leg.baggage)}</div>` : ""}
    </div>`).join("")}</div>` : screenshot ? `<img class="kyo-flight-shot" src="${escapeHtml(screenshot)}" alt="Detalle del vuelo"/>` : `<p>${escapeHtml(item.description || flight?.route || "Vuelo incluido")}</p>`}
  </article>`
}

interface FlightFragment {
  item: QuotationDocumentItem
  continuation: boolean
}

function expandFlightFragments(items: QuotationDocumentItem[]): FlightFragment[] {
  return items.flatMap(item => {
    const legs = item.flight?.legs || []
    if (legs.length > 0) {
      const chunks = chunkByWeight(legs, () => 1, 2)
      return chunks.map((legChunk, index) => ({
        item: {
          ...item,
          flight: item.flight ? { ...item.flight, legs: legChunk } : undefined,
        },
        continuation: index > 0,
      }))
    }

    if (!item.flight?.screenshotUrl) {
      const descriptions = splitTextAtWord(item.description || item.flight?.route || "Vuelo incluido", 900)
      if (descriptions.length > 1) {
        return descriptions.map((description, index) => ({
          item: { ...item, description },
          continuation: index > 0,
        }))
      }
    }

    return [{ item, continuation: false }]
  })
}

function renderHotel(item: QuotationDocumentItem): string {
  const hotel = item.hotel
  const details = [
    hotel?.destination,
    hotel?.roomType,
    hotel?.mealPlan,
    hotel?.nights ? `${hotel.nights} noches` : undefined,
    hotel?.rooms ? `${hotel.rooms} habitación${hotel.rooms === 1 ? "" : "es"}` : undefined,
  ].filter(Boolean)

  return `<div class="kyo-hotel">
    <div class="kyo-hotel-icon">⌂</div>
    <div><h4>${escapeHtml(hotel?.name || item.description || "Alojamiento")}${hotel?.stars ? ` <span>${"★".repeat(Math.min(5, Math.round(hotel.stars)))}</span>` : ""}</h4>
    ${details.length > 0 ? `<p>${details.map(escapeHtml).join(" · ")}</p>` : ""}
    ${hotel?.checkinDate || hotel?.checkoutDate ? `<small>${escapeHtml(formatDocumentDate(hotel.checkinDate))}${hotel?.checkoutDate ? ` al ${escapeHtml(formatDocumentDate(hotel.checkoutDate))}` : ""}</small>` : ""}</div>
  </div>`
}

function renderManifestOption(
  model: QuotationDocumentDataV1,
  option: QuotationDocumentOption,
  manifest: QuotationModelManifestV1,
  continuation = false
): string {
  const hotels = hotelItems(option)
  const extras = otherItems(option)
  const pricing = getDocumentOptionPricing(model, option)
  return `<article class="kyo-option">
    <div class="kyo-option-head"><div><span>Alternativa ${option.number}${continuation ? " · continuación" : ""}</span><h3>${escapeHtml(option.title)}</h3></div>${isDocumentBlockVisible(manifest, "pricing") ? `<div class="kyo-option-price"><span>${escapeHtml(pricing.primaryLabel)}</span><strong>${escapeHtml(formatDocumentMoney(pricing.primaryAmount, model.commercial.currency))}</strong>${pricing.secondaryAmount != null ? `<small>${escapeHtml(pricing.secondaryLabel)}: ${escapeHtml(formatDocumentMoney(pricing.secondaryAmount, model.commercial.currency))}</small>` : ""}</div>` : ""}</div>
    ${isDocumentBlockVisible(manifest, "hotel-options") ? hotels.map(renderHotel).join("") : ""}
    ${isDocumentBlockVisible(manifest, "services-included") && extras.length > 0 ? `<ul>${extras.map(item => `<li><b>${escapeHtml(itemLabel(item))}:</b> ${escapeHtml(item.description || item.transfer?.description || item.provider || "Incluido")}</li>`).join("")}</ul>` : ""}
    ${isDocumentBlockVisible(manifest, "pricing") && pricing.addonsAmount > 0 ? `<div class="kyo-option-breakdown"><span>Servicios ${escapeHtml(formatDocumentMoney(pricing.baseAmount, model.commercial.currency))}</span>${model.commercial.insuranceAmount > 0 ? `<span>Seguro ${escapeHtml(formatDocumentMoney(model.commercial.insuranceAmount, model.commercial.currency))}</span>` : ""}${model.commercial.transferAmount > 0 ? `<span>Traslado ${escapeHtml(formatDocumentMoney(model.commercial.transferAmount, model.commercial.currency))}</span>` : ""}</div>` : ""}
  </article>`
}

interface OptionFragment {
  option: QuotationDocumentOption
  continuation: boolean
  weight: number
}

function splitOptionItem(item: QuotationDocumentItem): QuotationDocumentItem[] {
  if (item.type === "HOTEL" || item.type === "ACCOMMODATION") return [item]
  const source = item.description || item.transfer?.description || item.provider || "Incluido"
  const chunks = splitTextAtWord(source, 650)
  if (chunks.length <= 1) return [item]
  return chunks.map(description => ({
    ...item,
    description,
    transfer: item.transfer ? { ...item.transfer, description } : item.transfer,
  }))
}

function optionFragments(
  option: QuotationDocumentOption,
  manifest: QuotationModelManifestV1
): OptionFragment[] {
  const visibleItems = option.items.filter(item => {
    if (item.type === "FLIGHT") return false
    if (item.type === "HOTEL" || item.type === "ACCOMMODATION") {
      return isDocumentBlockVisible(manifest, "hotel-options")
    }
    return isDocumentBlockVisible(manifest, "services-included")
  }).flatMap(splitOptionItem)

  const chunks = chunkByWeight(
    visibleItems,
    item => 150
      + item.description.length
      + (item.hotel?.name?.length || 0)
      + (item.hotel?.roomType?.length || 0)
      + (item.hotel?.mealPlan?.length || 0),
    900
  )
  const effectiveChunks = chunks.length > 0 ? chunks : [[]]
  return effectiveChunks.map((items, index) => ({
    option: { ...option, items },
    continuation: index > 0,
    weight: 300 + items.reduce((sum, item) => (
      sum + 150 + item.description.length + (item.hotel?.name?.length || 0)
    ), 0),
  }))
}

function splitListValues(values: string[], maxChars = 750): string[] {
  return values.flatMap(value => splitTextAtWord(value, maxChars))
}

function derivedInclusions(model: QuotationDocumentDataV1): string[] {
  if (model.narrative.inclusions.length > 0) return model.narrative.inclusions
  const values = new Set<string>()
  const referenceItems = model.options[0]?.items || []
  for (const item of referenceItems) {
    const detail = item.description || item.hotel?.name || item.flight?.airline || item.transfer?.description
    values.add(detail ? `${itemLabel(item)}: ${detail}` : itemLabel(item))
  }
  if (model.commercial.insuranceAmount > 0) values.add("Asistencia al viajero")
  if (model.commercial.transferAmount > 0) values.add("Traslados")
  return Array.from(values)
}

function renderBulletSection(title: string, values: string[]): string {
  if (values.length === 0) return ""
  return `<section class="kyo-bullets"><h3>${escapeHtml(title)}</h3><ul>${values.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul></section>`
}

interface ItineraryFragment {
  day: number
  date?: string
  title: string
  description: string
  continuation: boolean
}

function itineraryFragments(model: QuotationDocumentDataV1): ItineraryFragment[] {
  return model.narrative.itinerary.flatMap(item => {
    const chunks = splitTextAtWord(item.description, 1_100)
    return (chunks.length > 0 ? chunks : [""]).map((description, index) => ({
      ...item,
      description,
      continuation: index > 0,
    }))
  })
}

function renderItineraryPage(fragments: ItineraryFragment[]): string {
  return `<div class="kyo-itinerary">${fragments.map(fragment => `<article>
    <div class="kyo-day-number"><span>Día</span><strong>${fragment.day}</strong></div>
    <div class="kyo-day-copy"><h3>${escapeHtml(fragment.title)}${fragment.continuation ? " (continuación)" : ""}</h3>
    ${fragment.date ? `<time>${escapeHtml(formatDocumentDate(fragment.date, true))}</time>` : ""}
    <p>${escapeHtml(fragment.description)}</p></div>
  </article>`).join("")}</div>`
}

interface ClosingSection {
  html: string
  weight: number
}

function buildCommercialClosingFragments(
  model: QuotationDocumentDataV1,
  manifest: QuotationModelManifestV1
): string[] {
  const reference = model.options.find(option => option.selected) || model.options[0]
  const pricing = reference ? getDocumentOptionPricing(model, reference) : null
  const price = pricing ? formatDocumentMoney(pricing.primaryAmount, model.commercial.currency) : "A confirmar"
  const brand = getDocumentBranding(model, manifest)
  const sections: ClosingSection[] = []

  splitTextAtWord(manifest.copy.availabilityNote, 550).forEach(text => {
    sections.push({ html: `<p class="kyo-availability">${escapeHtml(text)}</p>`, weight: 80 + text.length })
  })

  if (isDocumentBlockVisible(manifest, "pricing")) {
    sections.push({
      html: `<section class="kyo-closing-price">
    <span>${escapeHtml(pricing?.primaryLabel || "Valor final")}</span><strong>${escapeHtml(price)}</strong>
    ${pricing?.secondaryAmount != null ? `<p><b>${escapeHtml(pricing.secondaryLabel)}:</b> ${escapeHtml(formatDocumentMoney(pricing.secondaryAmount, model.commercial.currency))}</p>` : ""}
    ${pricing && pricing.addonsAmount > 0 ? `<p>Servicios ${escapeHtml(formatDocumentMoney(pricing.baseAmount, model.commercial.currency))}${model.commercial.insuranceAmount > 0 ? ` · Seguro ${escapeHtml(formatDocumentMoney(model.commercial.insuranceAmount, model.commercial.currency))}` : ""}${model.commercial.transferAmount > 0 ? ` · Traslado ${escapeHtml(formatDocumentMoney(model.commercial.transferAmount, model.commercial.currency))}` : ""}</p>` : ""}
  </section>`,
      weight: 320,
    })
    if (manifest.copy.priceDisclaimer) {
      splitTextAtWord(manifest.copy.priceDisclaimer, 550).forEach(text => {
        sections.push({ html: `<p class="kyo-price-copy">${escapeHtml(text)}</p>`, weight: 80 + text.length })
      })
    }
  }

  if (isDocumentBlockVisible(manifest, "payment-schedule")) {
    sections.push({
      html: `<div class="kyo-payment-grid">
    ${model.commercial.depositAmount != null ? `<div><span>Seña</span><strong>${escapeHtml(formatDocumentMoney(model.commercial.depositAmount, model.commercial.currency))}</strong></div>` : ""}
    ${model.commercial.balanceDueDate ? `<div><span>Fecha límite de pago</span><strong>${escapeHtml(formatDocumentDate(model.commercial.balanceDueDate, true))}</strong></div>` : ""}
  </div>`,
      weight: 260,
    })

    const scheduleRows = model.commercial.paymentSchedule.flatMap(item => {
      const noteChunks = item.notes ? splitTextAtWord(item.notes, 450) : [""]
      return noteChunks.map((notes, index) => ({ ...item, notes, continuation: index > 0 }))
    })
    chunkByWeight(scheduleRows, row => 180 + (row.notes?.length || 0), 1_050)
      .forEach((rows, index) => {
        sections.push({
          html: `<section class="kyo-schedule"><h3>Plan de pagos${index > 0 ? " (continuación)" : ""}</h3>${rows.map(item => `<div><b>${escapeHtml(item.label)}${item.continuation ? " (continuación)" : ""}</b><span>${item.amount != null ? escapeHtml(formatDocumentMoney(item.amount, model.commercial.currency)) : ""}</span><time>${escapeHtml(formatDocumentDate(item.dueDate, true))}</time>${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ""}</div>`).join("")}</section>`,
          weight: 80 + rows.reduce((sum, row) => sum + 180 + (row.notes?.length || 0), 0),
        })
      })

    splitTextAtWord(model.commercial.paymentMethods.join(", "), 550).forEach((text, index) => {
      sections.push({
        html: `<p class="kyo-methods"><b>Formas de pago${index > 0 ? " (continuación)" : ""}:</b> ${escapeHtml(text)}</p>`,
        weight: 80 + text.length,
      })
    })
  }

  if (isDocumentBlockVisible(manifest, "advisor-signature")) {
    sections.push({
      html: `<section class="kyo-signature">
    <div><span>Fecha</span><strong>${escapeHtml(formatDocumentDate(model.identity.createdAt, true))}</strong></div>
    <div><span>Cliente</span><strong>${escapeHtml(model.customer.displayName)}</strong></div>
    <div><span>Asesor/a</span><strong>${escapeHtml(model.advisor.displayName)}</strong></div>
  </section>
  <section class="kyo-contact"><p><b>${escapeHtml(brand.name)}</b>${brand.travelLicense ? ` · ${escapeHtml(brand.travelLicense)}` : ""}${brand.taxId ? ` · CUIT ${escapeHtml(brand.taxId)}` : ""}</p><p>${[brand.phone, brand.email, brand.website, brand.instagram, brand.address].filter(Boolean).map(escapeHtml).join(" · ")}</p><p>Asesor/a: ${escapeHtml(model.advisor.displayName)}${model.advisor.phone ? ` · ${escapeHtml(model.advisor.phone)}` : ""}${model.advisor.email ? ` · ${escapeHtml(model.advisor.email)}` : ""}</p></section>`,
      weight: 330,
    })
  }

  return chunkByWeight(sections, section => section.weight, 2_100)
    .map(chunk => chunk.map(section => section.html).join(""))
}

export const editorialRightRailV1Layout: QuotationLayoutRenderer = {
  catalog: {
    key: "editorial-right-rail-v1",
    version: 1,
    name: "Editorial con franja lateral",
    description: "Propuesta multipágina con identidad lateral, itinerario narrativo y cierre comercial. Base del modelo KYO 2026.",
    supports: [
      "hero", "trip-summary", "flight-options", "hotel-options", "services-included",
      "pricing", "itinerary", "recommendations", "restrictions", "legal-terms",
      "payment-schedule", "advisor-signature",
    ],
  },

  render({ model, manifest }): string {
    const pages: string[] = []
    let pageNumber = 1
    const referenceOption = model.options.find(option => option.selected) || model.options[0]
    const flights = isDocumentBlockVisible(manifest, "flight-options")
      ? expandFlightFragments(flightItems(referenceOption))
      : []
    const showHero = isDocumentBlockVisible(manifest, "hero")
    const showTripSummary = isDocumentBlockVisible(manifest, "trip-summary")

    if (showHero || showTripSummary || flights.length > 0) {
      pages.push(page(manifest, pageNumber++, "cover", `
      <div class="kyo-cover-copy">
        ${showHero ? `<div class="kyo-eyebrow">${escapeHtml(manifest.copy.documentTitle)}</div><h1>${escapeHtml(model.identity.title.toLocaleUpperCase("es-AR"))}</h1><div class="kyo-cover-rule"></div>` : ""}
        ${showTripSummary ? `<p class="kyo-dates">${escapeHtml(tripDates(model))}</p><div class="kyo-cover-meta"><div><span>Destino</span><strong>${escapeHtml(model.trip.destination)}</strong></div><div><span>Pasajeros</span><strong>${escapeHtml(passengerSummary(model))}</strong></div></div>` : ""}
      </div>
      ${flights.length > 0 ? `<section class="kyo-cover-flights">${sectionTitle("Vuelos", "Tu viaje")}${renderFlight(flights[0].item, flights[0].continuation)}</section>` : ""}
      `))
    }

    flights.slice(1).forEach((fragment, index) => {
      pages.push(page(manifest, pageNumber++, "flight", `
        ${sectionTitle("Vuelos", index === 0 ? "Continuación" : "Más tramos")}
        ${renderFlight(fragment.item, true)}
      `))
    })

    const showOptions = isDocumentBlockVisible(manifest, "pricing")
      || isDocumentBlockVisible(manifest, "hotel-options")
      || isDocumentBlockVisible(manifest, "services-included")
    const fragments = showOptions
      ? model.options.flatMap(option => optionFragments(option, manifest))
      : []
    const optionChunks = chunkByWeight(fragments, fragment => fragment.weight, 1_450)
    const overviewFragments = model.narrative.overview
      ? splitTextAtWord(model.narrative.overview, 1_100)
      : []
    const inclusions = isDocumentBlockVisible(manifest, "services-included")
      ? splitListValues(derivedInclusions(model), 650)
      : []
    const inclusionWeight = inclusions.reduce((sum, value) => sum + value.length + 70, 0)
    const inlineIntro = overviewFragments.length <= 1 && inclusionWeight <= 800 && optionChunks.length > 0

    if (!inlineIntro) {
      overviewFragments.forEach((overview, index) => {
        pages.push(page(manifest, pageNumber++, "summary", `
          ${sectionTitle(index === 0 ? "Propuesta de viaje" : "Propuesta de viaje (continuación)", model.trip.destination)}
          <p class="kyo-overview">${escapeHtml(overview)}</p>
        `))
      })

      const inclusionChunks = chunkByWeight(inclusions, value => value.length + 70, 1_500)
      inclusionChunks.forEach((values, index) => {
        pages.push(page(manifest, pageNumber++, "summary", `
          ${sectionTitle(index === 0 ? "El programa incluye" : "El programa incluye (continuación)", model.trip.destination)}
          ${renderBulletSection("Servicios incluidos", values)}
        `))
      })
    }

    optionChunks.forEach((optionPage, index) => {
      pages.push(page(manifest, pageNumber++, "summary", `
        ${sectionTitle(index === 0 ? "Propuesta de viaje" : "Alternativas", model.trip.destination)}
        ${inlineIntro && index === 0 && overviewFragments[0] ? `<p class="kyo-overview">${escapeHtml(overviewFragments[0])}</p>` : ""}
        ${inlineIntro && index === 0 && inclusions.length > 0 ? renderBulletSection("El programa incluye", inclusions) : ""}
        <div class="kyo-options">${optionPage.map(fragment => renderManifestOption(model, fragment.option, manifest, fragment.continuation)).join("")}</div>
      `))
    })

    if (optionChunks.length === 0 && inlineIntro) {
      pages.push(page(manifest, pageNumber++, "summary", `
        ${sectionTitle("Propuesta de viaje", model.trip.destination)}
        ${overviewFragments[0] ? `<p class="kyo-overview">${escapeHtml(overviewFragments[0])}</p>` : ""}
        ${inclusions.length > 0 ? renderBulletSection("El programa incluye", inclusions) : ""}
      `))
    }

    const itinerary = isDocumentBlockVisible(manifest, "itinerary") ? itineraryFragments(model) : []
    const itineraryPages = chunkByWeight(
      itinerary,
      fragment => 260 + fragment.title.length * 2 + fragment.description.length,
      1_850
    )
    itineraryPages.forEach((fragments, index) => {
      pages.push(page(manifest, pageNumber++, "itinerary", `
        ${sectionTitle("Itinerario", index === 0 ? "Día por día" : "Continuación")}
        ${renderItineraryPage(fragments)}
      `))
    })

    const informationSections = [
      { title: "Notas para el cliente", values: model.narrative.publicNotes ? splitListValues([model.narrative.publicNotes]) : [] },
      { title: "Recomendaciones", values: isDocumentBlockVisible(manifest, "recommendations") ? splitListValues(model.narrative.recommendations) : [] },
      { title: "Restricciones", values: isDocumentBlockVisible(manifest, "restrictions") ? splitListValues(model.narrative.restrictions) : [] },
      { title: "No incluye", values: splitListValues(model.narrative.exclusions) },
      { title: "Condiciones generales", values: isDocumentBlockVisible(manifest, "legal-terms") ? splitListValues(model.commercial.terms) : [] },
    ].filter(section => section.values.length > 0)

    const expandedSections = informationSections.flatMap(section => {
      const valueChunks = chunkByWeight(section.values, value => value.length + 70, 1_600)
      return valueChunks.map((values, index) => ({
        title: index === 0 ? section.title : `${section.title} (continuación)`,
        values,
      }))
    })
    const showClosing = isDocumentBlockVisible(manifest, "pricing")
      || isDocumentBlockVisible(manifest, "payment-schedule")
      || isDocumentBlockVisible(manifest, "advisor-signature")
    const closingFragments = showClosing ? buildCommercialClosingFragments(model, manifest) : []
    const infoPages = chunkByWeight(expandedSections, section => 180 + section.values.reduce((sum, value) => sum + value.length, 0), 2_200)
    let closingRendered = false
    infoPages.forEach((sections, index) => {
      const isLast = index === infoPages.length - 1
      const combineWithClosing = closingFragments.length === 1 && infoPages.length === 1 && isLast
      pages.push(page(manifest, pageNumber++, combineWithClosing ? "closing" : "information", `
        ${sectionTitle("Información importante", index === 0 ? "Antes de reservar" : "Continuación")}
        ${sections.map(section => renderBulletSection(section.title, section.values)).join("")}
        ${combineWithClosing ? `<div class="kyo-combined-closing">${closingFragments[0]}</div>` : ""}
      `))
      if (combineWithClosing) closingRendered = true
    })

    if (!closingRendered) {
      closingFragments.forEach((closing, index) => {
        pages.push(page(manifest, pageNumber++, "closing", `
          ${sectionTitle(index === 0 ? "Información importante" : "Propuesta comercial (continuación)", "Propuesta comercial")}
          ${closing}
        `))
      })
    }

    if (pages.length === 0) {
      pages.push(page(manifest, pageNumber++, "cover", `<h1>${escapeHtml(model.identity.title)}</h1>`))
    }

    const background = safeImageSource(manifest.assets.backgroundPath)
    const backgroundCss = background
      ? `background-image:url(${background});background-size:100% 100%;background-repeat:no-repeat;background-position:center;`
      : ""
    const styles = `<style>
      .kyo-page{position:relative;z-index:0;isolation:isolate;-webkit-print-color-adjust:exact;print-color-adjust:exact}.kyo-page::before{content:"";position:absolute;inset:0;z-index:0;${backgroundCss}-webkit-print-color-adjust:exact;print-color-adjust:exact}.kyo-safe-area{position:absolute;inset:70px 118px 58px 40px;overflow:hidden;z-index:1}.kyo-page-number{position:absolute;bottom:21px;right:112px;font-size:8px;color:#887361;z-index:1}
      .kyo-eyebrow,.kyo-section-title span{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${manifest.theme.secondaryColor};font-weight:700}
      .kyo-cover-copy{padding-top:72px;max-width:100%;text-align:center}.kyo-cover-copy h1{font-size:27px;line-height:1.12;text-transform:uppercase;color:${manifest.theme.accentColor};margin:10px 0 9px;font-weight:800;letter-spacing:.2px}.kyo-cover-rule{display:none}.kyo-dates{font-size:13px;color:${manifest.theme.primaryColor};margin:0 0 24px;text-transform:uppercase}.kyo-cover-meta{display:flex;justify-content:center;gap:42px;margin-bottom:24px;text-align:left}.kyo-cover-meta span,.kyo-option-head span,.kyo-closing-price>span,.kyo-payment-grid span,.kyo-signature span{display:block;font-size:8px;letter-spacing:1px;text-transform:uppercase;color:#846E5E}.kyo-cover-meta strong{font-size:12px;color:${manifest.theme.primaryColor}}
      .kyo-section-title{margin:0 0 14px}.kyo-section-title h2{font-size:23px;color:${manifest.theme.primaryColor};margin:3px 0 0;line-height:1.15}
      .kyo-cover-flights{margin-top:15px}.kyo-flight{border-top:1px solid #D9CEC5;padding:10px 0 6px}.kyo-flight-head{display:flex;justify-content:space-between;margin-bottom:8px}.kyo-flight-head span{display:block;font-size:8px;text-transform:uppercase;color:#957C68}.kyo-flight-head strong{font-size:12px;color:${manifest.theme.primaryColor}}.kyo-flight-head small{font-size:9px;color:#64717B}
      .kyo-flight-legs{display:grid;gap:7px}.kyo-flight-leg{display:grid;grid-template-columns:20px 1fr 92px 1fr;gap:8px;align-items:center;background:rgba(245,241,236,.86);border-radius:7px;padding:8px 10px;position:relative}.kyo-leg-index{width:18px;height:18px;border-radius:50%;background:${manifest.theme.primaryColor};color:#fff;display:flex;align-items:center;justify-content:center;font-size:8px}.kyo-flight-leg>div:not(.kyo-route-line):not(.kyo-baggage){display:grid}.kyo-flight-leg b{font-size:11px}.kyo-flight-leg small,.kyo-flight-leg time{font-size:7px;color:#65727C}.kyo-route-line{display:flex;align-items:center;gap:3px;color:#A5856B}.kyo-route-line i{height:1px;background:#BBA894;flex:1}.kyo-route-line small{position:absolute;top:4px;left:47%;font-size:6px}.kyo-baggage{grid-column:2/5;font-size:7px;color:#65727C}.kyo-flight-shot{display:block;width:100%;max-height:190px;object-fit:contain;border:1px solid #E1D8D0;border-radius:7px}
      .kyo-overview{font-size:10.5px;line-height:1.55;margin:0 0 14px;color:#425260}.kyo-bullets{margin-bottom:15px}.kyo-bullets h3{font-size:12px;color:${manifest.theme.primaryColor};margin:0 0 6px}.kyo-bullets ul{margin:0;padding-left:17px;columns:2;column-gap:22px}.kyo-bullets li{font-size:9px;line-height:1.45;margin:0 0 4px;break-inside:avoid}
      .kyo-options{display:grid;gap:12px}.kyo-option{border-top:1px solid #D9CEC5;padding-top:10px}.kyo-option-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:8px}.kyo-option-head h3{font-size:12px;margin:2px 0;color:${manifest.theme.primaryColor}}.kyo-option-price{text-align:right;display:grid;gap:2px}.kyo-option-price strong{font-size:17px;color:${manifest.theme.primaryColor}}.kyo-option-price small{font-size:7px;color:#65727C}.kyo-option-breakdown{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:7px;font-size:7px;color:#65727C}
      .kyo-hotel{display:grid;grid-template-columns:28px 1fr;gap:9px;background:rgba(247,243,238,.88);border-radius:7px;padding:8px 10px;margin:5px 0}.kyo-hotel-icon{width:25px;height:25px;border-radius:50%;background:#E8D6C4;color:${manifest.theme.primaryColor};display:flex;align-items:center;justify-content:center}.kyo-hotel h4{font-size:10px;margin:0 0 2px}.kyo-hotel h4 span{color:#C09568;font-size:7px}.kyo-hotel p,.kyo-hotel small,.kyo-option li{font-size:8px;line-height:1.4;color:#5F6A73}.kyo-option ul{margin:6px 0 0;padding-left:17px}
      .kyo-itinerary{display:grid;gap:13px}.kyo-itinerary article{display:grid;grid-template-columns:44px 1fr;gap:13px;padding-bottom:12px;border-bottom:1px solid #DDD3CA}.kyo-day-number{width:42px;height:42px;border-radius:50%;background:#E8D7C4;display:flex;flex-direction:column;align-items:center;justify-content:center;color:${manifest.theme.primaryColor}}.kyo-day-number span{font-size:7px;text-transform:uppercase}.kyo-day-number strong{font-size:15px}.kyo-day-copy h3{font-size:12.5px;color:${manifest.theme.primaryColor};margin:0 0 2px}.kyo-day-copy time{font-size:7.5px;color:#8C7766}.kyo-day-copy p{font-size:9px;line-height:1.53;margin:5px 0 0;white-space:pre-line;color:#394B58}
      .kyo-page--information .kyo-bullets{margin-bottom:20px}.kyo-page--information .kyo-bullets h3{font-size:13px}.kyo-page--information .kyo-bullets ul{columns:1}.kyo-page--information .kyo-bullets li{font-size:9.5px;line-height:1.55;margin-bottom:6px}
      .kyo-page--closing .kyo-safe-area{inset:32px 118px 40px 46px}.kyo-page--closing .kyo-section-title h2{color:${manifest.theme.accentColor};font-size:22px}.kyo-page--closing .kyo-section-title span{display:none}.kyo-page--closing .kyo-bullets{margin-bottom:9px}.kyo-page--closing .kyo-bullets h3{font-size:10px;margin-bottom:3px}.kyo-page--closing .kyo-bullets ul{columns:1}.kyo-page--closing .kyo-bullets li{font-size:8.5px;line-height:1.35;margin-bottom:3px}.kyo-availability,.kyo-price-copy{font-size:9px;line-height:1.4;color:#52606B;margin:0 0 10px}.kyo-combined-closing{margin-top:8px}.kyo-closing-price{text-align:center;padding:5px 12px 10px;margin:4px 0 8px}.kyo-closing-price strong{display:block;font-size:22px;color:${manifest.theme.accentColor};margin:2px 0}.kyo-closing-price p{font-size:8px;line-height:1.35;margin:3px 0 0;color:#233F5C}.kyo-payment-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:8px}.kyo-payment-grid>div{border-bottom:1px solid #D9CEC5;padding:5px 0}.kyo-payment-grid strong{font-size:11px;color:${manifest.theme.primaryColor}}
      .kyo-schedule h3{font-size:11px;color:${manifest.theme.primaryColor};margin:0 0 4px}.kyo-schedule>div{display:grid;grid-template-columns:1fr auto auto;gap:9px;padding:4px 0;border-bottom:1px solid #E4DDD6;font-size:8px}.kyo-schedule small{grid-column:1/4}.kyo-methods{font-size:8px;line-height:1.4;margin:7px 0}.kyo-signature{margin-top:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.kyo-signature>div{border-top:1px solid #BBAA9C;padding-top:5px}.kyo-signature strong{font-size:9px;color:${manifest.theme.primaryColor}}.kyo-contact{margin-top:8px;border-top:1px solid #D9CEC5;padding-top:6px}.kyo-contact p{font-size:7px;line-height:1.35;margin:2px 0;color:#53616C}
    </style>`

    return wrapDocument([styles, ...pages], manifest)
  },
}
