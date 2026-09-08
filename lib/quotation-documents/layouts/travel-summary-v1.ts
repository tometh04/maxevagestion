import {
  chunkByWeight, escapeHtml as e, formatDocumentDate as date, formatDocumentMoney as money,
  getDocumentBranding, getDocumentOptionPricing, isDocumentBlockVisible, optionItemVisible,
  passengerSummary, safeImageSource, splitTextAtWord, wrapDocument,
} from "@/lib/quotation-documents/html"
import type { QuotationDocumentItem, QuotationLayoutRenderer } from "@/lib/quotation-documents/types"

function serviceHtml(item: QuotationDocumentItem): string {
  const flight = item.flight
  const hotel = item.hotel
  const screenshot = !flight?.legs.length ? safeImageSource(flight?.screenshotUrl) : ""
  const legs = flight?.legs.map(leg => `<div class="travel-leg">
    <div class="travel-leg-label"><b>${leg.type === "inbound" ? "Regreso" : leg.type === "outbound" ? "Ida" : "Tramo"}</b><span>${e(leg.duration)}${leg.baggage ? ` · ${e(leg.baggage)}` : ""}</span></div>
    <div class="travel-route"><div><strong>${e(leg.departureCode || leg.departureCity)}</strong><span>${e(leg.departureCity)} · ${e(leg.departureTime)}</span></div><b>→</b><div><strong>${e(leg.arrivalCode || leg.arrivalCity)}</strong><span>${e(leg.arrivalCity)} · ${e(leg.arrivalTime)}</span></div></div>
    ${leg.layovers.map(stop => `<p class="travel-layover"><b>Escala en ${e(stop.city || stop.code)}</b>${stop.waitingTime ? ` · Tiempo de espera: ${e(stop.waitingTime)}` : ""}${stop.code ? ` · ${e(stop.code)}` : ""}</p>`).join("")}
  </div>`).join("") || ""
  return `<article class="travel-service"><h3>${e(hotel?.name || flight?.airline || item.description)}</h3>
    ${flight ? `<p>${e(flight.route)} · ${e(date(flight.departureDate))}${flight.returnDate ? ` al ${e(date(flight.returnDate))}` : ""}${flight.cabin ? ` · ${e(flight.cabin)}` : ""}</p>` : ""}
    ${hotel ? `<p>${[hotel.destination, hotel.stars ? `${hotel.stars} estrellas` : "", hotel.roomType, hotel.mealPlan, hotel.nights ? `${hotel.nights} noches` : ""].filter(Boolean).map(e).join(" · ")}</p><p>${e(date(hotel.checkinDate))} — ${e(date(hotel.checkoutDate))}</p>` : ""}
    ${item.description && item.description !== hotel?.name && item.description !== flight?.airline ? `<p>${e(item.description)}</p>` : ""}
    ${item.notes ? `<p>${e(item.notes)}</p>` : ""}${legs}${screenshot ? `<img src="${e(screenshot)}" alt="Detalle del vuelo" style="max-width:100%;max-height:240px;object-fit:contain"/>` : ""}
  </article>`
}

