/**
 * Portable WholeSale/Vibook PDF quote designs.
 *
 * Copiado desde wholesale-connect-ai/exports/pdf-designs/quote-pdf-designs.ts.
 * Ajustes mínimos de integración vibook (sin cambios visuales):
 *   - `nights_label` opcional en CombinedTemplateInput (las fechas llegan
 *     formateadas es-AR y computeNights no podría parsearlas)
 *   - espera de carga de <img> antes de capturar (logo remoto de Supabase)
 *   - fallback de nombre de agencia en el header cuando no hay logo
 *
 * Optional PDF rendering dependencies:
 *   npm install html2canvas jspdf
 *
 * Main exports:
 *   - renderFlightsSimpleHtml(data, branding)
 *   - renderFlightsMultipleHtml(data, branding)
 *   - renderCombinedHtml(data, branding)
 *   - renderHtmlToPdfBlob(html)
 *   - downloadPdfFromHtml(html, filename)
 *
 * Each logical page is a <div data-pdf-page> with:
 *   display:flex; flex-direction:column;
 * so header stays at top, content fills the middle, footer sticks to bottom.
 *
 * The renderer finds every [data-pdf-page] element, forces it to exact A4
 * pixel dimensions, renders each as a separate canvas, and assembles them into
 * a multi-page jsPDF document.
 */

export interface BrandingData {
  agency_name: string;
  agency_logo_url: string;
  agency_primary_color: string;
  agency_secondary_color: string;
  agency_contact_name: string;
  agency_contact_email: string;
  agency_contact_phone: string;
  pdf_footer_text?: string;
  pdf_header_bg_color?: string;
  pdf_footer_bg_color?: string;
}

export interface FlightTemplateData {
  airline: { code: string; name: string };
  departure_date: string;
  return_date: string;
  luggage: boolean;
  adults: number;
  childrens: number;
  legs: Array<{
    departure: { city_code: string; city_name: string; time: string };
    arrival: { city_code: string; city_name: string; time: string };
    duration: string;
    flight_type: string;
    layovers: Array<{
      waiting_time: string;
      destination_city: string;
      destination_code: string;
    }>;
  }>;
  price: { amount: string; currency: string };
  travel_assistance: number;
  transfers: number;
}

export interface HotelTemplateData {
  name: string;
  stars: string;
  location: string;
  roomDescription?: string;
  mealPlan?: string | null;
  price: string;
}

export interface CombinedTemplateInput {
  selected_flights: FlightTemplateData[];
  best_hotels?: HotelTemplateData[];
  has_flights: boolean;
  checkin: string;
  checkout: string;
  adults: number;
  childrens: number;
  infants: number;
  total_price: string;
  total_currency: string;
  travel_assistance: number;
  transfers: number;
  hotel_destination?: string;
  option_1_hotel?: HotelTemplateData;
  option_1_total?: string;
  option_2_hotel?: HotelTemplateData;
  option_2_total?: string;
  option_3_hotel?: HotelTemplateData;
  option_3_total?: string;
  has_multiple_hotels?: boolean;
  flight_price?: string;
  meal_plan?: string;
  has_hotel_segments?: boolean;
  hotel_destinations_summary?: string;
  hotel_summary_cards?: HotelSummaryCard[];
  nights_label?: string;
  addons?: AddonBreakdown;
  addonNote?: QuoteAddons;
}

/**
 * Desglose de precio con adicionales (seguro/traslado) para boxes de total
 * único. Todos los montos vienen ya formateados; insurance/transfer en null
 * cuando el adicional es 0 (no se muestra esa fila).
 */
export interface AddonBreakdown {
  base: string;
  insurance: string | null;
  transfer: string | null;
  total: string;
  currency: string;
}

/** Versión compacta de los adicionales para una nota "Incluye ...". */
export interface QuoteAddons {
  insurance: string | null;
  transfer: string | null;
  currency: string;
}

export interface HotelSummaryCard {
  city: string;
  short_dates: string;
  hotel_name?: string;
  stars: string;
  location: string;
  room_description?: string;
  meal_plan?: string;
}

// ─── PAGE WRAPPER ───
// Every logical page MUST use this so the generator can find it.
// flex layout ensures: header top, content middle, footer bottom.

export function pageOpen(): string {
  return `<div data-pdf-page style="display:flex;flex-direction:column;box-sizing:border-box;padding:0 40px;background:white;">`;
}
export function pageClose(): string {
  return `</div>`;
}

