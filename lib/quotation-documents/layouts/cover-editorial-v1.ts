import {
  chunkByWeight,
  escapeHtml as e,
  estimateTextHeight,
  formatDocumentDate as date,
  formatDocumentMoney as money,
  getDocumentBranding,
  getDocumentOptionPricing,
  isDocumentBlockVisible,
  itemLabel,
  optionItemVisible,
  passengerSummary,
  safeImageSource,
  shadeColor,
  splitTextAtWord,
  wrapDocument,
} from "@/lib/quotation-documents/html"
import type {
  QuotationDocumentDataV1,
  QuotationDocumentItem,
  QuotationLayoutRenderer,
  QuotationModelManifestV1,
} from "@/lib/quotation-documents/types"

/**
 * Altura útil de una página de contenido, en píxeles.
 * A4 (1123) menos padding, encabezado y pie, con margen de seguridad.
 */
const CONTENT_BUDGET = 950

interface Block {
  html: string
  weight: number
  /** Abre página antes de este bloque, aunque entre en la actual. */
  breakBefore?: boolean
}

/**
 * Reparte los bloques en páginas respetando el alto disponible y los saltos
 * pedidos. `chunkByWeight` sólo corta por peso, y cada alternativa tiene que
 * empezar en su propia hoja para no quedar partida entre dos.
 */
function paginate(blocks: Block[], budget: number): Block[][] {
  const pages: Block[][] = []
  let current: Block[] = []
  let used = 0

  for (const block of blocks) {
    const forcedBreak = block.breakBefore && current.length > 0
    const overflows = current.length > 0 && used + block.weight > budget
    if (forcedBreak || overflows) {
      pages.push(current)
      current = []
      used = 0
    }
    current.push(block)
    used += block.weight
  }

  if (current.length > 0) pages.push(current)
  return pages
}

/** Ancho útil de la caja de contenido: A4 menos el padding lateral de página. */
const CONTENT_WIDTH = 698

const shade = shadeColor
const textHeight = estimateTextHeight

function stars(count?: number): string {
  if (!count || count < 1) return ""
  return `<span class="ce-stars">${"★".repeat(Math.min(5, Math.round(count)))}</span>`
}

type FlightLeg = NonNullable<QuotationDocumentItem["flight"]>["legs"][number]

function legHtml(leg: FlightLeg): string {
  const kind = leg.type === "inbound" ? "Regreso" : leg.type === "outbound" ? "Ida" : "Tramo"
  const layovers = leg.layovers.map(stop => (
    `<p class="ce-layover">Escala en ${e(stop.city || stop.code)}${stop.waitingTime ? ` · espera ${e(stop.waitingTime)}` : ""}</p>`
  )).join("")
  return `<div class="ce-leg">
    <div class="ce-leg-top"><span class="ce-tag">${e(kind)}</span><span>${e(leg.duration)}</span></div>
    <div class="ce-leg-route">
      <div class="ce-leg-point"><strong>${e(leg.departureCode || leg.departureCity)}</strong><span>${e(leg.departureCity)}</span><b>${e(leg.departureTime)}</b></div>
      <div class="ce-leg-line"><i></i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg><i></i></div>
      <div class="ce-leg-point ce-leg-point--end"><strong>${e(leg.arrivalCode || leg.arrivalCity)}</strong><span>${e(leg.arrivalCity)}</span><b>${e(leg.arrivalTime)}</b></div>
    </div>
    ${leg.baggage ? `<p class="ce-leg-baggage">${e(leg.baggage)}</p>` : ""}
    ${layovers}
  </div>`
}

function legWeight(leg: FlightLeg): number {
  return 92 + (leg.baggage ? 14 : 0) + leg.layovers.length * 18
}

