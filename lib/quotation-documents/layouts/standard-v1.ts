import {
  chunkByWeight,
  escapeHtml,
  formatDocumentDate,
  formatDocumentMoney,
  getDocumentBranding,
  getDocumentOptionPricing,
  isDocumentBlockVisible,
  itemLabel,
  optionItemVisible,
  passengerSummary,
  safeImageSource,
  splitTextAtWord,
  wrapDocument,
} from "@/lib/quotation-documents/html"
import type {
  QuotationDocumentDataV1,
  QuotationDocumentItem,
  QuotationLayoutRenderer,
  QuotationModelManifestV1,
} from "@/lib/quotation-documents/types"

function renderPage(
  model: QuotationDocumentDataV1,
  manifest: QuotationModelManifestV1,
  title: string,
  body: string,
  pageNumber: number
): string {
  const brand = getDocumentBranding(model, manifest)
  const logo = safeImageSource(brand.logoUrl)
  return `<section class="quotation-page standard-page" data-pdf-page="${pageNumber}">
    <header class="standard-header">
      <div>
        <div class="standard-kicker">${escapeHtml(manifest.copy.documentTitle)}</div>
        <div class="standard-agency">${escapeHtml(brand.name)}</div>
      </div>
      ${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(brand.name)}"/>` : ""}
    </header>
    <main class="standard-content">
      <h1>${escapeHtml(title)}</h1>
      ${body}
    </main>
    <footer class="standard-footer">
      <span>${escapeHtml([brand.travelLicense, brand.taxId].filter(Boolean).join(" · ") || model.identity.quotationNumber)}</span>
      <span>${pageNumber}</span>
    </footer>
  </section>`
}

function renderTripSummary(model: QuotationDocumentDataV1): string {
  return `<div class="standard-facts">
    <div><span>Destino</span><strong>${escapeHtml(model.trip.destination)}</strong></div>
    <div><span>Fechas</span><strong>${escapeHtml(formatDocumentDate(model.trip.departureDate))}${model.trip.returnDate ? ` al ${escapeHtml(formatDocumentDate(model.trip.returnDate))}` : ""}</strong></div>
    <div><span>Pasajeros</span><strong>${escapeHtml(passengerSummary(model))}</strong></div>
    <div><span>Vigencia</span><strong>${escapeHtml(formatDocumentDate(model.identity.validUntil))}</strong></div>
  </div>`
}

function renderItem(item: QuotationDocumentItem, continuation = false): string {
  const hotel = item.hotel
  const flight = item.flight
  const details = [
    item.provider,
    flight?.airline,
    flight?.route,
    hotel?.name,
    hotel?.roomType,
    hotel?.mealPlan,
    item.transfer?.description,
  ].filter(Boolean)

  const legs = flight?.legs || []
  const legsHtml = legs.length > 0
    ? `<div class="standard-legs">${legs.map(leg => `<div>
        <strong>${escapeHtml(leg.departureCode || leg.departureCity || "Origen")}</strong>
        <span>${escapeHtml(leg.departureTime || "")}</span>
        <b>→</b>
        <strong>${escapeHtml(leg.arrivalCode || leg.arrivalCity || "Destino")}</strong>
        <span>${escapeHtml(leg.arrivalTime || "")}</span>
      </div>`).join("")}</div>`
    : ""

  const photo = safeImageSource(hotel?.photoUrl)
  const screenshot = safeImageSource(flight?.screenshotUrl)

  return `<article class="standard-item">
    <div class="standard-item-copy">
      <div class="standard-item-label">${escapeHtml(itemLabel(item))}${continuation ? " · continuación" : ""}</div>
      <h3>${escapeHtml(item.description || details[0] || itemLabel(item))}</h3>
      ${details.length > 0 ? `<p>${details.map(escapeHtml).join(" · ")}</p>` : ""}
      ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}
      ${legsHtml}
    </div>
    ${photo || screenshot ? `<img src="${escapeHtml(photo || screenshot || "")}" alt=""/>` : ""}
  </article>`
}

interface StandardItemFragment {
  item: QuotationDocumentItem
  continuation: boolean
}

function splitStandardItem(item: QuotationDocumentItem): StandardItemFragment[] {
  const descriptions = splitTextAtWord(item.description || "", 700)
  const notes = splitTextAtWord(item.notes || "", 700)
  const legs = item.flight?.legs || []
  const legChunks = legs.length > 0 ? chunkByWeight(legs, () => 1, 4) : []
  const fragmentCount = Math.max(1, descriptions.length, notes.length, legChunks.length)

  return Array.from({ length: fragmentCount }, (_, index) => ({
    item: {
      ...item,
      description: descriptions[index] || (index === 0 ? item.description : ""),
      notes: notes[index],
      flight: item.flight
        ? { ...item.flight, legs: legChunks[index] || [] }
        : item.flight,
    },
    continuation: index > 0,
  }))
}

function renderList(title: string, values: string[]): string {
  if (values.length === 0) return ""
  return `<section class="standard-list"><h2>${escapeHtml(title)}</h2><ul>${values.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul></section>`
}

function renderListFragments(title: string, values: string[]): string[] {
  const fragments = values.flatMap(value => splitTextAtWord(value, 850))
  return chunkByWeight(fragments, value => value.length + 80, 1_850)
    .map((chunk, index) => renderList(
      index === 0 ? title : `${title} (continuación)`,
      chunk
    ))
}

function renderNarrativePages(
  model: QuotationDocumentDataV1,
  manifest: QuotationModelManifestV1,
  startingPage: number
): string[] {
  if (!isDocumentBlockVisible(manifest, "itinerary") || model.narrative.itinerary.length === 0) return []

  const expanded = model.narrative.itinerary.flatMap(day => {
    const chunks = splitTextAtWord(day.description, 1_200)
    return (chunks.length > 0 ? chunks : [""]).map((description, index) => ({
      ...day,
      description,
      continuation: index > 0,
    }))
  })
  const chunks = chunkByWeight(expanded, day => 180 + day.title.length + day.description.length, 2_400)

  return chunks.map((days, index) => renderPage(
    model,
    manifest,
    "Itinerario",
    `<div class="standard-itinerary">${days.map(day => `<article>
      <div class="standard-day">Día ${day.day}</div>
      <div><h2>${escapeHtml(day.title)}${day.continuation ? " (continuación)" : ""}</h2>
      ${day.date ? `<time>${escapeHtml(formatDocumentDate(day.date, true))}</time>` : ""}
      <p>${escapeHtml(day.description)}</p></div>
    </article>`).join("")}</div>`,
    startingPage + index
  ))
}

export const vibookStandardV1Layout: QuotationLayoutRenderer = {
  catalog: {
    key: "vibook-standard-v1",
    version: 1,
    name: "Vibook estándar",
    description: "Documento claro y compacto compatible con cualquier tipo de servicio.",
    supports: [
      "hero", "trip-summary", "flight-options", "hotel-options", "services-included",
      "pricing", "itinerary", "recommendations", "restrictions", "legal-terms",
      "payment-schedule", "advisor-signature",
    ],
  },

  render({ model, manifest }): string {
    const pages: string[] = []
    let pageNumber = 1
    const brand = getDocumentBranding(model, manifest)
    const showHero = isDocumentBlockVisible(manifest, "hero")
    const showTripSummary = isDocumentBlockVisible(manifest, "trip-summary")
    const showPricing = isDocumentBlockVisible(manifest, "pricing")

    const overviewFragments = showHero && model.narrative.overview
      ? splitTextAtWord(model.narrative.overview, 1_300)
      : []

    if (showHero || showTripSummary) {
      pages.push(renderPage(
        model,
        manifest,
        showHero ? model.identity.title : "Resumen del viaje",
        `${showTripSummary ? renderTripSummary(model) : ""}
        ${overviewFragments[0] ? `<section class="standard-overview"><h2>Propuesta</h2><p>${escapeHtml(overviewFragments[0])}</p></section>` : ""}
        <div class="standard-customer"><span>Preparado para</span><strong>${escapeHtml(model.customer.displayName)}</strong><span>Asesor</span><strong>${escapeHtml(model.advisor.displayName)}</strong></div>`,
        pageNumber++
      ))
    }

    overviewFragments.slice(1).forEach((overview, index) => {
      pages.push(renderPage(
        model,
        manifest,
        "Propuesta (continuación)",
        `<section class="standard-overview"><p>${escapeHtml(overview)}</p></section>`,
        pageNumber++
      ))
    })

    for (const option of model.options) {
      const visibleItems = option.items
        .filter(item => optionItemVisible(item, manifest))
        .flatMap(splitStandardItem)
      if (!showPricing && visibleItems.length === 0) continue
      const itemChunks = chunkByWeight(
        visibleItems,
        fragment => 220 + fragment.item.description.length + (fragment.item.notes?.length || 0)
          + (fragment.item.flight?.legs.length || 0) * 90,
        1_600
      )
      const chunks = itemChunks.length > 0 ? itemChunks : [[]]
      chunks.forEach((items, index) => {
        const pricing = getDocumentOptionPricing(model, option)
        pages.push(renderPage(
          model,
          manifest,
          `${option.title}${index > 0 ? " (continuación)" : ""}`,
          `${showPricing ? `<div class="standard-price"><div><span>${escapeHtml(pricing.primaryLabel)}</span><strong>${escapeHtml(formatDocumentMoney(pricing.primaryAmount, model.commercial.currency))}</strong>${pricing.secondaryAmount != null ? `<small>${escapeHtml(pricing.secondaryLabel)}: ${escapeHtml(formatDocumentMoney(pricing.secondaryAmount, model.commercial.currency))}</small>` : ""}</div><div class="standard-price-breakdown"><small>Servicios: ${escapeHtml(formatDocumentMoney(pricing.baseAmount, model.commercial.currency))}</small>${model.commercial.insuranceAmount > 0 ? `<small>Seguro: ${escapeHtml(formatDocumentMoney(model.commercial.insuranceAmount, model.commercial.currency))}</small>` : ""}${model.commercial.transferAmount > 0 ? `<small>Traslado: ${escapeHtml(formatDocumentMoney(model.commercial.transferAmount, model.commercial.currency))}</small>` : ""}</div></div>` : ""}
          <div class="standard-items">${items.map(fragment => renderItem(fragment.item, fragment.continuation)).join("")}</div>`,
          pageNumber++
        ))
      })
    }

    const itineraryPages = renderNarrativePages(model, manifest, pageNumber)
    pages.push(...itineraryPages)
    pageNumber += itineraryPages.length

    const closingSections = [
      ...(isDocumentBlockVisible(manifest, "services-included") ? renderListFragments("Incluye", model.narrative.inclusions) : []),
      ...renderListFragments("No incluye", model.narrative.exclusions),
      ...(model.narrative.publicNotes ? renderListFragments("Notas para el cliente", [model.narrative.publicNotes]) : []),
      ...(isDocumentBlockVisible(manifest, "recommendations") ? renderListFragments("Recomendaciones", model.narrative.recommendations) : []),
      ...(isDocumentBlockVisible(manifest, "restrictions") ? renderListFragments("Restricciones", model.narrative.restrictions) : []),
      ...(isDocumentBlockVisible(manifest, "legal-terms") ? renderListFragments("Condiciones", model.commercial.terms) : []),
    ]

    const showPayment = isDocumentBlockVisible(manifest, "payment-schedule")
    const showAdvisor = isDocumentBlockVisible(manifest, "advisor-signature")
    const commercial = `${showPayment ? `<section class="standard-commercial">
      ${model.commercial.depositAmount != null ? `<div><span>Anticipo</span><strong>${escapeHtml(formatDocumentMoney(model.commercial.depositAmount, model.commercial.currency))}</strong></div>` : ""}
      ${model.commercial.balanceDueDate ? `<div><span>Saldo hasta</span><strong>${escapeHtml(formatDocumentDate(model.commercial.balanceDueDate))}</strong></div>` : ""}
      ${model.commercial.paymentSchedule.length > 0 ? `<div class="standard-schedule">${model.commercial.paymentSchedule.map(item => `<p><b>${escapeHtml(item.label)}</b>${item.amount != null ? ` · ${escapeHtml(formatDocumentMoney(item.amount, model.commercial.currency))}` : ""}${item.dueDate ? ` · ${escapeHtml(formatDocumentDate(item.dueDate))}` : ""}</p>`).join("")}</div>` : ""}
      ${model.commercial.paymentMethods.length > 0 ? `<p><b>Formas de pago:</b> ${model.commercial.paymentMethods.map(escapeHtml).join(", ")}</p>` : ""}
      <p>${escapeHtml(manifest.copy.availabilityNote)}</p>
    </section>` : ""}
    ${showAdvisor ? `<section class="standard-contact"><h2>Tu agencia y asesor</h2><p><b>${escapeHtml(brand.name)}</b>${brand.travelLicense ? ` · ${escapeHtml(brand.travelLicense)}` : ""}${brand.taxId ? ` · CUIT ${escapeHtml(brand.taxId)}` : ""}</p><p>${[brand.phone, brand.email, brand.website, brand.instagram, brand.address].filter(Boolean).map(escapeHtml).join(" · ")}</p><p>Asesor/a: <b>${escapeHtml(model.advisor.displayName)}</b>${model.advisor.phone ? ` · ${escapeHtml(model.advisor.phone)}` : ""}${model.advisor.email ? ` · ${escapeHtml(model.advisor.email)}` : ""}</p></section>` : ""}`

    const sectionChunks = chunkByWeight(closingSections, section => section.length, 4_000)
    const closingChunks = sectionChunks.length > 0 ? sectionChunks : commercial ? [[]] : []
    closingChunks.forEach((sections, index) => {
      pages.push(renderPage(
        model,
        manifest,
        index === 0 ? "Información importante" : "Información importante (continuación)",
        `${sections.join("")}${index === closingChunks.length - 1 ? commercial : ""}`,
        pageNumber++
      ))
    })

    if (pages.length === 0) {
      pages.push(renderPage(model, manifest, model.identity.title, "", pageNumber++))
    }

    const styles = `<style>
      .standard-page{padding:42px 48px 34px;display:flex;flex-direction:column}
      .standard-header{height:68px;display:flex;align-items:flex-start;justify-content:space-between;border-bottom:1px solid #D7DEE4;padding-bottom:14px}
      .standard-header img{max-width:150px;max-height:50px;object-fit:contain}
      .standard-kicker{font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:${manifest.theme.secondaryColor}}
      .standard-agency{font-size:18px;font-weight:700;color:${manifest.theme.primaryColor};margin-top:4px}
      .standard-content{flex:1;padding-top:28px;overflow:hidden}
      .standard-content>h1{font-size:29px;line-height:1.12;color:${manifest.theme.primaryColor};margin:0 0 24px;max-width:620px}
      .standard-footer{height:24px;border-top:1px solid #D7DEE4;padding-top:9px;display:flex;justify-content:space-between;color:#6B7783;font-size:9px}
      .standard-facts{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:24px}
      .standard-facts div{border:1px solid #DEE5EA;border-radius:8px;padding:12px 14px;background:#F6F8F9}
      .standard-facts span,.standard-customer span,.standard-price span,.standard-commercial span{display:block;text-transform:uppercase;font-size:9px;letter-spacing:.7px;color:#687786;margin-bottom:4px}
      .standard-facts strong{font-size:13px;color:#263C50}
      .standard-overview{margin:25px 0}.standard-overview h2,.standard-list h2{font-size:14px;color:${manifest.theme.primaryColor};margin:0 0 8px}.standard-overview p,.standard-list li{font-size:11px;line-height:1.58}
      .standard-customer{display:grid;grid-template-columns:110px 1fr;gap:7px 12px;border-top:1px solid #DEE5EA;margin-top:28px;padding-top:18px;font-size:12px}
      .standard-price{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;background:#F4F0E8;border-radius:10px;padding:16px 18px;margin-bottom:18px}.standard-price>div:first-child{display:grid;gap:3px}
      .standard-price strong{font-size:25px;color:${manifest.theme.primaryColor}}.standard-price small{font-size:9px;color:#687786}.standard-price-breakdown{display:grid;gap:3px;text-align:right}
      .standard-items{display:grid;gap:12px}.standard-item{display:flex;min-height:105px;border:1px solid #DEE5EA;border-radius:10px;overflow:hidden;background:#FFFFFF}.standard-item-copy{padding:12px 14px;flex:1}.standard-item img{width:150px;object-fit:cover}.standard-item-label{font-size:9px;text-transform:uppercase;letter-spacing:.7px;color:${manifest.theme.accentColor};font-weight:700}.standard-item h3{font-size:13px;margin:4px 0}.standard-item p{font-size:10px;line-height:1.45;margin:3px 0;color:#52616E}
      .standard-legs{display:grid;gap:3px;margin-top:8px}.standard-legs>div{display:grid;grid-template-columns:1fr auto 18px 1fr auto;gap:5px;align-items:center;background:#F6F8F9;border-radius:5px;padding:5px 7px;font-size:9px}.standard-legs b{text-align:center}
      .standard-itinerary{display:grid;gap:16px}.standard-itinerary article{display:grid;grid-template-columns:64px 1fr;gap:14px;border-bottom:1px solid #E3E8EC;padding-bottom:14px}.standard-day{font-size:11px;font-weight:700;color:${manifest.theme.accentColor};text-transform:uppercase}.standard-itinerary h2{font-size:14px;margin:0 0 4px;color:${manifest.theme.primaryColor}}.standard-itinerary time{font-size:9px;color:#687786}.standard-itinerary p{font-size:10.5px;line-height:1.58;margin:7px 0 0;white-space:pre-line}
      .standard-list{margin-bottom:17px}.standard-list ul{padding-left:18px;margin:0;columns:2;column-gap:28px}.standard-list li{break-inside:avoid;margin-bottom:5px}
      .standard-commercial{margin-top:18px;border-top:2px solid ${manifest.theme.accentColor};padding-top:16px}.standard-commercial>div{display:inline-block;margin-right:28px}.standard-commercial strong{font-size:15px;color:${manifest.theme.primaryColor}}.standard-commercial p,.standard-contact p,.standard-list p{font-size:10px;line-height:1.5;margin:10px 0 0}.standard-schedule{display:block!important;margin:10px 0 0!important}.standard-schedule p{margin:4px 0}.standard-contact{margin-top:18px;border-top:1px solid #D7DEE4;padding-top:14px}.standard-contact h2{font-size:14px;color:${manifest.theme.primaryColor};margin:0}
    </style>`

    return wrapDocument([styles, ...pages], manifest)
  },
}