// ─── HEADER ───

export function renderCustomHeader(branding: BrandingData): string {
  const logoHtml = branding.agency_logo_url
    ? `<img src="${branding.agency_logo_url}" alt="Logo" style="max-height:140px; max-width:280px; object-fit:contain;" crossorigin="anonymous" />`
    : `<div style="font-size:20px;font-weight:700;color:${branding.agency_primary_color};padding:12px 0;">${branding.agency_name}</div>`;

  const bgColor = branding.pdf_header_bg_color || '';
  const bgStyle = bgColor ? `background:${bgColor};` : '';

  return `
    <div style="display:flex;justify-content:flex-end;align-items:center;padding:8px 40px;border-bottom:3px solid ${branding.agency_primary_color};flex-shrink:0;margin:0 -40px;${bgStyle}">
      ${logoHtml}
    </div>`;
}

// ─── FOOTER ───

export function renderCustomFooter(branding: BrandingData): string {
  const footerText = branding.pdf_footer_text || '';

  const bgColor = branding.pdf_footer_bg_color || '';
  const bgStyle = bgColor ? `background:${bgColor};` : '';
  const textColor = bgColor ? '#ffffff' : '#555';

  // Disclaimer sits ABOVE the footer (no background), then footer with background below
  return `
    <div style="margin-top:auto;flex-shrink:0;">
      <div style="padding:8px 0;font-size:7px;color:#555;line-height:1.25;border-top:1px solid #ddd;">
        <p style="margin:0 0 3px 0;">El presente presupuesto es orientativo y se encuentra sujeto a disponibilidad y modificación de tarifas al momento de realizar la reserva y/o emisión.</p>
        <p style="margin:0 0 3px 0;">La agencia no se responsabiliza por la documentación personal de los pasajeros, siendo exclusiva responsabilidad de los mismos contar con pasaporte vigente, visas, vacunas, permisos de salida del país, requisitos migratorios y sanitarios exigidos por las autoridades de cada destino.</p>
        <p style="margin:0 0 3px 0;">La confirmación de servicios queda sujeta al pago total o parcial, según condiciones del operador y proveedor interviniente.</p>
        <p style="margin:0;">Consultar por la asistencia al viajero.</p>
      </div>
      <div style="margin:0 -40px;padding:12px 40px;${bgStyle}display:flex;align-items:center;justify-content:flex-start;">
        ${footerText ? `<div style="font-size:13px;color:${textColor};line-height:1.5;text-align:left;">${footerText.replace(/\n/g, '<br/>')}</div>` : ''}
      </div>
    </div>`;
}

// ─── ADDONS (SEGURO / TRASLADO) ───

/**
 * Desglose Precio base / Seguro / Traslado / Total para los boxes de total
 * único. Solo muestra las filas de adicionales con monto > 0.
 */
function renderAddonBreakdown(addons: AddonBreakdown): string {
  const row = (label: string, value: string, total = false): string => `
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:${total ? '13px' : '11px'};color:${total ? '#111827' : '#6b7280'};font-weight:${total ? '700' : '500'};${total ? 'border-top:1px solid #e5e7eb;padding-top:5px;margin-top:5px;' : 'margin-bottom:3px;'}">
      <span>${label}</span><span>$${value} ${addons.currency}</span>
    </div>`;
  return `
    <div style="margin-top:8px;padding:9px 12px;background:#ffffff;border:1px dashed #d1d5db;border-radius:6px;">
      ${row('Precio base', addons.base)}
      ${addons.insurance ? row('Seguro', addons.insurance) : ''}
      ${addons.transfer ? row('Traslado', addons.transfer) : ''}
      ${row('Total', addons.total, true)}
    </div>`;
}

/** Nota compacta "Incluye Seguro $X · Traslado $Y" para boxes por opción. */
function renderAddonNote(addons: QuoteAddons): string {
  const parts: string[] = [];
  if (addons.insurance) parts.push(`Seguro $${addons.insurance}`);
  if (addons.transfer) parts.push(`Traslado $${addons.transfer}`);
  if (!parts.length) return '';
  return `<div style="font-size:10px;color:#6b7280;margin-top:3px;">Incluye ${parts.join(' · ')} ${addons.currency}</div>`;
}

// ─── INCLUDES BOX ───