export const travelSummaryV1Layout: QuotationLayoutRenderer = {
  catalog: {
    key: "travel-summary-v1", version: 1, name: "Resumen de viaje",
    description: "Resumen compacto con alternativas y detalle de escalas.",
    supports: ["hero", "trip-summary", "flight-options", "hotel-options", "services-included", "pricing", "itinerary", "recommendations", "restrictions", "legal-terms", "payment-schedule", "advisor-signature"],
  },
  render({ model, manifest }) {
    const brand = getDocumentBranding(model, manifest)
    const visible = (kind: typeof manifest.blocks[number]["kind"]) => isDocumentBlockVisible(manifest, kind)
    const blocks: Array<{ html: string; weight: number }> = []
    if (visible("hero")) blocks.push({ html: `<h1>${e(model.identity.title || manifest.copy.documentTitle)}</h1>`, weight: 42 })
    if (visible("trip-summary")) blocks.push({ html: `<div class="travel-facts"><div><small>DESTINO</small><b>${e(model.trip.destination)}</b></div><div><small>FECHAS</small><b>${e(date(model.trip.departureDate))}${model.trip.returnDate ? ` — ${e(date(model.trip.returnDate))}` : ""}</b></div><div><small>PASAJEROS</small><b>${e(passengerSummary(model))}</b></div></div><p class="travel-customer">Para ${e(model.customer.displayName)} · ${e(model.identity.quotationNumber)}${model.identity.validUntil ? ` · Vigencia: ${e(date(model.identity.validUntil))}` : ""}</p>`, weight: 95 })
    const textBlocks = (title: string, values: string[]) => {
      values.flatMap(value => splitTextAtWord(value, 1000)).forEach((value, index) => blocks.push({
        html: `<section class="travel-text">${index === 0 ? `<h3>${e(title)}</h3>` : ""}<p>${e(value)}</p></section>`,
        weight: 35 + Math.ceil(value.length / 100) * 16,
      }))
    }
    if (visible("hero") && model.narrative.overview) textBlocks("Propuesta", [model.narrative.overview])
    for (const option of model.options) {
      const pricing = getDocumentOptionPricing(model, option)
      const items = option.items.filter(item => optionItemVisible(item, manifest))
      const fragments = items.flatMap(item => {
        const descriptions = splitTextAtWord(item.description, 600)
        const notes = splitTextAtWord(item.notes || "", 600)
        const legs = item.flight?.legs || []
        const legChunks = chunkByWeight(legs, leg => 85 + leg.layovers.length * 22, 400)
        return Array.from({ length: Math.max(1, descriptions.length, notes.length, legChunks.length) }, (_, i) => ({
          ...item, description: descriptions[i] || "", notes: notes[i],
          flight: item.flight ? { ...item.flight, legs: legChunks[i] || [] } : undefined,
        }))
      })
      const chunks = chunkByWeight(fragments, item => 65 + Math.ceil((item.description.length + (item.notes?.length || 0)) / 100) * 16
        + (item.flight?.legs.reduce((weight, leg) => weight + 85 + leg.layovers.length * 22, 0) || (item.flight?.screenshotUrl ? 260 : 0)), 580)
      const optionChunks = chunks.length ? chunks : [[]]
      for (let index = 0; index < optionChunks.length; index += 1) {
        const chunk = optionChunks[index]
        const html = `<section class="travel-option"><div class="travel-option-heading"><h2>${e(option.title)}${index ? " · continuación" : ""}</h2>${visible("pricing") ? `<div><strong>${e(money(pricing.primaryAmount, model.commercial.currency))}</strong><small>${e(pricing.primaryLabel)}</small></div>` : ""}</div>
          ${chunk.map(serviceHtml).join("")}
          ${visible("pricing") && !index ? `<p class="travel-breakdown">${pricing.secondaryAmount != null ? `${e(pricing.secondaryLabel)}: ${e(money(pricing.secondaryAmount, model.commercial.currency))}` : ""}${model.commercial.insuranceAmount > 0 ? ` · Incluye seguro: ${e(money(model.commercial.insuranceAmount, model.commercial.currency))}` : ""}${model.commercial.transferAmount > 0 ? ` · Incluye traslado: ${e(money(model.commercial.transferAmount, model.commercial.currency))}` : ""}</p>` : ""}</section>`
        blocks.push({ html, weight: 65 + chunk.reduce((weight, item) => weight + 65 + Math.ceil((item.description.length + (item.notes?.length || 0)) / 100) * 16 + (item.flight?.legs.reduce((n, leg) => n + 85 + leg.layovers.length * 22, 0) || (item.flight?.screenshotUrl ? 260 : 0)), 0) })
      }
    }
    if (visible("services-included")) textBlocks("Incluye", model.narrative.inclusions)
    textBlocks("No incluye", model.narrative.exclusions)
    if (model.narrative.publicNotes) textBlocks("Observaciones", [model.narrative.publicNotes])
    if (visible("itinerary")) for (const day of model.narrative.itinerary) textBlocks(`Día ${day.day} · ${day.title}`, [day.description])
    if (visible("recommendations")) textBlocks("Recomendaciones", model.narrative.recommendations)
    if (visible("restrictions")) textBlocks("Restricciones", model.narrative.restrictions)
    if (visible("legal-terms")) textBlocks("Condiciones", model.commercial.terms)
    if (visible("payment-schedule")) {
      const payments = [
        model.commercial.depositAmount != null ? `Seña: ${money(model.commercial.depositAmount, model.commercial.currency)}` : "",
        model.commercial.balanceDueDate ? `Saldo hasta: ${date(model.commercial.balanceDueDate)}` : "",
        ...model.commercial.paymentMethods,
        ...model.commercial.paymentSchedule.map(item => [item.label, item.amount != null ? money(item.amount, model.commercial.currency) : "", date(item.dueDate), item.notes].filter(Boolean).join(" · ")),
      ].filter(Boolean)
      textBlocks("Pagos", payments)
    }
    const logo = safeImageSource(brand.logoUrl)
    const pages = chunkByWeight(blocks, block => block.weight, 900)
    const styles = `<style>
      .travel-page{padding:24px 32px 20px;display:flex;flex-direction:column;background:#fff;color:${manifest.theme.textColor}}
      .travel-header{min-height:44px;display:flex;align-items:center;justify-content:flex-end;border-bottom:2px solid ${manifest.theme.primaryColor};padding-bottom:10px;margin-bottom:14px;flex-shrink:0}.travel-header img{max-width:210px;max-height:48px;object-fit:contain}.travel-header b{font-size:20px;color:${manifest.theme.primaryColor}}
      .travel-main{flex:1;min-height:0}.travel-main h1{font-size:21px;text-align:center;margin:0 0 16px;text-transform:uppercase}.travel-main h2{font-size:13px;margin:0}.travel-main h3{font-size:11px;margin:0 0 4px}.travel-main p{font-size:10px;line-height:1.4;margin:3px 0;white-space:pre-line}
      .travel-facts{display:flex;gap:14px;justify-content:space-between;padding:12px;background:#f6f7f9;border-left:3px solid ${manifest.theme.accentColor};border-radius:6px}.travel-facts div{display:flex;flex-direction:column;gap:5px;flex:1}.travel-facts small,.travel-option small{font-size:9px;color:${manifest.theme.secondaryColor}}.travel-facts b{font-size:11px}.travel-customer{padding:6px 0;color:${manifest.theme.secondaryColor}}
      .travel-option{border:1px solid #dde1e6;border-radius:7px;padding:10px 12px;margin:0 0 12px;break-inside:avoid}.travel-option-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:7px}.travel-option-heading>div{display:flex;flex-direction:column;text-align:right}.travel-option-heading strong{font-size:16px;color:${manifest.theme.primaryColor}}.travel-service{padding:5px 0}.travel-leg{padding:7px 10px;margin-top:6px;background:#f8f9fa;border-left:3px solid ${manifest.theme.accentColor};border-radius:4px}.travel-leg-label{display:flex;justify-content:space-between;gap:10px;font-size:10px}.travel-route{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0}.travel-route div{display:flex;flex-direction:column;gap:3px}.travel-route div:last-child{text-align:right}.travel-route strong{font-size:14px}.travel-route span{font-size:10px}.travel-layover{background:#fff4cb;padding:4px 7px;border-radius:3px}.travel-breakdown{font-size:9px!important;color:${manifest.theme.secondaryColor}}.travel-text{margin-bottom:8px}
      .travel-footer{flex-shrink:0;border-top:1px solid #dde1e6;padding-top:8px;font-size:8px;line-height:1.4;color:${manifest.theme.secondaryColor}}.travel-footer p{margin:2px 0}.travel-footer>div{display:flex;justify-content:space-between;gap:12px;margin-top:5px}
    </style>`
    return wrapDocument([styles, ...pages.map((page, i) => `<section class="quotation-page travel-page" data-pdf-page="${i + 1}"><header class="travel-header">${logo ? `<img src="${e(logo)}" alt="${e(brand.name)}"/>` : `<b>${e(brand.name)}</b>`}</header><main class="travel-main">${page.map(block => block.html).join("")}</main><footer class="travel-footer"><p>${e(manifest.copy.availabilityNote)}</p>${manifest.copy.priceDisclaimer ? `<p>${e(manifest.copy.priceDisclaimer)}</p>` : ""}${visible("advisor-signature") ? `<p>${[brand.legalName || brand.name, brand.taxId, brand.travelLicense, brand.phone, brand.email, `Asesor: ${model.advisor.displayName}`, model.advisor.phone].filter(Boolean).map(e).join(" · ")}</p>` : ""}<div><span>${e(model.identity.quotationNumber)}</span><span>${i + 1} / ${pages.length}</span></div></footer></section>`)], manifest)
  },
}