function hotelHtml(item: QuotationDocumentItem): string {
  const hotel = item.hotel
  if (!hotel) return ""
  const facts = [
    hotel.roomType,
    hotel.mealPlan,
    hotel.nights ? `${hotel.nights} noches` : "",
    hotel.rooms ? `${hotel.rooms} habitación${hotel.rooms === 1 ? "" : "es"}` : "",
  ].filter(Boolean)
  return `<div class="ce-card">
    <div class="ce-card-head"><h4>${e(hotel.name || item.description)}</h4>${stars(hotel.stars)}</div>
    ${hotel.destination || hotel.address ? `<p class="ce-card-sub">${e([hotel.destination, hotel.address].filter(Boolean).join(" · "))}</p>` : ""}
    ${facts.length ? `<p class="ce-card-facts">${facts.map(e).join(" · ")}</p>` : ""}
    ${hotel.checkinDate ? `<p class="ce-card-dates"><b>Check in</b> ${e(date(hotel.checkinDate))}<span></span><b>Check out</b> ${e(date(hotel.checkoutDate))}</p>` : ""}
  </div>`
}

function serviceRowHtml(item: QuotationDocumentItem): string {
  const detail = [item.transfer?.description, item.provider, item.quantity > 1 ? `${item.quantity} pasajeros` : ""]
    .filter(Boolean).join(" · ")
  return `<li><b>${e(itemLabel(item))}</b><span>${e(item.description)}${detail ? ` — ${e(detail)}` : ""}</span></li>`
}