function renderIncludesBox(flight: FlightTemplateData | null, hasHotel: boolean, hasTransfers: boolean, hasTravelAssistance: boolean, mealPlan?: string): string {
  return `
    <div style="background:#f8f9fa;border:1px solid #e5e7eb;border-radius:8px;padding:15px 20px;margin-bottom:20px;">
      <div style="font-size:14px;font-weight:700;color:#333;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:15px;text-align:center;">Incluye</div>
      <div style="display:flex;justify-content:space-between;gap:12px;">
        <!-- Vuelo -->
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;padding:10px 8px;background:white;border-radius:6px;border:1px solid #e5e7eb;${!flight ? 'opacity:0.4;background:#f5f5f5;' : ''}">
          <div style="font-size:24px;margin-bottom:6px;">✈️</div>
          <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:2px;">Vuelo${flight ? ' ' + flight.airline.name : ''}</div>
          ${flight
            ? `<div style="font-size:10px;color:#6b7280;">${flight.legs[0]?.departure.city_code || ''} - ${flight.legs[0]?.arrival.city_code || ''}</div>
               <div style="font-size:10px;color:#10b981;font-weight:600;margin-top:3px;">Incluido</div>`
            : `<div style="font-size:10px;color:#9ca3af;font-style:italic;">No incluido</div>`}
        </div>
        <!-- Hotel -->
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;padding:10px 8px;background:${hasHotel ? 'white' : '#f5f5f5'};border-radius:6px;border:1px solid #e5e7eb;${!hasHotel ? 'opacity:0.4;' : ''}">
          <div style="font-size:24px;margin-bottom:6px;">🏨</div>
          <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:2px;">Hotel</div>
          ${hasHotel
            ? `${mealPlan === 'all_inclusive' ? '<div style="font-size:10px;color:#6b7280;">All Inclusive</div>' : ''}
               <div style="font-size:10px;color:#10b981;font-weight:600;margin-top:3px;">Incluido</div>`
            : `<div style="font-size:10px;color:#9ca3af;font-style:italic;">No incluido</div>`}
        </div>
        <!-- Traslado -->
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;padding:10px 8px;background:${hasTransfers ? 'white' : '#f5f5f5'};border-radius:6px;border:1px solid #e5e7eb;${!hasTransfers ? 'opacity:0.4;' : ''}">
          <div style="font-size:24px;margin-bottom:6px;">🚐</div>
          <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:2px;">Traslado</div>
          ${hasTransfers
            ? `<div style="font-size:10px;color:#6b7280;">Aeropuerto - Hotel</div>
               <div style="font-size:10px;color:#10b981;font-weight:600;margin-top:3px;">Incluido</div>`
            : `<div style="font-size:10px;color:#9ca3af;font-style:italic;">No incluido</div>`}
        </div>
        <!-- Seguro -->
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;padding:10px 8px;background:${hasTravelAssistance ? 'white' : '#f5f5f5'};border-radius:6px;border:1px solid #e5e7eb;${!hasTravelAssistance ? 'opacity:0.4;' : ''}">
          <div style="font-size:24px;margin-bottom:6px;">🏥</div>
          <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:2px;">Seguro</div>
          ${hasTravelAssistance
            ? `<div style="font-size:10px;color:#6b7280;">Asistencia médica</div>
               <div style="font-size:10px;color:#10b981;font-weight:600;margin-top:3px;">Incluido</div>`
            : `<div style="font-size:10px;color:#9ca3af;font-style:italic;">No incluido</div>`}
        </div>
      </div>
    </div>`;
}

// ─── FLIGHT DETAIL ───

