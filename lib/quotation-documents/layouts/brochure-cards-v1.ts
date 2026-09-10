import {
  chunkByWeight,
  escapeHtml as e,
  estimateTextHeight as textHeight,
  formatDocumentDate as date,
  formatDocumentMoney as money,
  getDocumentBranding,
  getDocumentOptionPricing,
  isDocumentBlockVisible,
  itemLabel,
  optionItemVisible,
  passengerSummary,
  safeImageSource,
  shadeColor as shade,
  splitTextAtWord,
  wrapDocument,
} from "@/lib/quotation-documents/html"
import type {
  QuotationDocumentItem,
  QuotationLayoutRenderer,
  QuotationModelManifestV1,
} from "@/lib/quotation-documents/types"

/** Alto útil de una página de contenido, en píxeles. */
const CONTENT_BUDGET = 946
/** Ancho útil: A4 menos el padding lateral. */
const CONTENT_WIDTH = 690

interface Block {
  html: string
  weight: number
}

type FlightLeg = NonNullable<QuotationDocumentItem["flight"]>["legs"][number]

function stars(count?: number): string {
  if (!count || count < 1) return ""
  return `<span class="bc-stars">${"★".repeat(Math.min(5, Math.round(count)))}</span>`
}

function legHtml(leg: FlightLeg): string {
  const kind = leg.type === "inbound" ? "Regreso" : leg.type === "outbound" ? "Ida" : "Tramo"
  const foot = [
    leg.baggage,
    ...leg.layovers.map(stop => `Escala en ${stop.city || stop.code}${stop.waitingTime ? ` (${stop.waitingTime})` : ""}`),
  ].filter(Boolean)
  return `<div class="bc-leg">
    <span class="bc-leg-kind">${e(kind)}</span>
    <div class="bc-leg-row">
      <div class="bc-leg-side"><strong>${e(leg.departureCode || leg.departureCity)}</strong><span>${e(leg.departureTime)}</span></div>
      <div class="bc-leg-mid"><small>${e(leg.duration)}</small><i></i><span>${e(leg.departureCity)} → ${e(leg.arrivalCity)}</span></div>
      <div class="bc-leg-side bc-leg-side--end"><strong>${e(leg.arrivalCode || leg.arrivalCity)}</strong><span>${e(leg.arrivalTime)}</span></div>
    </div>
    ${foot.length ? `<p class="bc-leg-foot">${foot.map(e).join(" · ")}</p>` : ""}
  </div>`
}

function legWeight(leg: FlightLeg): number {
  return 78 + (leg.baggage || leg.layovers.length ? 20 : 0)
}