export const coverEditorialV1Layout: QuotationLayoutRenderer = {
  catalog: {
    key: "cover-editorial-v1",
    version: 1,
    name: "Portada editorial",
    description: "Portada a página completa, cada alternativa en su propia hoja e itinerario en línea de tiempo.",
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
    const blocks: Block[] = []

    const pushSection = (title: string, items: Block[], subtitle?: string) => {
      if (!items.length) return
      const heading = `<div class="ce-section-head"><h2>${e(title)}</h2>${subtitle ? `<span>${e(subtitle)}</span>` : ""}</div>`
      blocks.push({ html: heading + items[0].html, weight: items[0].weight + 42 })
      for (const item of items.slice(1)) blocks.push(item)
    }

    // — Propuesta —
    if (visible("hero") && model.narrative.overview) {
      const parts = splitTextAtWord(model.narrative.overview, 900)
      pushSection("La propuesta", parts.map(part => ({
        html: `<p class="ce-lead">${e(part)}</p>`,
        weight: textHeight(part, CONTENT_WIDTH, 11.5, 1.62) + 12,
      })))
    }

    // — Qué incluye —
    // Va antes de las alternativas: el cliente lee primero qué contrata y
    // después con qué aerolínea y hotel.
    if (visible("services-included") && (model.narrative.inclusions.length || model.narrative.exclusions.length)) {
      const column = (title: string, values: string[], modifier: string) => (
        values.length
          ? `<div class="ce-list ce-list--${modifier}"><h4>${e(title)}</h4><ul>${values.map(value => `<li>${e(value)}</li>`).join("")}</ul></div>`
          : ""
      )
      // Dos columnas: pesa la más alta, no la suma de ambas.
      const columnHeight = (values: string[]) => values.reduce(
        (total, value) => total + textHeight(value, 326, 9.5, 1.45) + 6, 0
      )
      const tallest = Math.max(columnHeight(model.narrative.inclusions), columnHeight(model.narrative.exclusions))
      pushSection("Qué incluye", [{
        html: `<div class="ce-columns">${column("Incluido", model.narrative.inclusions, "in")}${column("No incluido", model.narrative.exclusions, "out")}</div>`,
        weight: 36 + tallest,
      }])
    }

    // — Detalle de cada alternativa —
    for (const option of model.options) {
      const pricing = getDocumentOptionPricing(model, option)
      const items = option.items.filter(item => optionItemVisible(item, manifest))
      const flights = items.filter(item => item.flight)
      const hotels = items.filter(item => item.hotel)
      const services = items.filter(item => !item.flight && !item.hotel)

      const head = `<div class="ce-option-head${option.selected ? " is-featured" : ""}">
        <div><span class="ce-label">Alternativa ${option.number}</span><h3>${e(option.title)}</h3></div>
        ${visible("pricing") ? `<div class="ce-option-price"><strong>${e(money(pricing.primaryAmount, currency))}</strong><span>${e(pricing.primaryLabel)}</span></div>` : ""}
      </div>`
      const optionBlocks: Block[] = [{ html: head, weight: 74 }]

      for (const item of flights) {
        const flight = item.flight!
        const meta = [flight.route, flight.cabin].filter(Boolean).map(e).join(" · ")
        // La mayoría de los vuelos se cargan como captura de pantalla del
        // buscador, sin tramos estructurados. Si no se dibuja la captura, esos
        // vuelos quedan reducidos a la aerolínea y la ruta.
        const screenshot = flight.legs.length ? null : safeImageSource(flight.screenshotUrl)
        // Tope medido: agrupar todos los tramos de un vuelo en un solo bloque
        // agrega una página entera, porque el bloque deja de entrar en el resto
        // de la página en curso.
        const chunks = chunkByWeight(flight.legs, legWeight, 420)
        const groups = chunks.length ? chunks : [[]]
        groups.forEach((group, index) => {
          optionBlocks.push({
            html: `<div class="ce-flight">
              ${index === 0 ? `<div class="ce-flight-head"><b>${e(flight.airline || item.description)}</b><span>${meta}</span></div>` : ""}
              ${group.map(legHtml).join("")}
              ${index === 0 && screenshot ? `<figure class="ce-shot"><img src="${e(screenshot)}" alt="Detalle del vuelo"/></figure>` : ""}
            </div>`,
            weight: (index === 0 ? 40 : 0)
              + group.reduce((total, leg) => total + legWeight(leg), 0)
              + (index === 0 && screenshot ? 300 : 0)
              + 10,
          })
        })
      }

      for (const item of hotels) {
        optionBlocks.push({ html: hotelHtml(item), weight: 96 })
      }

      if (services.length) {
        optionBlocks.push({
          html: `<ul class="ce-services">${services.map(serviceRowHtml).join("")}</ul>`,
          weight: 20 + services.length * 26,
        })
      }

      if (visible("pricing")) {
        const extras = [
          pricing.secondaryAmount != null ? `${pricing.secondaryLabel}: ${money(pricing.secondaryAmount, currency)}` : "",
          model.commercial.insuranceAmount > 0 ? `Incluye asistencia: ${money(model.commercial.insuranceAmount, currency)}` : "",
          model.commercial.transferAmount > 0 ? `Incluye traslados: ${money(model.commercial.transferAmount, currency)}` : "",
        ].filter(Boolean)
        if (extras.length) optionBlocks.push({ html: `<p class="ce-note">${extras.map(e).join(" · ")}</p>`, weight: 30 })
      }

      // El encabezado de la alternativa viaja pegado a su primer bloque: si no,
      // queda huérfano al pie de una página y el precio se separa del detalle.
      const [optionHead, ...optionRest] = optionBlocks
      const glued = optionRest.length ? optionRest[0] : { html: "", weight: 0 }
      blocks.push({
        html: `<div class="ce-option-open"></div>${optionHead.html}${glued.html}`,
        weight: optionHead.weight + glued.weight + 14,
        breakBefore: true,
      })
      for (const block of optionRest.slice(1)) blocks.push(block)
    }


    if (model.narrative.publicNotes) {
      pushSection("Observaciones", splitTextAtWord(model.narrative.publicNotes, 900).map(part => ({
        html: `<p class="ce-text">${e(part)}</p>`,
        weight: textHeight(part, CONTENT_WIDTH, 10.5, 1.6) + 8,
      })))
    }

    // — Itinerario —
    if (visible("itinerary") && model.narrative.itinerary.length) {
      const days = model.narrative.itinerary.flatMap(day => {
        const parts = splitTextAtWord(day.description, 700)
        return parts.map((part, index) => ({
          html: `<div class="ce-day">
            <div class="ce-day-badge">${index === 0 ? `<span>Día</span><b>${e(day.day)}</b>` : ""}</div>
            <div class="ce-day-body">${index === 0 ? `<h4>${e(day.title)}${day.date ? `<em>${e(date(day.date))}</em>` : ""}</h4>` : ""}<p>${e(part)}</p></div>
          </div>`,
          weight: (index === 0 ? 24 : 0) + textHeight(part, 582, 9.5, 1.55) + 9,
        }))
      })
      pushSection("Itinerario día a día", days)
    }

    if (visible("recommendations") && model.narrative.recommendations.length) {
      pushSection("Recomendaciones", [{
        html: `<ul class="ce-bullets">${model.narrative.recommendations.map(value => `<li>${e(value)}</li>`).join("")}</ul>`,
        weight: 12 + model.narrative.recommendations.reduce((total, value) => total + textHeight(value, 682, 9.5, 1.5) + 7, 0),
      }])
    }

    if (visible("restrictions") && model.narrative.restrictions.length) {
      pushSection("A tener en cuenta", [{
        html: `<ul class="ce-bullets ce-bullets--warn">${model.narrative.restrictions.map(value => `<li>${e(value)}</li>`).join("")}</ul>`,
        weight: 12 + model.narrative.restrictions.reduce((total, value) => total + textHeight(value, 682, 9.5, 1.5) + 7, 0),
      }])
    }

    // — Pagos —
    if (visible("payment-schedule")) {
      const highlights = [
        model.commercial.depositAmount != null ? ["Seña", money(model.commercial.depositAmount, currency)] : null,
        model.commercial.balanceDueDate ? ["Saldo hasta", date(model.commercial.balanceDueDate)] : null,
      ].filter(Boolean) as string[][]
      const items: Block[] = []
      if (highlights.length || model.commercial.paymentMethods.length) {
        items.push({
          html: `<div class="ce-pay-top">
            ${highlights.map(([label, value]) => `<div class="ce-pay-chip"><span>${e(label)}</span><b>${e(value)}</b></div>`).join("")}
            ${model.commercial.paymentMethods.length ? `<p class="ce-pay-methods"><span>Formas de pago</span>${e(model.commercial.paymentMethods.join(" · "))}</p>` : ""}
          </div>`,
          weight: 56 + (model.commercial.paymentMethods.length ? 34 : 0),
        })
      }
      if (model.commercial.paymentSchedule.length) {
        items.push({
          html: `<table class="ce-table"><thead><tr><th>Concepto</th><th>Vencimiento</th><th>Importe</th></tr></thead><tbody>
            ${model.commercial.paymentSchedule.map(row => `<tr><td><b>${e(row.label)}</b>${row.notes ? `<small>${e(row.notes)}</small>` : ""}</td><td>${e(date(row.dueDate))}</td><td class="ce-table-amount">${row.amount != null ? e(money(row.amount, currency)) : "—"}</td></tr>`).join("")}
          </tbody></table>`,
          weight: 46 + model.commercial.paymentSchedule.reduce((total, row) => total + (row.notes ? 44 : 30), 0),
        })
      }
      pushSection("Plan de pagos", items)
    }

    if (visible("legal-terms") && model.commercial.terms.length) {
      pushSection("Condiciones", [{
        html: `<ol class="ce-terms">${model.commercial.terms.map(value => `<li>${e(value)}</li>`).join("")}</ol>`,
        weight: 12 + model.commercial.terms.reduce((total, value) => total + textHeight(value, 682, 8.5, 1.5) + 5, 0),
      }])
    }

    // — Cierre —
    if (visible("advisor-signature") && model.advisor.displayName) {
      const contact = [model.advisor.phone, model.advisor.email].filter(Boolean)
      const agency = [brand.phone, brand.email, brand.website, brand.instagram].filter(Boolean)
      blocks.push({
        html: `<div class="ce-signoff">
          <div><span class="ce-label">Tu asesor de viaje</span><h3>${e(model.advisor.displayName)}</h3>${contact.length ? `<p>${contact.map(e).join(" · ")}</p>` : ""}</div>
          <div class="ce-signoff-agency"><b>${e(brand.name)}</b>${agency.length ? `<p>${agency.map(e).join("<br/>")}</p>` : ""}${brand.address ? `<p>${e(brand.address)}</p>` : ""}</div>
        </div>`,
        weight: 138,
      })
    }

    const pages = paginate(blocks, CONTENT_BUDGET)
    const primary = manifest.theme.primaryColor
    const accent = manifest.theme.accentColor
    const totalPages = pages.length + 1

    const facts = [
      ["Destino", model.trip.destination],
      ["Fechas", `${date(model.trip.departureDate)}${model.trip.returnDate ? ` — ${date(model.trip.returnDate)}` : ""}`],
      ["Pasajeros", passengerSummary(model)],
      ...(model.identity.validUntil ? [["Vigencia", date(model.identity.validUntil)]] : []),
    ] as string[][]

    const cover = `<section class="quotation-page ce-cover" data-pdf-page="1">
      ${background ? `<img class="ce-cover-photo" src="${e(background)}" alt=""/>` : ""}
      <div class="ce-cover-glow"></div>
      <svg class="ce-cover-art" viewBox="0 0 794 1123" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <circle cx="646" cy="150" r="196" fill="none" stroke="${accent}" stroke-width="1.2" opacity="0.35"/>
        <circle cx="646" cy="150" r="128" fill="none" stroke="${accent}" stroke-width="1.2" opacity="0.22"/>
        <path d="M-40 548 C 180 512 452 372 836 150" fill="none" stroke="${accent}" stroke-width="1.6" stroke-dasharray="6 10" opacity="0.6"/>
        <circle cx="26" cy="537" r="5" fill="${accent}" opacity="0.85"/>
        <g transform="translate(668,176) rotate(56) scale(1.5)">
          <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="${accent}" opacity="0.95"/>
        </g>
      </svg>
      <header class="ce-cover-head">
        <div class="ce-cover-brand">
          ${logo ? `<img class="ce-cover-logo" src="${e(logo)}" alt="${e(brand.name)}"/>` : ""}
          <b>${e(brand.name)}</b>
          ${brand.address ? `<p>${e(brand.address)}</p>` : ""}
        </div>
        <span>${e(manifest.copy.documentTitle)}</span>
      </header>
      <div class="ce-cover-main">
        <span class="ce-cover-kicker">${e(model.trip.region || model.trip.destination)}</span>
        <h1>${e(model.identity.title || manifest.copy.documentTitle)}</h1>
        <div class="ce-cover-facts">${facts.map(([label, value]) => `<div><span>${e(label)}</span><b>${e(value)}</b></div>`).join("")}</div>
      </div>
      <footer class="ce-cover-foot">
        <div><span>Preparado para</span><b>${e(model.customer.displayName)}</b></div>
        <div><span>Asesor</span><b>${e(model.advisor.displayName)}</b></div>
        <div class="ce-cover-foot-end"><span>Presupuesto</span><b>${e(model.identity.quotationNumber)}</b></div>
      </footer>
    </section>`

    const contentPages = pages.map((page, index) => `<section class="quotation-page ce-page" data-pdf-page="${index + 2}">
      <header class="ce-head">
        ${logo ? `<img src="${e(logo)}" alt="${e(brand.name)}"/>` : `<b>${e(brand.name)}</b>`}
        <span>${e(model.identity.title || manifest.copy.documentTitle)}</span>
      </header>
      <main class="ce-main">${page.map(block => `<div class="ce-b" data-w="${block.weight}">${block.html}</div>`).join("")}</main>
      <footer class="ce-foot">
        <span>${e(manifest.copy.availabilityNote)}</span>
        <span class="ce-foot-page">${e(model.identity.quotationNumber)} · ${index + 2}/${totalPages}</span>
      </footer>
    </section>`)

    const styles = `<style>
      .ce-cover,.ce-page{color:${manifest.theme.textColor}}
      .ce-label{display:block;font-size:8.5px;letter-spacing:.18em;text-transform:uppercase;color:${manifest.theme.secondaryColor};margin-bottom:3px}

      /* Portada */
      .ce-cover{background:linear-gradient(155deg,${shade(primary, 0.08)} 0%,${primary} 46%,${shade(primary, -0.42)} 100%);color:#fff;padding:52px 56px;display:flex;flex-direction:column}
      .ce-cover-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.26}
      .ce-cover-art{position:absolute;inset:0;width:100%;height:100%}
      .ce-cover-glow{position:absolute;inset:0;background:radial-gradient(circle at 82% 12%,${shade(primary, 0.3)} 0%,transparent 46%),radial-gradient(circle at 6% 96%,${shade(primary, -0.5)} 0%,transparent 52%)}
      .ce-cover-head,.ce-cover-main,.ce-cover-foot{position:relative;z-index:1}
      .ce-cover-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
      .ce-cover-brand img{max-width:290px;max-height:82px;margin-bottom:12px;display:block}
      .ce-cover-brand b{display:block;font-size:15px;font-weight:700;color:#fff;letter-spacing:.01em}
      .ce-cover-brand p{margin:4px 0 0;font-size:10.5px;line-height:1.5;color:rgba(255,255,255,.72);max-width:280px}
      .ce-cover-head>span{font-size:9px;letter-spacing:.24em;text-transform:uppercase;color:rgba(255,255,255,.72);padding-top:6px}
      .ce-cover-main{margin-top:auto;padding-bottom:44px}
      .ce-cover-kicker{display:inline-block;font-size:9.5px;letter-spacing:.26em;text-transform:uppercase;color:${accent};border:1px solid ${accent};border-radius:999px;padding:6px 14px;margin-bottom:22px}
      .ce-cover h1{font-size:45px;line-height:1.12;font-weight:800;margin:0 0 30px;letter-spacing:-.5px;max-width:620px}
      .ce-cover-facts{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.16);border-radius:10px;overflow:hidden;max-width:600px}
      .ce-cover-facts div{background:rgba(255,255,255,.06);padding:13px 16px}
      .ce-cover-facts span{display:block;font-size:8.5px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.62);margin-bottom:5px}
      .ce-cover-facts b{font-size:13px;font-weight:700}
      .ce-cover-foot{display:flex;gap:34px;align-items:flex-end;border-top:1px solid rgba(255,255,255,.2);padding-top:18px}
      .ce-cover-foot span{display:block;font-size:8.5px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.6);margin-bottom:4px}
      .ce-cover-foot b{font-size:13px}
      .ce-cover-foot-end{margin-left:auto;text-align:right}
      .ce-cover-foot-end b{color:${accent}}

      /* Páginas de contenido */
      .ce-page{padding:34px 48px 26px;display:flex;flex-direction:column;background:${manifest.theme.paperColor}}
      .ce-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:12px;border-bottom:1px solid ${shade(primary, 0.82)};flex-shrink:0}
      .ce-head img{max-width:132px;max-height:32px;object-fit:contain}
      .ce-head b{font-size:14px;color:${primary}}
      .ce-head span{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:${manifest.theme.secondaryColor};text-align:right}
      .ce-main{flex:1;min-height:0;padding-top:20px}
      /* flow-root: el alto del bloque incluye los márgenes de sus hijos, así el
         peso declarado por el layout y el alto real medido coinciden. */
      .ce-b{display:flow-root}
      .ce-foot{flex-shrink:0;border-top:1px solid ${shade(primary, 0.86)};padding-top:9px;display:flex;justify-content:space-between;gap:16px;font-size:8px;color:${manifest.theme.secondaryColor}}
      .ce-foot-page{white-space:nowrap}

      .ce-section-head{display:flex;align-items:baseline;gap:12px;margin:0 0 12px;padding-top:6px}
      .ce-section-head h2{font-size:17px;font-weight:800;color:${primary};margin:0;letter-spacing:-.2px}
      .ce-section-head h2::after{content:"";display:block;width:34px;height:3px;background:${accent};border-radius:2px;margin-top:6px}
      .ce-section-head span{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:${manifest.theme.secondaryColor}}
      .ce-lead{font-size:11.5px;line-height:1.62;margin:0 0 12px;color:${shade(manifest.theme.textColor, 0.12)}}
      .ce-text{font-size:10.5px;line-height:1.6;margin:0 0 8px}
      .ce-note{font-size:9px;color:${manifest.theme.secondaryColor};margin:6px 0 14px}


      /* Alternativa en detalle */
      .ce-option-open{height:6px}
      .ce-option-head{display:flex;align-items:center;justify-content:space-between;gap:16px;background:${shade(primary, 0.94)};border-left:4px solid ${primary};border-radius:8px;padding:11px 14px;margin-bottom:10px}
      .ce-option-head.is-featured{border-left-color:${accent}}
      .ce-option-head h3{font-size:13.5px;margin:0;color:${primary};font-weight:800}
      .ce-option-price{text-align:right;white-space:nowrap}
      .ce-option-price strong{display:block;font-size:19px;color:${primary};line-height:1.1}
      .ce-option-price span{font-size:8px;letter-spacing:.12em;text-transform:uppercase;color:${manifest.theme.secondaryColor}}

      .ce-flight{margin-bottom:8px}
      .ce-flight-head{display:flex;align-items:baseline;gap:10px;margin-bottom:8px}
      .ce-flight-head b{font-size:11px;color:${primary}}
      .ce-flight-head span{font-size:9px;color:${manifest.theme.secondaryColor}}
      .ce-leg{border:1px solid ${shade(primary, 0.88)};border-radius:8px;padding:9px 12px;margin-bottom:7px}
      .ce-leg-top{display:flex;justify-content:space-between;align-items:center;font-size:8.5px;color:${manifest.theme.secondaryColor}}
      .ce-tag{background:${primary};color:#fff;font-size:7.5px;letter-spacing:.14em;text-transform:uppercase;padding:3px 8px;border-radius:999px}
      .ce-leg-route{display:flex;align-items:center;gap:12px;padding:7px 0 2px}
      .ce-leg-point{display:flex;flex-direction:column;gap:1px;min-width:88px}
      .ce-leg-point strong{font-size:17px;font-weight:800;color:${primary};line-height:1.1}
      .ce-leg-point span{font-size:8.5px;color:${manifest.theme.secondaryColor}}
      .ce-leg-point b{font-size:11px}
      .ce-leg-point--end{text-align:right;align-items:flex-end}
      .ce-leg-line{flex:1;display:flex;align-items:center;gap:6px}
      .ce-leg-line i{flex:1;height:1px;background:${shade(primary, 0.7)};display:block}
      .ce-leg-line svg{width:13px;height:13px;fill:${accent};transform:rotate(90deg)}
      .ce-leg-baggage{font-size:8.5px;color:${manifest.theme.secondaryColor};margin:4px 0 0}
      .ce-shot{margin:0;padding:8px;border:1px solid ${shade(primary, 0.88)};border-radius:8px;background:#fff;text-align:center}
      .ce-shot img{max-width:100%;max-height:280px;display:inline-block}
      .ce-layover{font-size:8.5px;margin:5px 0 0;padding:4px 8px;border-radius:5px;background:${shade(accent, 0.88)};color:${shade(accent, -0.35)}}

      .ce-card{border:1px solid ${shade(primary, 0.88)};border-left:3px solid ${accent};border-radius:8px;padding:10px 13px;margin-bottom:8px}
      .ce-card-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
      .ce-card-head h4{font-size:12px;margin:0;color:${primary}}
      .ce-stars{font-size:9px;color:${accent};letter-spacing:1px}
      .ce-card-sub{font-size:9px;color:${manifest.theme.secondaryColor};margin:4px 0 0}
      .ce-card-facts{font-size:9.5px;margin:5px 0 0}
      .ce-card-dates{font-size:9px;margin:6px 0 0;color:${manifest.theme.secondaryColor};display:flex;align-items:center;gap:6px}
      .ce-card-dates b{color:${manifest.theme.textColor};font-weight:700}
      .ce-card-dates span{flex:0 0 26px;height:1px;background:${shade(primary, 0.75)}}

      .ce-services{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-direction:column;gap:4px}
      .ce-services li{display:flex;gap:8px;font-size:9.5px;line-height:1.45;padding:5px 10px;background:${shade(primary, 0.96)};border-radius:6px}
      .ce-services b{color:${primary};white-space:nowrap;font-size:9px;letter-spacing:.04em;text-transform:uppercase;padding-top:1px}

      .ce-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:12px}
      .ce-list h4{font-size:10px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 8px;color:${primary}}
      .ce-list--out h4{color:${manifest.theme.secondaryColor}}
      .ce-list ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
      .ce-list li{position:relative;font-size:9.5px;line-height:1.45;padding-left:16px}
      .ce-list li::before{content:"";position:absolute;left:0;top:5px;width:7px;height:7px;border-radius:2px;background:${accent}}
      .ce-list--out li::before{background:transparent;border:1px solid ${shade(primary, 0.6)}}

      .ce-day{display:flex;gap:12px;padding-bottom:9px}
      .ce-day-badge{flex:0 0 42px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:1px;padding-top:2px}
      .ce-day-badge span{font-size:7px;letter-spacing:.16em;text-transform:uppercase;color:${manifest.theme.secondaryColor}}
      .ce-day-badge b{width:26px;height:26px;border-radius:50%;background:${primary};color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center}
      .ce-day-body{flex:1;border-left:1px solid ${shade(primary, 0.86)};padding-left:14px}
      .ce-day-body h4{font-size:11px;margin:0 0 4px;color:${primary};display:flex;align-items:baseline;gap:8px}
      .ce-day-body h4 em{font-style:normal;font-size:8.5px;color:${manifest.theme.secondaryColor}}
      .ce-day-body p{font-size:9.5px;line-height:1.55;margin:0}

      .ce-bullets{list-style:none;margin:0 0 12px;padding:0;display:flex;flex-direction:column;gap:7px}
      .ce-bullets li{position:relative;font-size:9.5px;line-height:1.5;padding-left:16px}
      .ce-bullets li::before{content:"";position:absolute;left:0;top:5px;width:6px;height:6px;border-radius:50%;background:${accent}}
      .ce-bullets--warn li::before{border-radius:2px;background:${manifest.theme.secondaryColor}}

      .ce-pay-top{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:11px}
      .ce-pay-chip{background:${shade(primary, 0.94)};border-radius:8px;padding:8px 14px}
      .ce-pay-chip span{display:block;font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:${manifest.theme.secondaryColor}}
      .ce-pay-chip b{font-size:13px;color:${primary}}
      .ce-pay-methods{flex:1;min-width:200px;font-size:9.5px;margin:0;color:${manifest.theme.textColor}}
      .ce-pay-methods span{display:block;font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:${manifest.theme.secondaryColor};margin-bottom:3px}
      .ce-table{width:100%;border-collapse:collapse;margin-bottom:12px}
      .ce-table th{font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:${manifest.theme.secondaryColor};text-align:left;padding:0 10px 7px;border-bottom:1px solid ${shade(primary, 0.82)}}
      .ce-table td{font-size:9.5px;padding:8px 10px;border-bottom:1px solid ${shade(primary, 0.92)};vertical-align:top}
      .ce-table td small{display:block;font-size:8.5px;color:${manifest.theme.secondaryColor};margin-top:2px}
      .ce-table-amount{text-align:right;font-weight:700;color:${primary};white-space:nowrap}
      .ce-table th:last-child{text-align:right}

      .ce-terms{margin:0 0 12px;padding-left:16px;display:flex;flex-direction:column;gap:5px}
      .ce-terms li{font-size:8.5px;line-height:1.5;color:${shade(manifest.theme.textColor, 0.18)}}

      .ce-signoff{display:flex;gap:20px;align-items:stretch;background:${shade(primary, 0.95)};border-radius:10px;padding:16px 18px;margin-top:8px}
      .ce-signoff>div{flex:1}
      .ce-signoff h3{font-size:15px;margin:0 0 5px;color:${primary}}
      .ce-signoff p{font-size:9.5px;line-height:1.6;margin:0;color:${manifest.theme.secondaryColor}}
      .ce-signoff-agency{border-left:1px solid ${shade(primary, 0.82)};padding-left:20px;text-align:right}
      .ce-signoff-agency b{display:block;font-size:11px;color:${primary};margin-bottom:5px}
    </style>`

    return wrapDocument([styles, cover, ...contentPages], manifest)
  },
}