function renderFlightLeg(leg: FlightTemplateData['legs'][0], label: string, date: string, luggage: boolean): string {
  const layoversHtml = leg.layovers && leg.layovers.length > 0
    ? `<div style="margin-top:10px;padding:8px 10px;background:#fef3c7;border-radius:4px;border-left:2px solid #f59e0b;">
        ${leg.layovers.map(l => `
          <div style="font-weight:600;color:#92400e;font-size:11px;margin-bottom:3px;">Escala en ${l.destination_city}</div>
          <div style="font-size:10px;color:#78350f;">Tiempo de espera: ${l.waiting_time} en ${l.destination_code} (${l.destination_city})</div>
        `).join('')}
       </div>`
    : '';

  return `
    <div style="margin-bottom:15px;padding:12px 15px;background:#fafafa;border-radius:6px;border-left:3px solid #d93;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-weight:600;color:#374151;font-size:13px;">${label} <span style="background:#fff3e0;color:#d93;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;">${date}</span></div>
        <div>
          <span style="background:#fff3e0;color:#d93;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;">${luggage ? 'Equipaje de bodega incluido' : 'Carry On incluido'}</span>
          <span style="background:#fff3e0;color:#d93;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;margin-left:2px;">${leg.flight_type}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="text-align:center;flex:1;">
          <div style="font-size:16px;font-weight:700;color:#1f2937;">${leg.departure.city_code}</div>
          <div style="font-size:10px;color:#6b7280;margin-top:1px;">${leg.departure.city_name}</div>
          <div style="font-size:13px;font-weight:600;color:#374151;margin-top:3px;">${leg.departure.time}</div>
        </div>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;margin:0 15px;">
          <div style="width:100%;height:1px;background:#d1d5db;position:relative;">
            <div style="position:absolute;right:-4px;top:-2px;width:0;height:0;border-left:6px solid #d1d5db;border-top:3px solid transparent;border-bottom:3px solid transparent;"></div>
            <div style="position:absolute;top:-15px;left:50%;transform:translateX(-50%);background:white;padding:1px 6px;border-radius:3px;font-size:10px;color:#6b7280;white-space:nowrap;">${leg.duration}</div>
          </div>
        </div>
        <div style="text-align:center;flex:1;">
          <div style="font-size:16px;font-weight:700;color:#1f2937;">${leg.arrival.city_code}</div>
          <div style="font-size:10px;color:#6b7280;margin-top:1px;">${leg.arrival.city_name}</div>
          <div style="font-size:13px;font-weight:600;color:#374151;margin-top:3px;">${leg.arrival.time}</div>
        </div>
      </div>
      ${layoversHtml}
    </div>`;
}

function renderFlightDetail(flight: FlightTemplateData, optionIndex?: number, addonNote?: QuoteAddons): string {
  const titleSuffix = optionIndex !== undefined ? ` - OPCIÓN ${optionIndex}` : '';

  const legsHtml = flight.legs.map((leg, i) => {
    const isOutbound = leg.flight_type === 'outbound' || i === 0;
    const label = isOutbound ? 'Vuelo de ida' : 'Vuelo de regreso';
    const date = isOutbound ? flight.departure_date : flight.return_date;
    return renderFlightLeg(leg, label, date, flight.luggage);
  }).join('');

  return `
    <div style="margin-bottom:15px;">
      <h2 style="font-size:18px;font-weight:700;color:#333;margin-bottom:15px;text-align:center;">DETALLE DEL VUELO${titleSuffix}</h2>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f5f5f5;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:30px;height:30px;background:#d93;border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;">${flight.airline.code}</div>
          <div>
            <div style="font-size:18px;font-weight:700;color:#333;">${flight.airline.name}</div>
            <div style="margin-bottom:5px;"><span style="font-weight:600;margin-right:5px;color:#333;font-size:11px;">Ocupación:</span><span style="color:#666;font-size:11px;">${flight.adults} adultos${flight.childrens > 0 ? `, ${flight.childrens} niños` : ''}</span></div>
          </div>
        </div>
        ${optionIndex !== undefined ? `<div style="text-align:right;"><div style="font-size:20px;font-weight:700;color:#d93;">$${flight.price.amount} ${flight.price.currency}</div>${addonNote ? renderAddonNote(addonNote) : ''}</div>` : ''}
      </div>
      ${legsHtml}
    </div>`;
}

// ─── FLIGHTS SIMPLE TEMPLATE ───