export const brochureCardsV1Layout: QuotationLayoutRenderer = {
  catalog: {
    key: "brochure-cards-v1",
    version: 1,
    name: "Folleto en tarjetas",
    description: "Portada clara con banda de color y precios a la vista, contenido en tarjetas e itinerario en grilla.",
    supports: [
      "hero", "trip-summary", "flight-options", "hotel-options", "services-included",
      "pricing", "itinerary", "recommendations", "restrictions", "legal-terms",
      "payment-schedule", "advisor-signature",
    ],
  },

  render({ model, manifest }) {
    const brand = getDocumentBranding(model, manifest)
    const visible = (kind: QuotationModelManifestV1["blocks"][number]["kind"]) => isDocumentBlockVisible(manifest, kind)
    const logo = safeImageSource(brand.logoUrl)
    const background = safeImageSource(manifest.assets.backgroundPath)
    const currency = model.commercial.currency
    const primary = manifest.theme.primaryColor
    const accent = manifest.theme.accentColor
    const blocks: Block[] = []

    const pushSection = (title: string, items: Block[]) => {
      if (!items.length) return
      const heading = `<h2 class="bc-h2">${e(title)}</h2>`
      blocks.push({ html: heading + items[0].html, weight: items[0].weight + 38 })
      for (const item of items.slice(1)) blocks.push(item)
    }

    if (visible("hero") && model.narrative.overview) {
      pushSection("La propuesta", splitTextAtWord(model.narrative.overview, 900).map(part => ({
        html: `<p class="bc-lead">${e(part)}</p>`,
        weight: textHeight(part, CONTENT_WIDTH, 11, 1.62) + 12,
      })))
    }

    // — Detalle por alternativa —
    for (const option of model.options) {
      const pricing = getDocumentOptionPricing(model, option)
      const items = option.items.filter(item => optionItemVisible(item, manifest))
      const flights = items.filter(item => item.flight)
      const hotels = items.filter(item => item.hotel)
      const services = items.filter(item => !item.flight && !item.hotel)

      const optionBlocks: Block[] = [{
        html: `<div class="bc-option-bar${option.selected ? " is-featured" : ""}">
          <div><span>Alternativa ${option.number}</span><h3>${e(option.title)}</h3></div>
          ${visible("pricing") ? `<div class="bc-option-price"><strong>${e(money(pricing.primaryAmount, currency))}</strong><span>${e(pricing.primaryLabel)}</span></div>` : ""}
        </div>`,
        weight: 68,
      }]

      for (const item of flights) {
        const flight = item.flight!
        // La mayoría de los vuelos se cargan como captura de pantalla del
        // buscador, sin tramos estructurados. Si no se dibuja la captura, esos
        // vuelos quedan reducidos a la aerolínea y la ruta.
        const screenshot = flight.legs.length ? null : safeImageSource(flight.screenshotUrl)
        // Tope medido: agrupar todos los tramos de un vuelo en un solo bloque
        // agrega una página entera, porque el bloque deja de entrar en el resto
        // de la página en curso.
        const groups = chunkByWeight(flight.legs, legWeight, 380)
        ;(groups.length ? groups : [[]]).forEach((group, index) => {
          optionBlocks.push({
            html: `<div class="bc-panel">
              ${index === 0 ? `<div class="bc-panel-head"><b>${e(flight.airline || item.description)}</b><span>${[flight.route, flight.cabin].filter(Boolean).map(e).join(" · ")}</span></div>` : ""}
              ${group.map(legHtml).join("")}
              ${index === 0 && screenshot ? `<figure class="bc-shot"><img src="${e(screenshot)}" alt="Detalle del vuelo"/></figure>` : ""}
            </div>`,
            weight: (index === 0 ? 34 : 0)
              + group.reduce((total, leg) => total + legWeight(leg), 0)
              + (index === 0 && screenshot ? 300 : 0)
              + 22,
          })
        })
      }

      for (const item of hotels) {
        const hotel = item.hotel!
        const facts = [hotel.roomType, hotel.mealPlan, hotel.nights ? `${hotel.nights} noches` : "", hotel.rooms ? `${hotel.rooms} hab.` : ""].filter(Boolean)
        optionBlocks.push({
          html: `<div class="bc-panel bc-panel--hotel">
            <div class="bc-panel-head"><b>${e(hotel.name || item.description)}</b>${stars(hotel.stars)}</div>
            ${hotel.destination || hotel.address ? `<p class="bc-muted">${e([hotel.destination, hotel.address].filter(Boolean).join(" · "))}</p>` : ""}
            ${facts.length ? `<p>${facts.map(e).join(" · ")}</p>` : ""}
            ${hotel.checkinDate ? `<p class="bc-muted">${e(date(hotel.checkinDate))} → ${e(date(hotel.checkoutDate))}</p>` : ""}
          </div>`,
          weight: 100,
        })
      }

      if (services.length) {
        optionBlocks.push({
          html: `<div class="bc-chips">${services.map(item => `<span><b>${e(itemLabel(item))}</b>${e(item.description)}</span>`).join("")}</div>`,
          weight: 10 + services.reduce((total, item) => total + textHeight(`${itemLabel(item)} ${item.description}`, CONTENT_WIDTH - 24, 9.5, 1.5) + 14, 0),
        })
      }

      if (visible("pricing")) {
        const extras = [
          pricing.secondaryAmount != null ? `${pricing.secondaryLabel}: ${money(pricing.secondaryAmount, currency)}` : "",
          model.commercial.insuranceAmount > 0 ? `Incluye asistencia: ${money(model.commercial.insuranceAmount, currency)}` : "",
          model.commercial.transferAmount > 0 ? `Incluye traslados: ${money(model.commercial.transferAmount, currency)}` : "",
        ].filter(Boolean)
        if (extras.length) optionBlocks.push({ html: `<p class="bc-note">${extras.map(e).join(" · ")}</p>`, weight: 28 })
      }

      // El redondeo inferior va en el último panel de la alternativa. Con
      // `:last-of-type` lo recibía el último panel de cada bloque, y un vuelo
      // partido en dos bloques mostraba una costura a mitad del recuadro.
      const lastPanel = optionBlocks.reduce(
        (found, block, index) => (block.html.includes(`class="bc-panel`) ? index : found), -1
      )
      if (lastPanel >= 0) {
        optionBlocks[lastPanel] = {
          ...optionBlocks[lastPanel],
          html: optionBlocks[lastPanel].html.replace(`class="bc-panel`, `class="bc-panel bc-panel--last`),
        }
      }

      const [head, ...rest] = optionBlocks
      const glued = rest.length ? rest[0] : { html: "", weight: 0 }
      blocks.push({ html: head.html + glued.html, weight: head.weight + glued.weight })
      for (const block of rest.slice(1)) blocks.push(block)
    }

    // — Incluye / No incluye —
    if (visible("services-included") && (model.narrative.inclusions.length || model.narrative.exclusions.length)) {
      const column = (title: string, values: string[], modifier: string) => (
        values.length
          ? `<div class="bc-inc bc-inc--${modifier}"><h4>${e(title)}</h4><ul>${values.map(value => `<li>${e(value)}</li>`).join("")}</ul></div>`
          : ""
      )
      const columnHeight = (values: string[]) => values.reduce(
        (total, value) => total + textHeight(value, 300, 9.5, 1.45) + 8, 0
      )
      pushSection("Qué incluye", [{
        html: `<div class="bc-two">${column("Incluido", model.narrative.inclusions, "in")}${column("No incluido", model.narrative.exclusions, "out")}</div>`,
        weight: 44 + Math.max(columnHeight(model.narrative.inclusions), columnHeight(model.narrative.exclusions)),
      }])
    }

    if (model.narrative.publicNotes) {
      pushSection("Observaciones", splitTextAtWord(model.narrative.publicNotes, 900).map(part => ({
        html: `<p class="bc-text">${e(part)}</p>`,
        weight: textHeight(part, CONTENT_WIDTH, 10, 1.6) + 8,
      })))
    }

    // — Itinerario en grilla de dos columnas —
    if (visible("itinerary") && model.narrative.itinerary.length) {
      const dayCard = (day: typeof model.narrative.itinerary[number]) => `<div class="bc-day">
        <div class="bc-day-top"><b>Día ${e(day.day)}</b>${day.date ? `<span>${e(date(day.date))}</span>` : ""}</div>
        <h4>${e(day.title)}</h4><p>${e(day.description)}</p>
      </div>`
      const dayHeight = (day: typeof model.narrative.itinerary[number]) => (
        42 + textHeight(day.title, 300, 10.5, 1.3) + textHeight(day.description, 300, 9, 1.5) + 18
      )
      const rows: Block[] = []
      for (let index = 0; index < model.narrative.itinerary.length; index += 2) {
        const pair = model.narrative.itinerary.slice(index, index + 2)
        rows.push({
          html: `<div class="bc-two bc-two--days">${pair.map(dayCard).join("")}</div>`,
          weight: Math.max(...pair.map(dayHeight)) + 10,
        })
      }
      pushSection("Itinerario día a día", rows)
    }

    if (visible("recommendations") && model.narrative.recommendations.length) {
      pushSection("Recomendaciones", [{
        html: `<ul class="bc-bullets">${model.narrative.recommendations.map(value => `<li>${e(value)}</li>`).join("")}</ul>`,
        weight: 10 + model.narrative.recommendations.reduce((total, value) => total + textHeight(value, 670, 9.5, 1.5) + 8, 0),
      }])
    }

    if (visible("restrictions") && model.narrative.restrictions.length) {
      pushSection("A tener en cuenta", [{
        html: `<ul class="bc-bullets bc-bullets--warn">${model.narrative.restrictions.map(value => `<li>${e(value)}</li>`).join("")}</ul>`,
        weight: 10 + model.narrative.restrictions.reduce((total, value) => total + textHeight(value, 670, 9.5, 1.5) + 8, 0),
      }])
    }

    if (visible("payment-schedule")) {
      const items: Block[] = []
      const highlights = [
        model.commercial.depositAmount != null ? ["Seña", money(model.commercial.depositAmount, currency)] : null,
        model.commercial.balanceDueDate ? ["Saldo hasta", date(model.commercial.balanceDueDate)] : null,
      ].filter(Boolean) as string[][]
      if (highlights.length || model.commercial.paymentMethods.length) {
        items.push({
          html: `<div class="bc-pay">
            ${highlights.map(([label, value]) => `<div class="bc-pay-box"><span>${e(label)}</span><b>${e(value)}</b></div>`).join("")}
            ${model.commercial.paymentMethods.length ? `<div class="bc-pay-methods"><span>Formas de pago</span><b>${e(model.commercial.paymentMethods.join(" · "))}</b></div>` : ""}
          </div>`,
          weight: 66,
        })
      }
      if (model.commercial.paymentSchedule.length) {
        items.push({
          html: `<table class="bc-table"><thead><tr><th>Concepto</th><th>Vencimiento</th><th>Importe</th></tr></thead><tbody>
            ${model.commercial.paymentSchedule.map(row => `<tr><td><b>${e(row.label)}</b>${row.notes ? `<small>${e(row.notes)}</small>` : ""}</td><td>${e(date(row.dueDate))}</td><td class="bc-amount">${row.amount != null ? e(money(row.amount, currency)) : "—"}</td></tr>`).join("")}
          </tbody></table>`,
          weight: 42 + model.commercial.paymentSchedule.reduce((total, row) => total + (row.notes ? 42 : 30), 0),
        })
      }
      pushSection("Plan de pagos", items)
    }

    if (visible("legal-terms") && model.commercial.terms.length) {
      pushSection("Condiciones", [{
        html: `<ol class="bc-terms">${model.commercial.terms.map(value => `<li>${e(value)}</li>`).join("")}</ol>`,
        weight: 10 + model.commercial.terms.reduce((total, value) => total + textHeight(value, 670, 8.5, 1.5) + 5, 0),
      }])
    }

    if (visible("advisor-signature") && model.advisor.displayName) {
      const contact = [model.advisor.phone, model.advisor.email].filter(Boolean)
      const agency = [brand.phone, brand.email, brand.website, brand.instagram, brand.address].filter(Boolean)
      blocks.push({
        html: `<div class="bc-signoff">
          <div><span>Tu asesor de viaje</span><b>${e(model.advisor.displayName)}</b>${contact.length ? `<p>${contact.map(e).join(" · ")}</p>` : ""}</div>
          <div class="bc-signoff-end"><span>${e(brand.name)}</span>${agency.length ? `<p>${agency.map(e).join(" · ")}</p>` : ""}</div>
        </div>`,
        weight: 118,
      })
    }

    const pages = chunkByWeight(blocks, block => block.weight, CONTENT_BUDGET)
    const totalPages = pages.length + 1

    const facts = [
      ["Destino", model.trip.destination],
      ["Fechas", `${date(model.trip.departureDate)}${model.trip.returnDate ? ` — ${date(model.trip.returnDate)}` : ""}`],
      ["Pasajeros", passengerSummary(model)],
      ...(model.identity.validUntil ? [["Vigencia", date(model.identity.validUntil)]] : []),
    ] as string[][]

    const coverOptions = visible("pricing")
      ? model.options.map(option => {
        const pricing = getDocumentOptionPricing(model, option)
        const hotel = option.items.find(item => item.hotel)?.hotel
        const flight = option.items.find(item => item.flight)?.flight
        return `<div class="bc-cover-option${option.selected ? " is-featured" : ""}">
          <div><b>${e(option.title)}</b><span>${[hotel?.mealPlan, flight?.airline].filter(Boolean).map(e).join(" · ")}</span></div>
          <div class="bc-cover-option-price"><strong>${e(money(pricing.primaryAmount, currency))}</strong><span>${e(pricing.primaryLabel)}</span></div>
        </div>`
      }).join("")
      : ""

    const cover = `<section class="quotation-page bc-cover" data-pdf-page="1">
      <div class="bc-band">
        ${background ? `<img class="bc-band-photo" src="${e(background)}" alt=""/>` : ""}
        <div class="bc-band-inner">
          <div class="bc-band-top">
            ${logo ? `<img src="${e(logo)}" alt="${e(brand.name)}"/>` : `<b>${e(brand.name)}</b>`}
            <span>${e(manifest.copy.documentTitle)}</span>
          </div>
          <span class="bc-kicker">${e(model.trip.region || model.trip.destination)}</span>
          <h1>${e(model.identity.title || manifest.copy.documentTitle)}</h1>
        </div>
      </div>
      <div class="bc-cover-body">
        <div class="bc-facts">${facts.map(([label, value]) => `<div><span>${e(label)}</span><b>${e(value)}</b></div>`).join("")}</div>
        ${coverOptions ? `<div class="bc-cover-mid"><h2 class="bc-h2">Alternativas</h2><div class="bc-cover-options">${coverOptions}</div></div>` : ""}
        <div class="bc-cover-foot">
          <div><span>Preparado para</span><b>${e(model.customer.displayName)}</b></div>
          <div><span>Asesor</span><b>${e(model.advisor.displayName)}</b></div>
          <div class="bc-cover-foot-end"><span>Presupuesto</span><b>${e(model.identity.quotationNumber)}</b></div>
        </div>
      </div>
    </section>`

    const contentPages = pages.map((page, index) => `<section class="quotation-page bc-page" data-pdf-page="${index + 2}">
      <header class="bc-head">
        ${logo ? `<img src="${e(logo)}" alt="${e(brand.name)}"/>` : `<b>${e(brand.name)}</b>`}
        <span>${e(model.identity.title || manifest.copy.documentTitle)}</span>
      </header>
      <main class="bc-main">${page.map(block => `<div class="bc-b" data-w="${block.weight}">${block.html}</div>`).join("")}</main>
      <footer class="bc-foot">
        <span>${e(manifest.copy.availabilityNote)}</span>
        <span class="bc-pill">${index + 2}/${totalPages}</span>
      </footer>
    </section>`)

    const styles = `<style>
      .bc-cover,.bc-page{color:${manifest.theme.textColor};background:${manifest.theme.paperColor}}
      .bc-h2{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${primary};margin:0 0 12px;display:flex;align-items:center;gap:9px}
      .bc-h2::before{content:"";width:11px;height:11px;background:${accent};border-radius:3px;flex:0 0 11px}
      .bc-muted{color:${manifest.theme.secondaryColor}}

      /* Portada */
      .bc-cover{padding:0;display:flex;flex-direction:column}
      .bc-band{position:relative;height:392px;flex:0 0 392px;background:linear-gradient(140deg,${shade(primary, 0.12)},${primary} 58%,${shade(primary, -0.34)});overflow:hidden}
      .bc-band-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.3}
      .bc-band::after{content:"";position:absolute;right:-90px;top:-120px;width:360px;height:360px;border-radius:50%;border:1.5px solid ${accent};opacity:.3}
      .bc-band-inner{position:relative;height:100%;padding:46px 52px 62px;display:flex;flex-direction:column;color:#fff}
      .bc-band-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:auto}
      .bc-band-top img{max-width:190px;max-height:50px;object-fit:contain}
      .bc-band-top b{font-size:20px}
      .bc-band-top span{font-size:8.5px;letter-spacing:.24em;text-transform:uppercase;color:rgba(255,255,255,.75)}
      .bc-kicker{display:inline-block;align-self:flex-start;font-size:9px;letter-spacing:.24em;text-transform:uppercase;background:${accent};color:#fff;padding:5px 12px;border-radius:4px;margin-bottom:14px}
      .bc-band h1{font-size:36px;line-height:1.16;font-weight:800;margin:0;max-width:600px;letter-spacing:-.4px}

      /* z-index: la ficha monta sobre la banda, que crea contexto de apilado. */
      .bc-cover-body{position:relative;z-index:1;flex:1;padding:0 52px 44px;display:flex;flex-direction:column}
      .bc-cover-mid{margin:auto 0}
      .bc-facts{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:${shade(primary, 0.88)};border-radius:10px;overflow:hidden;margin:-34px 0 26px;box-shadow:0 6px 20px rgba(0,0,0,.09)}
      .bc-facts div{background:#fff;padding:14px 14px 15px}
      .bc-facts span{display:block;font-size:7.5px;letter-spacing:.18em;text-transform:uppercase;color:${manifest.theme.secondaryColor};margin-bottom:5px}
      .bc-facts b{font-size:11px;color:${primary};line-height:1.3}

      .bc-cover-options{display:flex;flex-direction:column;gap:8px}
      .bc-cover-option{display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid ${shade(primary, 0.86)};border-left:4px solid ${shade(primary, 0.7)};border-radius:9px;padding:13px 16px}
      .bc-cover-option.is-featured{border-left-color:${accent};background:${shade(accent, 0.95)}}
      .bc-cover-option b{display:block;font-size:11.5px;color:${primary}}
      .bc-cover-option span{font-size:9px;color:${manifest.theme.secondaryColor}}
      .bc-cover-option-price{text-align:right;white-space:nowrap}
      .bc-cover-option-price strong{display:block;font-size:19px;color:${primary};line-height:1.15}
      .bc-cover-option-price span{font-size:7.5px;letter-spacing:.14em;text-transform:uppercase}
      .bc-cover-foot{margin-top:auto;padding-top:22px;border-top:1px solid ${shade(primary, 0.86)};display:flex;gap:32px}
      .bc-cover-foot span{display:block;font-size:7.5px;letter-spacing:.18em;text-transform:uppercase;color:${manifest.theme.secondaryColor};margin-bottom:4px}
      .bc-cover-foot b{font-size:12px;color:${primary}}
      .bc-cover-foot-end{margin-left:auto;text-align:right}

      /* Páginas de contenido */
      .bc-page{padding:32px 52px 24px;display:flex;flex-direction:column}
      .bc-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:11px;border-bottom:3px solid ${accent};flex-shrink:0}
      .bc-head img{max-width:124px;max-height:30px;object-fit:contain}
      .bc-head b{font-size:13px;color:${primary}}
      .bc-head span{font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;color:${manifest.theme.secondaryColor};text-align:right}
      .bc-main{flex:1;min-height:0;padding-top:20px}
      .bc-b{display:flow-root}
      .bc-foot{flex-shrink:0;padding-top:9px;display:flex;justify-content:space-between;align-items:center;gap:16px;font-size:8px;color:${manifest.theme.secondaryColor}}
      .bc-pill{background:${shade(primary, 0.92)};color:${primary};padding:3px 9px;border-radius:999px;font-weight:700;white-space:nowrap}

      .bc-lead{font-size:11px;line-height:1.62;margin:0 0 12px}
      .bc-text{font-size:10px;line-height:1.6;margin:0 0 8px}
      .bc-note{font-size:8.5px;color:${manifest.theme.secondaryColor};margin:6px 0 16px}

      .bc-option-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;background:${primary};color:#fff;border-radius:9px 9px 0 0;padding:12px 16px}
      .bc-option-bar.is-featured{background:linear-gradient(100deg,${primary},${shade(primary, -0.28)})}
      .bc-option-bar>div span{font-size:7.5px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.7)}
      .bc-option-bar h3{font-size:13px;margin:2px 0 0;font-weight:800}
      .bc-option-price{text-align:right;white-space:nowrap}
      .bc-option-price strong{display:block;font-size:18px;line-height:1.1}
      .bc-option-price span{font-size:7.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.72)}

      .bc-panel{border:1px solid ${shade(primary, 0.87)};border-top:none;padding:12px 16px}
      .bc-panel--last{border-radius:0 0 9px 9px}
      .bc-panel--hotel{border-left:4px solid ${accent}}
      .bc-panel-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:9px}
      .bc-panel-head b{font-size:11.5px;color:${primary}}
      .bc-panel-head span{font-size:9px;color:${manifest.theme.secondaryColor}}
      .bc-panel p{font-size:9.5px;line-height:1.5;margin:3px 0}
      .bc-stars{font-size:9px;color:${accent};letter-spacing:1px}

      .bc-leg{padding:9px 0;border-top:1px dashed ${shade(primary, 0.8)}}
      .bc-panel .bc-leg:first-of-type{border-top:none;padding-top:0}
      .bc-leg-kind{display:block;font-size:7px;letter-spacing:.16em;text-transform:uppercase;color:${accent};margin-bottom:3px}
      .bc-leg-row{display:flex;align-items:center;gap:14px}
      .bc-leg-side{min-width:74px}
      .bc-leg-side strong{display:block;font-size:16px;font-weight:800;color:${primary};line-height:1.1}
      .bc-leg-side span{font-size:9.5px;color:${manifest.theme.secondaryColor}}
      .bc-leg-side--end{text-align:right}
      .bc-leg-mid{flex:1;text-align:center}
      .bc-leg-mid small{display:block;font-size:8px;color:${manifest.theme.secondaryColor}}
      .bc-leg-mid i{display:block;height:1px;background:${shade(primary, 0.72)};margin:5px 0}
      .bc-leg-mid span{font-size:8.5px;color:${manifest.theme.secondaryColor}}
      .bc-leg-foot{font-size:8px;color:${manifest.theme.secondaryColor};margin:6px 0 0}
      .bc-shot{margin:8px 0 0;text-align:center}
      .bc-shot img{max-width:100%;max-height:280px;display:inline-block;border-radius:5px}

      .bc-chips{display:flex;flex-direction:column;gap:5px;margin:9px 0 0}
      .bc-chips span{display:block;font-size:9.5px;line-height:1.5;padding:6px 12px;background:${shade(primary, 0.955)};border-radius:6px}
      .bc-chips b{color:${primary};font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;margin-right:8px}

      .bc-two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
      .bc-two--days{gap:12px;margin-bottom:12px}
      .bc-inc h4{font-size:9px;letter-spacing:.16em;text-transform:uppercase;margin:0 0 8px;color:${primary}}
      .bc-inc--out h4{color:${manifest.theme.secondaryColor}}
      .bc-inc ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}
      .bc-inc li{position:relative;font-size:9.5px;line-height:1.45;padding-left:15px}
      .bc-inc li::before{content:"";position:absolute;left:0;top:4px;width:8px;height:8px;border-radius:50%;background:${accent}}
      .bc-inc--out li::before{background:transparent;border:1px solid ${shade(primary, 0.62)}}

      .bc-day{border:1px solid ${shade(primary, 0.88)};border-radius:9px;padding:11px 13px;background:#fff}
      .bc-day-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
      .bc-day-top b{font-size:8px;letter-spacing:.16em;text-transform:uppercase;background:${primary};color:#fff;padding:3px 8px;border-radius:999px}
      .bc-day-top span{font-size:8px;color:${manifest.theme.secondaryColor}}
      .bc-day h4{font-size:10.5px;margin:0 0 4px;color:${primary};line-height:1.3}
      .bc-day p{font-size:9px;line-height:1.5;margin:0;color:${shade(manifest.theme.textColor, 0.1)}}

      .bc-bullets{list-style:none;margin:0 0 14px;padding:0;display:flex;flex-direction:column;gap:8px}
      .bc-bullets li{position:relative;font-size:9.5px;line-height:1.5;padding-left:15px}
      .bc-bullets li::before{content:"";position:absolute;left:0;top:4px;width:8px;height:8px;border-radius:50%;background:${accent}}
      .bc-bullets--warn li::before{background:${manifest.theme.secondaryColor};border-radius:2px}

      .bc-pay{display:flex;gap:10px;margin-bottom:12px;align-items:stretch}
      .bc-pay-box,.bc-pay-methods{background:${shade(primary, 0.94)};border-radius:9px;padding:11px 15px}
      .bc-pay-methods{flex:1}
      .bc-pay span{display:block;font-size:7.5px;letter-spacing:.16em;text-transform:uppercase;color:${manifest.theme.secondaryColor};margin-bottom:4px}
      .bc-pay b{font-size:12px;color:${primary}}
      .bc-pay-methods b{font-size:10px;font-weight:600;color:${manifest.theme.textColor}}
      .bc-table{width:100%;border-collapse:collapse;margin-bottom:14px}
      .bc-table th{font-size:7.5px;letter-spacing:.16em;text-transform:uppercase;color:${manifest.theme.secondaryColor};text-align:left;padding:0 12px 7px;border-bottom:2px solid ${shade(primary, 0.86)}}
      .bc-table th:last-child{text-align:right}
      .bc-table td{font-size:9.5px;padding:8px 12px;border-bottom:1px solid ${shade(primary, 0.93)};vertical-align:top}
      .bc-table td small{display:block;font-size:8px;color:${manifest.theme.secondaryColor};margin-top:2px}
      .bc-amount{text-align:right;font-weight:700;color:${primary};white-space:nowrap}

      .bc-terms{margin:0 0 14px;padding-left:16px;display:flex;flex-direction:column;gap:5px}
      .bc-terms li{font-size:8.5px;line-height:1.5;color:${shade(manifest.theme.textColor, 0.16)}}

      .bc-signoff{display:flex;gap:22px;background:${primary};color:#fff;border-radius:10px;padding:18px 20px}
      .bc-signoff>div{flex:1}
      .bc-signoff span{display:block;font-size:7.5px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.68);margin-bottom:5px}
      .bc-signoff b{font-size:15px}
      .bc-signoff p{font-size:9.5px;line-height:1.6;margin:6px 0 0;color:rgba(255,255,255,.86)}
      .bc-signoff-end{text-align:right;border-left:1px solid rgba(255,255,255,.2);padding-left:22px}
      .bc-signoff-end b{font-size:12px}
    </style>`

    return wrapDocument([styles, cover, ...contentPages], manifest)
  },
}