export function renderFlightsSimpleHtml(data: { selected_flights: FlightTemplateData[]; travel_assistance: number; transfers: number; addons?: AddonBreakdown }, branding: BrandingData): string {
  const flight = data.selected_flights[0];
  if (!flight) return '';

  const hasTransfers = data.transfers > 0;
  const hasTravelAssistance = data.travel_assistance > 0;

  let pagesHtml = '';

  // ── Page 1: Summary ──
  pagesHtml += pageOpen();
  pagesHtml += renderCustomHeader(branding);
  pagesHtml += `<div style="flex:1;padding-top:20px;">`;
  pagesHtml += `<h1 style="font-size:24px;font-weight:700;color:#333;margin-bottom:20px;text-align:center;text-transform:uppercase;">PRESUPUESTO DE VIAJE</h1>`;
  pagesHtml += `
    <div style="background:#f8f9fa;padding:15px 20px;border-radius:8px;margin-bottom:20px;border-left:3px solid #d93;">
      <div style="display:flex;justify-content:space-between;gap:12px;">
        <div style="flex:1;text-align:center;">
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:600;margin-bottom:3px;">Destino</div>
          <div style="font-size:14px;font-weight:700;color:#333;">${flight.legs[0]?.departure.city_code || ''} -- ${flight.legs[0]?.arrival.city_code || ''}</div>
        </div>
        <div style="flex:1;text-align:center;">
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:600;margin-bottom:3px;">Fechas</div>
          <div style="font-size:14px;font-weight:700;color:#333;">${flight.departure_date} - ${flight.return_date}</div>
        </div>
        <div style="flex:1;text-align:center;">
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:600;margin-bottom:3px;">Pasajeros</div>
          <div style="font-size:14px;font-weight:700;color:#333;">${flight.adults} ${flight.adults === 1 ? 'Adulto' : 'Adultos'}${flight.childrens > 0 ? `, ${flight.childrens} ${flight.childrens === 1 ? 'Niño' : 'Niños'}` : ''}</div>
        </div>
      </div>
    </div>`;
  pagesHtml += renderIncludesBox(flight, false, hasTransfers, hasTravelAssistance);
  pagesHtml += `
    <div style="background:white;border-radius:8px;padding:15px 20px;margin-bottom:15px;box-shadow:0 2px 4px rgba(0,0,0,0.1);border:2px solid #10b981;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f5f5f5;">
        <div></div>
        <div style="font-size:20px;font-weight:700;color:#d93;">$${flight.price.amount} ${flight.price.currency}</div>
      </div>
      <div style="background:#fafafa;padding:10px 12px;border-radius:6px;">
        <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">✈️ Vuelos ${flight.airline.name}</div>
        <div style="font-size:11px;color:#6b7280;line-height:1.4;">
          ${flight.legs[0]?.departure.city_name || ''} ⇄ ${flight.legs[0]?.arrival.city_name || ''}<br/>
          ${flight.legs[0]?.flight_type || ''}<br/>
          ${flight.luggage ? 'Equipaje de bodega incluido' : 'Carry On incluido'}
        </div>
        ${hasTransfers ? '<div style="font-size:11px;color:#6b7280;margin-top:4px;">🚐 Traslados, por pasajero.</div>' : ''}
        ${hasTravelAssistance ? '<div style="font-size:11px;color:#6b7280;margin-top:4px;">🏥 Tarjeta de asistencia médica, por pasajero.</div>' : ''}
      </div>
      ${data.addons ? renderAddonBreakdown(data.addons) : ''}
    </div>`;
  pagesHtml += `</div>`; // close flex:1 content
  pagesHtml += renderCustomFooter(branding);
  pagesHtml += pageClose();

  // ── Page 2: Flight detail ──
  pagesHtml += pageOpen();
  pagesHtml += renderCustomHeader(branding);
  pagesHtml += `<div style="flex:1;padding-top:20px;">`;
  pagesHtml += renderFlightDetail(flight);
  pagesHtml += `</div>`;
  pagesHtml += renderCustomFooter(branding);
  pagesHtml += pageClose();

  return wrapHtmlDocument(pagesHtml);
}

// ─── FLIGHTS MULTIPLE TEMPLATE ───

export function renderFlightsMultipleHtml(data: { selected_flights: FlightTemplateData[]; travel_assistance: number; transfers: number; addonNote?: QuoteAddons }, branding: BrandingData): string {
  const flights = data.selected_flights;
  if (!flights.length) return '';

  const hasTransfers = data.transfers > 0;
  const hasTravelAssistance = data.travel_assistance > 0;
  const isMultiple = flights.length > 1;

  let pagesHtml = '';

  flights.forEach((flight, idx) => {
    pagesHtml += pageOpen();
    pagesHtml += renderCustomHeader(branding);
    pagesHtml += `<div style="flex:1;padding-top:20px;">`;
    pagesHtml += renderFlightDetail(flight, isMultiple ? idx + 1 : undefined, data.addonNote);
    if (idx === 0) pagesHtml += renderIncludesBox(flight, false, hasTransfers, hasTravelAssistance);
    pagesHtml += `</div>`;
    pagesHtml += renderCustomFooter(branding);
    pagesHtml += pageClose();
  });

  return wrapHtmlDocument(pagesHtml);
}

// ─── COMBINED FLIGHT + HOTEL TEMPLATE ───

export function renderCombinedHtml(data: CombinedTemplateInput, branding: BrandingData): string {
  const flights = data.selected_flights;
  const hasFlights = data.has_flights && flights.length > 0;
  const hasTransfers = data.transfers > 0;
  const hasTravelAssistance = data.travel_assistance > 0;
  const firstFlight = hasFlights ? flights[0] : null;

  let pagesHtml = '';

  // ── Page 1: Summary ──
  pagesHtml += pageOpen();
  pagesHtml += renderCustomHeader(branding);
  pagesHtml += `<div style="flex:1;padding-top:20px;">`;
  pagesHtml += `<h1 style="font-size:24px;font-weight:700;color:#333;margin-bottom:20px;text-align:center;text-transform:uppercase;">PRESUPUESTO DE VIAJE</h1>`;
  pagesHtml += `
    <div style="background:#f8f9fa;padding:15px 20px;border-radius:8px;margin-bottom:20px;border-left:3px solid #d93;">
      <div style="display:flex;justify-content:space-between;gap:12px;">
        <div style="flex:1;text-align:center;">
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:600;margin-bottom:3px;">Destino</div>
          <div style="font-size:14px;font-weight:700;color:#333;">${data.has_hotel_segments ? (data.hotel_destinations_summary || '') : hasFlights ? `${firstFlight!.legs[0]?.departure.city_code || ''} -- ${firstFlight!.legs[0]?.arrival.city_code || ''}` : (data.hotel_destination || '')}</div>
        </div>
        <div style="flex:1;text-align:center;">
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:600;margin-bottom:3px;">Fechas</div>
          <div style="font-size:14px;font-weight:700;color:#333;">${data.checkin} - ${data.checkout}</div>
        </div>
        <div style="flex:1;text-align:center;">
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:600;margin-bottom:3px;">Pasajeros</div>
          <div style="font-size:14px;font-weight:700;color:#333;">${data.adults} ${data.adults === 1 ? 'Adulto' : 'Adultos'}${data.childrens > 0 ? `, ${data.childrens} ${data.childrens === 1 ? 'Niño' : 'Niños'}` : ''}${data.infants > 0 ? `, ${data.infants} ${data.infants === 1 ? 'Infante' : 'Infantes'}` : ''}</div>
        </div>
        <div style="flex:1;text-align:center;">
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:600;margin-bottom:3px;">Duración</div>
          <div style="font-size:14px;font-weight:700;color:#333;">${data.nights_label || computeNights(data.checkin, data.checkout)}</div>
        </div>
      </div>
    </div>`;
  pagesHtml += renderIncludesBox(firstFlight, true, hasTransfers, hasTravelAssistance, data.meal_plan);
  pagesHtml += renderHotelOptions(data, hasFlights, hasTransfers, hasTravelAssistance, firstFlight);
  pagesHtml += `</div>`;
  pagesHtml += renderCustomFooter(branding);
  pagesHtml += pageClose();

  // ── Flight detail pages ──
  if (hasFlights) {
    flights.forEach((flight) => {
      pagesHtml += pageOpen();
      pagesHtml += renderCustomHeader(branding);
      pagesHtml += `<div style="flex:1;padding-top:20px;">`;
      pagesHtml += renderFlightDetail(flight);
      pagesHtml += `</div>`;
      pagesHtml += renderCustomFooter(branding);
      pagesHtml += pageClose();
    });
  }

  return wrapHtmlDocument(pagesHtml);
}

// ─── HOTEL OPTIONS RENDERING ───

function renderHotelOptions(data: CombinedTemplateInput, hasFlights: boolean, hasTransfers: boolean, hasTravelAssistance: boolean, firstFlight: FlightTemplateData | null): string {
  if (data.has_hotel_segments && data.hotel_summary_cards && data.hotel_summary_cards.length > 0) {
    return renderHotelSegmentSummary(data);
  }

  if (data.option_1_hotel) {
    return renderHotelOptionsCards(data, hasFlights, hasTransfers, hasTravelAssistance, firstFlight);
  }

  if (hasFlights && firstFlight) {
    return `
      <div style="background:white;border-radius:8px;padding:15px 20px;margin-bottom:15px;box-shadow:0 2px 4px rgba(0,0,0,0.1);border:2px solid #10b981;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f5f5f5;">
          <div></div>
          <div style="font-size:20px;font-weight:700;color:#d93;">$${data.total_price} ${data.total_currency}</div>
        </div>
        <div style="background:#fafafa;padding:10px 12px;border-radius:6px;">
          <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">✈️ Vuelos ${firstFlight.airline.name}</div>
          <div style="font-size:11px;color:#6b7280;line-height:1.4;">
            ${firstFlight.legs[0]?.departure.city_name || ''} ⇄ ${firstFlight.legs[0]?.arrival.city_name || ''}<br/>
            ${firstFlight.legs[0]?.flight_type || ''}<br/>
            ${firstFlight.luggage ? 'Equipaje de bodega incluido' : 'Carry On incluido'}
          </div>
          ${hasTransfers ? '<div style="font-size:11px;color:#6b7280;margin-top:4px;">🚐 Traslados, por pasajero.</div>' : ''}
          ${hasTravelAssistance ? '<div style="font-size:11px;color:#6b7280;margin-top:4px;">🏥 Tarjeta de asistencia médica, por pasajero.</div>' : ''}
        </div>
        ${data.addons ? renderAddonBreakdown(data.addons) : ''}
      </div>`;
  }

  return '';
}

function renderHotelOptionsCards(data: CombinedTemplateInput, hasFlights: boolean, hasTransfers: boolean, hasTravelAssistance: boolean, firstFlight: FlightTemplateData | null): string {
  const options = [
    { hotel: data.option_1_hotel, total: data.option_1_total, label: 'Opción 1' },
    { hotel: data.option_2_hotel, total: data.option_2_total, label: 'Opción 2' },
    { hotel: data.option_3_hotel, total: data.option_3_total, label: 'Opción 3' },
  ].filter(o => o.hotel);

  const sharedFlightsHtml = hasFlights && firstFlight ? `
    <div style="margin-bottom:10px;text-align:center;">
      <div style="background:#fafafa;padding:10px 12px;border-radius:6px;">
        <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">✈️ Vuelos ${firstFlight.airline.name}</div>
        <div style="font-size:11px;color:#6b7280;line-height:1.4;">
          ${firstFlight.legs[0]?.departure.city_name || ''} ⇄ ${firstFlight.legs[0]?.arrival.city_name || ''} · ${firstFlight.legs[0]?.flight_type || ''} · ${firstFlight.luggage ? 'Equipaje de bodega' : 'Carry On'}
        </div>
        ${hasTransfers ? '<div style="font-size:11px;color:#6b7280;margin-top:4px;">🚐 Traslados, por pasajero.</div>' : ''}
        ${hasTravelAssistance ? '<div style="font-size:11px;color:#6b7280;margin-top:4px;">🏥 Tarjeta de asistencia médica, por pasajero.</div>' : ''}
      </div>
    </div>` : '';

  const cardsHtml = options.map(opt => `
    <div style="flex:1;max-width:220px;border:1px solid #e0e0e0;border-radius:8px;padding:12px;background:#fafafa;">
      <div style="border-bottom:1px solid #e0e0e0;padding-bottom:8px;margin-bottom:8px;">
        ${data.has_multiple_hotels ? `<div style="font-weight:bold;font-size:12px;color:#333;">${opt.label}</div>` : ''}
        <div style="font-size:16px;font-weight:bold;color:#2563eb;margin-top:4px;">$${opt.total} ${data.total_currency}</div>
        <div style="font-size:8px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:0.3px;margin-top:2px;">Total paquete${hasFlights ? ' (vuelo + hotel)' : ''}</div>
        ${data.addonNote ? renderAddonNote(data.addonNote) : ''}
      </div>
      <div style="font-size:11px;">
        <div style="font-weight:600;color:#333;margin-bottom:4px;">🏨 ${opt.hotel!.name || opt.hotel!.location || 'Hotel'}</div>
        <div style="color:#666;font-size:10px;">${opt.hotel!.stars} estrellas</div>
        <div style="color:#666;font-size:10px;">${opt.hotel!.location}</div>
        ${opt.hotel!.roomDescription ? `<div style="color:#666;font-size:10px;font-style:italic;">🛏️ ${opt.hotel!.roomDescription}</div>` : ''}
      </div>
    </div>`).join('');

  return `
    ${sharedFlightsHtml}
    <div style="display:flex;gap:12px;margin-top:10px;justify-content:center;">
      ${cardsHtml}
    </div>`;
}

function renderHotelSegmentSummary(data: CombinedTemplateInput): string {
  const cards = data.hotel_summary_cards || [];
  const cardsHtml = cards.map(card => `
    <div style="border:1px solid #e0e0e0;border-radius:8px;padding:8px 10px;background:#fafafa;min-height:100px;box-sizing:border-box;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;border-bottom:1px solid #ececec;padding-bottom:4px;margin-bottom:4px;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;color:#8b6914;">${card.city}</div>
        <div style="font-size:8px;font-weight:600;color:#666;text-align:right;white-space:nowrap;">${card.short_dates}</div>
      </div>
      <div style="font-weight:700;font-size:10px;color:#333;line-height:1.2;margin-bottom:3px;">${card.hotel_name || card.city || 'Hotel'}</div>
      <div style="font-size:8px;color:#666;line-height:1.2;margin-bottom:1px;">${card.stars} estrellas · ${card.location}</div>
      ${card.room_description ? `<div style="font-size:8px;color:#666;">🛏️ ${card.room_description}</div>` : ''}
      ${card.meal_plan ? `<div style="display:inline-block;margin-top:2px;padding:1px 5px;border-radius:999px;background:#f3ead0;color:#7a5c12;font-size:7px;font-weight:700;text-transform:uppercase;">${card.meal_plan}</div>` : ''}
    </div>`).join('');

  return `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">
      ${cardsHtml}
    </div>`;
}

// ─── HELPERS ───

function computeNights(checkin: string, checkout: string): string {
  try {
    const ci = new Date(checkin);
    const co = new Date(checkout);
    const diff = Math.round((co.getTime() - ci.getTime()) / 86400000);
    return `${diff} ${diff === 1 ? 'Noche' : 'Noches'}`;
  } catch {
    return '';
  }
}

export function wrapHtmlDocument(bodyContent: string): string {
  return `<div style="margin:0;padding:0;font-family:'Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;width:100%;box-sizing:border-box;">
  <style>* { box-sizing: border-box; margin: 0; }</style>
  ${bodyContent}
</div>`;
}

const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

// El logo del header es una imagen remota (Supabase Storage): hay que esperar
// a que cargue antes de capturar con html2canvas o sale en blanco.
async function waitForImages(container: HTMLElement, timeoutMs = 5000): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    images.map(
      img =>
        new Promise<void>(resolve => {
          if (img.complete) return resolve();
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          setTimeout(done, timeoutMs);
        })
    )
  );
}

export async function renderHtmlToPdfBlob(html: string): Promise<Blob> {
  const html2canvas = (await import('html2canvas')).default;
  const jsPDF = (await import('jspdf')).default;

  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = `${A4_WIDTH_PX}px`;
  container.style.zIndex = '-1';
  container.style.pointerEvents = 'none';
  container.style.background = 'white';
  container.style.fontFamily = "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
  document.body.appendChild(container);

  try {
    await waitForImages(container);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const pageDivs = Array.from(container.querySelectorAll('[data-pdf-page]')) as HTMLElement[];
    const targets = pageDivs.length > 0 ? pageDivs : [container];

    for (const page of targets) {
      page.style.width = `${A4_WIDTH_PX}px`;
      page.style.height = `${A4_HEIGHT_PX}px`;
      page.style.minHeight = `${A4_HEIGHT_PX}px`;
      page.style.maxHeight = `${A4_HEIGHT_PX}px`;
      page.style.overflow = 'hidden';
      page.style.boxSizing = 'border-box';
    }

    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    for (let i = 0; i < targets.length; i++) {
      const canvas = await html2canvas(targets[i], {
        scale: 2,
        useCORS: true,
        logging: false,
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX,
        windowWidth: A4_WIDTH_PX,
        scrollX: 0,
        scrollY: 0,
        backgroundColor: '#ffffff',
      });

      if (i > 0) pdf.addPage();
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);
    }

    return pdf.output('blob');
  } finally {
    document.body.removeChild(container);
  }
}

export async function downloadPdfFromHtml(html: string, filename = 'cotizacion.pdf'): Promise<void> {
  const blob = await renderHtmlToPdfBlob(html);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
