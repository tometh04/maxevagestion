# Lead → Emilia → Quotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-27-lead-emilia-quotation-design.md`](../specs/2026-05-27-lead-emilia-quotation-design.md)

**Goal:** Cuando el vendedor aprieta "Cotizar" en el modal del lead, se abre un chat embebido con Emilia (input pre-rellenado por gpt-4o-mini) → selecciona 1 vuelo + N hoteles → genera cotización DRAFT con N opciones vinculada al lead. Feature en beta, gated solo para org "Oficial Testing Vibook".

**Architecture:** Modal swap (D2) sin refactorizar el contenido actual. Nueva tabla relación `conversations.lead_id` + 2 endpoints nuevos en `/api/leads/[id]/emilia` (GET/POST). Mapper puro (testeable) transforma EmiliaFlight/EurovipsHotel a payload de `/api/quotations` con N opciones. Reusa `FlightResultCard` + `HotelResultCard` del módulo /emilia. Beta gating en 3 touchpoints vía constante compartida.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase, shadcn/ui, Jest, OpenAI `gpt-4o-mini` (parser), API externa Emilia (`api.vibook.ai/search`).

**Skills relevantes:** `impeccable` (frontend-design) para la UI del chat en Task 7.

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `lib/feature-flags.ts` | Crear | Constante central `FEATURE_FLAG_LEAD_EMILIA_CHAT` |
| `supabase/migrations/{ts}_add_lead_id_to_conversations.sql` | Crear | Migración additiva (lead_id + index parcial) |
| `lib/emilia/lead-context.ts` | Crear | Helper puro: arma prompt sugerido vía OpenAI con fallback |
| `lib/emilia/__tests__/lead-context.test.ts` | Crear | Tests del helper |
| `lib/emilia/quotation-mapper.ts` | Crear | Función pura: selección Emilia → payload `/api/quotations` |
| `lib/emilia/__tests__/quotation-mapper.test.ts` | Crear | Tests del mapper (1 vuelo + N hoteles, parseStars, etc.) |
| `app/api/emilia/chat/route.ts` | Modificar | Fix shape: parsea `meta.combinedData.flights/.hotels` además de legacy |
| `app/api/leads/[id]/emilia/route.ts` | Crear | GET (devuelve conv activa) + POST (crea conv + prompt) con beta gating |
| `app/api/leads/[id]/emilia/__tests__/route.test.ts` | Crear | Tests del endpoint (gating, multi-tenant, OpenAI fallback) |
| `components/sales/lead-emilia-chat.tsx` | Crear | Chat embebido completo con cards seleccionables y CTA generar |
| `components/sales/lead-detail-dialog.tsx` | Modificar | Estado `mode: "detail" \| "emilia"` + swap del contenido |
| `supabase/migrations/{ts}_seed_lead_emilia_chat_beta.sql` | Crear | Seed: activa el flag para Oficial Testing Vibook |

---

## Task 1: Constante central del feature flag

**Files:**
- Create: `lib/feature-flags.ts`

- [ ] **Step 1: Crear el archivo de constantes**

```ts
// lib/feature-flags.ts
/**
 * Feature flag keys centralizadas.
 *
 * Patrón: estas keys se consultan via `getOrgFeatureFlag()` de
 * `lib/settings/org-features.ts` contra la tabla `organization_settings`.
 *
 * Cuando un feature pasa a GA, se remueven los 3+ touchpoints que la
 * referencian. Tener la constante acá facilita el grep para encontrarlos
 * todos.
 */

/**
 * Beta: chat embebido de Emilia desde el modal del lead.
 * Habilitado solo para Oficial Testing Vibook hasta GA.
 * Touchpoints: lead-detail-dialog.tsx, /api/leads/[id]/emilia/route.ts (GET y POST).
 */
export const FEATURE_FLAG_LEAD_EMILIA_CHAT = "features.lead_emilia_chat"
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit lib/feature-flags.ts`
Expected: sin output (sin errores).

- [ ] **Step 3: Commit**

```bash
git add lib/feature-flags.ts
git commit -m "feat(flags): add lead_emilia_chat feature flag constant"
```

---

## Task 2: Migración SQL — agregar lead_id a conversations

**Files:**
- Create: `supabase/migrations/{timestamp}_add_lead_id_to_conversations.sql`

- [ ] **Step 1: Generar migración**

Run: `npx supabase migration new add_lead_id_to_conversations`
Expected: imprime path del nuevo archivo en `supabase/migrations/`.

- [ ] **Step 2: Pegar contenido**

```sql
-- Agrega lead_id a conversations para vincular chats de Emilia
-- al lead desde donde se originaron. Migración additiva.

-- 1. Columna nueva nullable (no rompe filas existentes del módulo /emilia)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS lead_id UUID
  REFERENCES leads(id) ON DELETE SET NULL;

-- 2. Index parcial: solo filas con lead_id (la mayoría seguirán siendo
--    chats genéricos sin lead). Ahorra espacio y queries más rápidas.
CREATE INDEX IF NOT EXISTS idx_conversations_lead
  ON conversations(lead_id, last_message_at DESC)
  WHERE lead_id IS NOT NULL;

-- 3. Comentario documental
COMMENT ON COLUMN conversations.lead_id IS
  'Si la conversación se inició desde el modal de un lead específico, link al lead. NULL = chat genérico desde /emilia.';
```

- [ ] **Step 3: Aplicar migración en local**

Run: `npx supabase db push` (o `npx supabase migration up` según setup)
Expected: log "Applied migration {timestamp}_add_lead_id_to_conversations.sql"

- [ ] **Step 4: Regenerar types TS**

Run: `npm run db:generate`
Expected: `lib/supabase/types.ts` actualizado. Verificar que `Database["public"]["Tables"]["conversations"]["Row"]` ahora tiene `lead_id: string | null`.

- [ ] **Step 5: Verificar query plan del index parcial**

Run en SQL editor:
```sql
EXPLAIN SELECT * FROM conversations
WHERE lead_id = '00000000-0000-0000-0000-000000000000'
ORDER BY last_message_at DESC LIMIT 1;
```
Expected: ver `Index Scan using idx_conversations_lead` en el plan.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_add_lead_id_to_conversations.sql lib/supabase/types.ts
git commit -m "feat(db): add lead_id to conversations with partial index"
```

---

## Task 3: Helper `lib/emilia/lead-context.ts` (puro, testeable)

**Files:**
- Create: `lib/emilia/lead-context.ts`
- Test: `lib/emilia/__tests__/lead-context.test.ts`

- [ ] **Step 1: Escribir tests primero (TDD)**

```ts
// lib/emilia/__tests__/lead-context.test.ts
import { buildFallbackPrompt, type LeadInput } from "../lead-context"

describe("buildFallbackPrompt", () => {
  it("usa destination + region cuando ambos están presentes", () => {
    const lead: LeadInput = {
      contact_name: "Juan Pérez",
      destination: "Cancún",
      region: "CARIBE",
      notes: null,
    }
    expect(buildFallbackPrompt(lead)).toBe(
      "Cotizar viaje a Cancún (Caribe) para Juan Pérez. Necesito fechas y cantidad de pasajeros."
    )
  })

  it("omite region si no está", () => {
    const lead: LeadInput = {
      contact_name: "Juan Pérez",
      destination: "Cancún",
      region: null,
      notes: null,
    }
    expect(buildFallbackPrompt(lead)).toBe(
      "Cotizar viaje a Cancún para Juan Pérez. Necesito fechas y cantidad de pasajeros."
    )
  })

  it("omite destination si no está y avisa", () => {
    const lead: LeadInput = {
      contact_name: "Juan Pérez",
      destination: null,
      region: null,
      notes: null,
    }
    expect(buildFallbackPrompt(lead)).toBe(
      "Cotizar viaje para Juan Pérez. Necesito destino, fechas y cantidad de pasajeros."
    )
  })

  it("normaliza region a Title Case", () => {
    const lead: LeadInput = {
      contact_name: "X",
      destination: "Madrid",
      region: "EUROPA",
      notes: null,
    }
    expect(buildFallbackPrompt(lead)).toBe(
      "Cotizar viaje a Madrid (Europa) para X. Necesito fechas y cantidad de pasajeros."
    )
  })
})
```

- [ ] **Step 2: Verificar que tests fallan**

Run: `npm run test -- lead-context`
Expected: tests FAIL con error tipo "Cannot find module '../lead-context'".

- [ ] **Step 3: Implementar el helper**

```ts
// lib/emilia/lead-context.ts
/**
 * Helper para construir el contexto del lead que se usa:
 *   1. Como input para gpt-4o-mini que sugiere un prompt para Emilia.
 *   2. Como fallback determinístico si OpenAI falla / timeout / no hay key.
 *
 * Función pura: sin I/O. La llamada a OpenAI vive en el endpoint
 * /api/leads/[id]/emilia que es quien decide cuándo usar uno u otro.
 */

export interface LeadInput {
  contact_name: string
  destination: string | null
  region: string | null
  notes: string | null
}

const REGION_LABEL: Record<string, string> = {
  ARGENTINA: "Argentina",
  CARIBE: "Caribe",
  BRASIL: "Brasil",
  EUROPA: "Europa",
  EEUU: "EEUU",
  CRUCEROS: "Cruceros",
  OTROS: "Otros",
}

/**
 * Prompt fallback determinístico cuando OpenAI no está disponible o falla.
 * Siempre devuelve algo accionable que el vendedor puede ajustar y enviar.
 */
export function buildFallbackPrompt(lead: LeadInput): string {
  const hasDest = !!lead.destination && lead.destination.trim() !== "" && lead.destination !== "Sin destino"
  const hasRegion = !!lead.region && lead.region in REGION_LABEL && lead.region !== "OTROS"
  const regionLabel = hasRegion ? REGION_LABEL[lead.region as keyof typeof REGION_LABEL] : null

  if (hasDest) {
    const dest = regionLabel ? `${lead.destination} (${regionLabel})` : lead.destination
    return `Cotizar viaje a ${dest} para ${lead.contact_name}. Necesito fechas y cantidad de pasajeros.`
  }
  return `Cotizar viaje para ${lead.contact_name}. Necesito destino, fechas y cantidad de pasajeros.`
}

/**
 * Arma el prompt-system para gpt-4o-mini que extrae datos estructurados
 * de las notas del lead y genera un prompt natural en español para Emilia.
 */
export function buildOpenAIInstructions(lead: LeadInput): { system: string; user: string } {
  const system = [
    "Sos un asistente que ayuda a vendedores de viajes a armar pedidos de cotización para una API externa llamada Emilia.",
    "Recibís los datos de un lead (contacto + notas libres del CRM) y generás UN solo mensaje en español argentino, dirigido a Emilia, listo para enviar tal cual.",
    "Reglas del mensaje generado:",
    "- Empezá con 'Cotizar viaje a {destino}' (incluí región si se conoce).",
    "- Inferí del texto libre: cantidad de adultos/niños, fechas o mes preferido, duración, tipo de hospedaje (all-inclusive, hostel, hotel), categoría preferida y presupuesto si aparece.",
    "- Si las notas no aclaran algo, NO inventes valores: omití el dato.",
    "- Si no hay destino, pedí explícitamente el destino al vendedor.",
    "- Máximo 2 frases. Sin saludos. Sin firma. Sin emojis.",
    "Devolvé SOLO el texto del mensaje, sin envoltorios.",
  ].join("\n")

  const user = JSON.stringify({
    contact_name: lead.contact_name,
    destination: lead.destination,
    region: lead.region,
    notes: lead.notes,
  })

  return { system, user }
}
```

- [ ] **Step 4: Verificar que tests pasan**

Run: `npm run test -- lead-context`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/emilia/lead-context.ts lib/emilia/__tests__/lead-context.test.ts
git commit -m "feat(emilia): add lead-context helper for prompt building"
```

---

## Task 4: Helper `lib/emilia/quotation-mapper.ts` (puro, testeable)

**Files:**
- Create: `lib/emilia/quotation-mapper.ts`
- Test: `lib/emilia/__tests__/quotation-mapper.test.ts`

- [ ] **Step 1: Escribir tests primero (incluyendo parseStars, mapper completo)**

```ts
// lib/emilia/__tests__/quotation-mapper.test.ts
import {
  parseStars,
  buildQuotationPayload,
  type EmiliaFlight,
  type EurovipsHotel,
  type GeneralData,
  type LeadInfo,
} from "../quotation-mapper"

describe("parseStars", () => {
  it.each([
    ["5 estrellas", 5],
    ["3 estrellas", 3],
    ["★★★★★", 5],
    ["★★★", 3],
    ["5 star", 5],
    ["5 stars", 5],
    ["5*", 5],
    ["Boutique", null],
    ["", null],
    [null, null],
    [undefined, null],
  ])("parsea '%s' como %s", (input, expected) => {
    expect(parseStars(input as any)).toBe(expected)
  })
})

const lead: LeadInfo = {
  id: "lead-1",
  contact_name: "Juan",
  destination: "Punta Cana",
  region: "CARIBE",
  agency_id: "agency-1",
}

const general: GeneralData = {
  departureDate: "2026-07-01",
  returnDate: "2026-07-07",
  adults: 2,
  children: 0,
  infants: 0,
}

function makeFlight(overrides: Partial<EmiliaFlight> = {}): EmiliaFlight {
  return {
    id: "f1",
    airline: { code: "AR", name: "Aerolíneas Argentinas" },
    price: { amount: 850, currency: "USD", netAmount: 700, taxAmount: 150, fareAmount: 700 },
    adults: 2,
    children: 0,
    departure_date: "2026-07-01",
    departure_time: "10:00",
    arrival_date: "2026-07-01",
    arrival_time: "16:00",
    return_date: "2026-07-07",
    trip_type: "round_trip",
    duration: { total: 360, formatted: "6h 0m" },
    stops: { count: 1, direct: false, connections: 1 },
    baggage: { included: true, details: "23kg", quantity: 1 },
    cabin: { class: "ECONOMY", brandName: "Economy Light" },
    booking: { validatingCarrier: "AR", lastTicketingDate: "2026-06-25", fareType: "PUB" },
    legs: [{
      legNumber: 1,
      options: [{
        optionId: "o1",
        duration: 360,
        segments: [{
          airline: "AR",
          flightNumber: "1304",
          departure: { airportCode: "EZE", date: "2026-07-01", time: "10:00" },
          arrival: { airportCode: "PUJ", date: "2026-07-01", time: "16:00" },
          duration: 360,
          cabinClass: "Y",
          baggage: "23kg",
        }],
      }],
    }],
    provider: "TVC",
    transactionId: "tx-1",
    ...overrides,
  }
}

function makeHotel(overrides: Partial<EurovipsHotel> = {}): EurovipsHotel {
  return {
    id: "hotel_h1",
    unique_id: "h1",
    name: "Riu Palace",
    category: "5 estrellas",
    city: "Punta Cana",
    address: "Playa Bávaro s/n",
    phone: "+1-809-555-1111",
    images: ["https://img.example/riu1.jpg", "https://img.example/riu2.jpg"],
    check_in: "2026-07-01",
    check_out: "2026-07-07",
    nights: 6,
    rooms: [
      {
        type: "Doble Estándar",
        description: "All Inclusive con vista al mar",
        price_per_night: 200,
        total_price: 1200,
        currency: "USD",
        availability: 3,
        occupancy_id: "1",
        xml_occupancy_id: "OC-1",
        fare_id_broker: "FB-1",
        adults: 2,
      },
    ],
    policy_cancellation: "No reembolsable",
    policy_lodging: "Check-in 15hs",
    search_adults: 2,
    search_children: 0,
    provider: "EUROVIPS",
    ...overrides,
  }
}

describe("buildQuotationPayload", () => {
  it("1 vuelo + 3 hoteles → 3 opciones, cada una con copia del vuelo", () => {
    const hotelA = makeHotel({ id: "hotel_a", unique_id: "a", name: "Riu" })
    const hotelB = makeHotel({ id: "hotel_b", unique_id: "b", name: "Iberostar" })
    const hotelC = makeHotel({ id: "hotel_c", unique_id: "c", name: "Hilton" })

    const payload = buildQuotationPayload({
      lead,
      selectedFlight: makeFlight(),
      selectedHotels: [
        { hotel: hotelA, roomIndex: 0 },
        { hotel: hotelB, roomIndex: 0 },
        { hotel: hotelC, roomIndex: 0 },
      ],
      generalData: general,
    })

    expect(payload.lead_id).toBe("lead-1")
    expect(payload.agency_id).toBe("agency-1")
    expect(payload.options).toHaveLength(3)
    for (const opt of payload.options) {
      const flightItem = opt.items.find(i => i.item_type === "FLIGHT")
      expect(flightItem).toBeDefined()
      expect(flightItem!.airline).toBe("Aerolíneas Argentinas")
      expect(flightItem!.flight_route).toBe("EZE - PUJ")
      expect(flightItem!.flight_stops).toBe(1)
      expect(flightItem!.flight_class).toBe("ECONOMY")
      expect(flightItem!.generates_commission).toBe(true)
      expect(flightItem!.cost_amount).toBe(0)
      expect(flightItem!.operator_id).toBeNull()
      expect(flightItem!.admin_fee_percentage).toBe(0)
    }
    expect(payload.options[0].items.find(i => i.item_type === "HOTEL")!.hotel_name).toBe("Riu")
    expect(payload.options[1].items.find(i => i.item_type === "HOTEL")!.hotel_name).toBe("Iberostar")
    expect(payload.options[2].items.find(i => i.item_type === "HOTEL")!.hotel_name).toBe("Hilton")
  })

  it("0 vuelos + 2 hoteles → 2 opciones sin vuelo", () => {
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: null,
      selectedHotels: [
        { hotel: makeHotel(), roomIndex: 0 },
        { hotel: makeHotel({ id: "hotel_h2", unique_id: "h2", name: "Otro" }), roomIndex: 0 },
      ],
      generalData: general,
    })
    expect(payload.options).toHaveLength(2)
    for (const opt of payload.options) {
      expect(opt.items.find(i => i.item_type === "FLIGHT")).toBeUndefined()
    }
  })

  it("1 vuelo + 0 hoteles → 1 opción con solo vuelo", () => {
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: makeFlight(),
      selectedHotels: [],
      generalData: general,
    })
    expect(payload.options).toHaveLength(1)
    expect(payload.options[0].items).toHaveLength(1)
    expect(payload.options[0].items[0].item_type).toBe("FLIGHT")
  })

  it("hotel: mapea total_price desde el room seleccionado", () => {
    const hotel = makeHotel({
      rooms: [
        { type: "A", description: "", price_per_night: 100, total_price: 600, currency: "USD", availability: 1, occupancy_id: "1" },
        { type: "B", description: "", price_per_night: 200, total_price: 1200, currency: "USD", availability: 1, occupancy_id: "2" },
      ],
    })
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: null,
      selectedHotels: [{ hotel, roomIndex: 1 }],
      generalData: general,
    })
    const hotelItem = payload.options[0].items[0]
    expect(hotelItem.unit_price).toBe(1200)
    expect(hotelItem.room_type).toBe("B")
  })

  it("hotel: parsea stars desde category", () => {
    const hotel = makeHotel({ category: "★★★★★" })
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: null,
      selectedHotels: [{ hotel, roomIndex: 0 }],
      generalData: general,
    })
    expect(payload.options[0].items[0].hotel_stars).toBe(5)
  })

  it("hotel: usa images[0] como photo_url, null si vacío", () => {
    const hotel = makeHotel({ images: [] })
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: null,
      selectedHotels: [{ hotel, roomIndex: 0 }],
      generalData: general,
    })
    expect(payload.options[0].items[0].hotel_photo_url).toBeNull()
  })

  it("defaults: currency USD, pricing_mode PER_PERSON, payment_methods []", () => {
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: makeFlight(),
      selectedHotels: [{ hotel: makeHotel(), roomIndex: 0 }],
      generalData: general,
    })
    expect(payload.currency).toBe("USD")
    expect(payload.pricing_mode).toBe("PER_PERSON")
    expect(payload.payment_methods).toEqual([])
  })

  it("lanza si generalData no tiene departureDate", () => {
    expect(() =>
      buildQuotationPayload({
        lead,
        selectedFlight: makeFlight(),
        selectedHotels: [],
        generalData: { ...general, departureDate: "" },
      })
    ).toThrow("Faltan fechas")
  })

  it("lanza si no hay ni vuelo ni hoteles", () => {
    expect(() =>
      buildQuotationPayload({
        lead,
        selectedFlight: null,
        selectedHotels: [],
        generalData: general,
      })
    ).toThrow("Seleccioná al menos un vuelo o un hotel")
  })

  it("clampea más de 4 hoteles (defensa adicional al límite del UI)", () => {
    const hotels = Array.from({ length: 6 }, (_, i) =>
      ({ hotel: makeHotel({ id: `h${i}`, unique_id: `${i}`, name: `H${i}` }), roomIndex: 0 })
    )
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: null,
      selectedHotels: hotels,
      generalData: general,
    })
    expect(payload.options).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Verificar que tests fallan**

Run: `npm run test -- quotation-mapper`
Expected: tests FAIL con error tipo "Cannot find module '../quotation-mapper'".

- [ ] **Step 3: Implementar el helper completo**

```ts
// lib/emilia/quotation-mapper.ts
/**
 * Función pura que mapea la selección de cards de Emilia
 * (1 vuelo opcional + N hoteles) al payload exacto que espera
 * POST /api/quotations.
 *
 * Patrón: 1 vuelo + N hoteles = N opciones de cotización, donde el
 * vuelo se replica en cada opción (alineado con el sync de vuelos
 * que ya hace QuotationBuilderDialog al editar).
 *
 * Defense: si el UI permite >4 hoteles por bug, este mapper clampea
 * a 4 silenciosamente (el UI ya muestra toast).
 */

const MAX_OPTIONS = 4

// =============================================================================
// Tipos de input — basados en EmiliaFlight (TVC) y EurovipsHotel server-side
// =============================================================================

export interface EmiliaFlight {
  id: string
  airline: { code: string; name: string }
  price: {
    amount: number
    currency: string
    netAmount: number
    taxAmount: number
    fareAmount: number
  }
  adults: number
  children: number
  departure_date: string
  departure_time: string
  arrival_date: string
  arrival_time: string
  return_date: string | null
  trip_type?: "one_way" | "round_trip" | "multi_city"
  duration: { total: number; formatted: string }
  stops: { count: number; direct: boolean; connections: number }
  baggage: { included: boolean; details: string; quantity: number }
  cabin: { class: string; brandName: string }
  booking: { validatingCarrier: string; lastTicketingDate: string; fareType: string }
  legs: Array<{
    legNumber: number
    options: Array<{
      optionId: string
      duration: number
      segments: Array<{
        airline: string
        flightNumber: string
        departure: { airportCode: string; date: string; time: string }
        arrival: { airportCode: string; date: string; time: string }
        duration: number
        cabinClass: string
        baggage: string
      }>
    }>
  }>
  provider: "TVC"
  transactionId: string
}

export interface EurovipsHotel {
  id: string
  unique_id: string
  name: string
  category: string
  city: string
  address: string
  phone: string
  website?: string
  description?: string
  images: string[]
  check_in: string
  check_out: string
  nights: number
  rooms: Array<{
    type: string
    description: string
    price_per_night: number
    total_price: number
    currency: string
    availability: number
    occupancy_id: string
    xml_occupancy_id?: string
    fare_id_broker?: string
    adults?: number
    children?: number
    infants?: number
  }>
  policy_cancellation: string
  policy_lodging: string
  search_adults: number
  search_children: number
  provider: "EUROVIPS"
}

export interface GeneralData {
  departureDate: string
  returnDate: string | null
  adults: number
  children: number
  infants: number
}

export interface LeadInfo {
  id: string
  contact_name: string
  destination: string | null
  region: string | null
  agency_id: string
}

export interface SelectedHotel {
  hotel: EurovipsHotel
  roomIndex: number
}

export interface BuildQuotationInput {
  lead: LeadInfo
  selectedFlight: EmiliaFlight | null
  selectedHotels: SelectedHotel[]
  generalData: GeneralData
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parsea string como "5 estrellas" / "★★★★★" / "5 star" / "5*" a número.
 * Devuelve null si no matchea ningún patrón conocido.
 */
export function parseStars(category: string | null | undefined): number | null {
  if (!category) return null
  const s = String(category).trim()
  if (!s) return null

  // Patrón 1: estrellas unicode
  const unicodeStars = (s.match(/★/g) || []).length
  if (unicodeStars >= 1 && unicodeStars <= 5) return unicodeStars

  // Patrón 2: número + "estrella(s)" / "star(s)" / "*"
  const m = s.match(/^(\d+)\s*(?:estrellas?|stars?|\*)/i)
  if (m) {
    const n = parseInt(m[1], 10)
    if (n >= 1 && n <= 5) return n
  }
  return null
}

function buildFlightRoute(flight: EmiliaFlight): string | null {
  const firstLeg = flight.legs?.[0]?.options?.[0]?.segments
  if (!firstLeg || firstLeg.length === 0) return null
  const origin = firstLeg[0].departure.airportCode
  const destination = firstLeg[firstLeg.length - 1].arrival.airportCode
  return `${origin} - ${destination}`
}

function mapFlightToItem(flight: EmiliaFlight) {
  return {
    item_type: "FLIGHT" as const,
    description: "",
    provider: flight.airline.code,
    quantity: flight.adults + flight.children,
    unit_price: flight.price.amount,
    cost_amount: 0,
    cost_currency: flight.price.currency,
    admin_fee_percentage: 0,
    operator_id: null,
    generates_commission: true,
    airline: flight.airline.name,
    flight_route: buildFlightRoute(flight),
    flight_date: flight.departure_date,
    flight_return_date: flight.return_date,
    flight_stops: flight.stops.count,
    flight_class: flight.cabin.class,
  }
}

function mapHotelToItem(sel: SelectedHotel) {
  const room = sel.hotel.rooms[sel.roomIndex]
  if (!room) throw new Error(`Hotel "${sel.hotel.name}" no tiene room index ${sel.roomIndex}`)

  return {
    item_type: "HOTEL" as const,
    description: "",
    provider: sel.hotel.provider,
    quantity: 1,
    rooms: 1,
    unit_price: room.total_price,
    cost_amount: 0,
    cost_currency: room.currency,
    admin_fee_percentage: 0,
    operator_id: null,
    generates_commission: true,
    hotel_name: sel.hotel.name,
    hotel_stars: parseStars(sel.hotel.category),
    hotel_address: sel.hotel.address,
    hotel_phone: sel.hotel.phone,
    hotel_photo_url: sel.hotel.images?.[0] ?? null,
    destination_city: sel.hotel.city,
    room_type: room.type,
    meal_plan: null as string | null,
    checkin_date: sel.hotel.check_in,
    checkout_date: sel.hotel.check_out,
    nights: sel.hotel.nights,
  }
}

// =============================================================================
// Mapper principal
// =============================================================================

export function buildQuotationPayload(input: BuildQuotationInput) {
  const { lead, selectedFlight, selectedHotels, generalData } = input

  // Validaciones de entrada
  if (!generalData.departureDate) {
    throw new Error("Faltan fechas. Pedile a Emilia que aclare antes de generar.")
  }
  if (!selectedFlight && selectedHotels.length === 0) {
    throw new Error("Seleccioná al menos un vuelo o un hotel.")
  }

  // Defensa: clampear a MAX_OPTIONS hoteles aunque el UI ya lo limita
  const hotels = selectedHotels.slice(0, MAX_OPTIONS)
  const numOptions = Math.max(hotels.length, 1)

  const options = []
  for (let i = 0; i < numOptions; i++) {
    const items: any[] = []

    if (selectedFlight) {
      items.push(mapFlightToItem(selectedFlight))
    }
    if (hotels[i]) {
      items.push(mapHotelToItem(hotels[i]))
    }

    const total = items.reduce((s, it) => s + (it.unit_price || 0) * (it.quantity || 1), 0)

    options.push({
      title: `Opción ${i + 1}`,
      total_amount: total,
      manual_total_amount: null,
      items,
    })
  }

  return {
    lead_id: lead.id,
    agency_id: lead.agency_id,
    destination: lead.destination,
    region: lead.region || "OTROS",
    departure_date: generalData.departureDate,
    return_date: generalData.returnDate,
    adults: generalData.adults,
    children: generalData.children,
    infants: generalData.infants,
    currency: "USD",
    pricing_mode: "PER_PERSON",
    payment_methods: [] as string[],
    options,
  }
}
```

- [ ] **Step 4: Verificar que tests pasan**

Run: `npm run test -- quotation-mapper`
Expected: todos los tests PASS (parseStars × 11 + mapper × 10).

- [ ] **Step 5: Commit**

```bash
git add lib/emilia/quotation-mapper.ts lib/emilia/__tests__/quotation-mapper.test.ts
git commit -m "feat(emilia): add quotation-mapper for Emilia selection → quotation payload"
```

---

## Task 5: Fix shape parsing en `app/api/emilia/chat/route.ts`

**Files:**
- Modify: `app/api/emilia/chat/route.ts:236-237` y siguientes (sección donde extrae flights/hotels)

- [ ] **Step 1: Leer el archivo actual y localizar la extracción**

Run: `grep -n "flightsData\|hotelsData\|data.results" app/api/emilia/chat/route.ts`
Expected: ver la zona en línea ~236 donde hace `const flightsData = data.results?.flights || data.flights`.

- [ ] **Step 2: Modificar la extracción para soportar también `meta.combinedData`**

Reemplazar el bloque que empieza con `// 6. Transformar los datos de la API al formato del frontend` (alrededor de la línea 232) y termina antes de `const transformedFlights = ...` (línea 239) por:

```ts
// 6. Transformar los datos de la API al formato del frontend
// La API puede devolver resultados en tres formatos según versión:
// 1. data.results.flights (formato anidado legacy)
// 2. data.flights (formato plano legacy)
// 3. data.assistant_message.meta.combinedData.flights (shape nuevo /v1/emilia/turn)
const metaCombined = data.assistant_message?.meta?.combinedData
const flightsRaw =
  metaCombined?.flights ??
  data.results?.flights ??
  data.flights
const hotelsRaw =
  metaCombined?.hotels ??
  data.results?.hotels ??
  data.hotels

// Normalizar: el shape nuevo viene como array plano. Los shapes legacy
// vienen como { count, items: [] }. Unificamos a { count, items }.
const flightsData =
  Array.isArray(flightsRaw)
    ? { count: flightsRaw.length, items: flightsRaw }
    : flightsRaw
const hotelsData =
  Array.isArray(hotelsRaw)
    ? { count: hotelsRaw.length, items: hotelsRaw }
    : hotelsRaw
```

- [ ] **Step 3: Verificar tipos compilando**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Smoke test manual contra el módulo `/emilia` existente**

Run: `npm run dev` y abrir http://localhost:3067/emilia
Acción: hacer una búsqueda real "Vuelos a Cancún en julio para 2 personas".
Expected: cards aparecen igual que antes (sin regression). Si Emilia devuelve el shape nuevo, verificar que también se renderizan.

- [ ] **Step 5: Commit**

```bash
git add app/api/emilia/chat/route.ts
git commit -m "fix(emilia): parse new meta.combinedData shape + keep legacy fallback"
```

---

## Task 6: Endpoint `app/api/leads/[id]/emilia/route.ts` con beta gating

**Files:**
- Create: `app/api/leads/[id]/emilia/route.ts`
- Test: `app/api/leads/[id]/emilia/__tests__/route.test.ts`

- [ ] **Step 1: Crear el endpoint con guard, gate, validación multi-tenant, GET y POST**

```ts
// app/api/leads/[id]/emilia/route.ts
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_LEAD_EMILIA_CHAT } from "@/lib/feature-flags"
import {
  buildFallbackPrompt,
  buildOpenAIInstructions,
  type LeadInput,
} from "@/lib/emilia/lead-context"

export const dynamic = "force-dynamic"

/**
 * GET /api/leads/[id]/emilia
 * Devuelve la conversación activa vinculada al lead, o null si no hay.
 * 403 si la feature flag no está activa para la org del user.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
  }

  const supabase = (await createServerClient()) as any

  // Beta gate
  const flagOn = await getOrgFeatureFlag(supabase, user.org_id, FEATURE_FLAG_LEAD_EMILIA_CHAT)
  if (!flagOn) {
    return NextResponse.json(
      { error: "Feature en beta — no disponible para tu organización" },
      { status: 403 }
    )
  }

  // Multi-tenant defense: validar que el lead pertenece a la org del user
  const { data: lead } = await supabase
    .from("leads")
    .select("id, agency_id, agencies!inner(org_id)")
    .eq("id", leadId)
    .maybeSingle()
  if (!lead || (lead as any).agencies?.org_id !== user.org_id) {
    return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
  }

  // Buscar conversación activa del user para este lead
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, title, state, last_message_at, created_at")
    .eq("lead_id", leadId)
    .eq("user_id", user.id)
    .eq("state", "active")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ data: conv ?? null })
}

/**
 * POST /api/leads/[id]/emilia
 * Crea (o reusa) la conversación activa vinculada al lead.
 * Devuelve { conversation_id, suggested_prompt }.
 * El suggested_prompt sale de gpt-4o-mini parseando lead.notes, con
 * fallback determinístico si OpenAI falla.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
  }

  const supabase = (await createServerClient()) as any

  // Beta gate
  const flagOn = await getOrgFeatureFlag(supabase, user.org_id, FEATURE_FLAG_LEAD_EMILIA_CHAT)
  if (!flagOn) {
    return NextResponse.json(
      { error: "Feature en beta — no disponible para tu organización" },
      { status: 403 }
    )
  }

  // Multi-tenant defense + obtener datos del lead para el prompt
  const { data: lead } = await supabase
    .from("leads")
    .select("id, contact_name, destination, region, notes, agency_id, agencies!inner(org_id)")
    .eq("id", leadId)
    .maybeSingle()
  if (!lead || (lead as any).agencies?.org_id !== user.org_id) {
    return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
  }

  const leadInput: LeadInput = {
    contact_name: (lead as any).contact_name,
    destination: (lead as any).destination,
    region: (lead as any).region,
    notes: (lead as any).notes,
  }

  // Reusar conversación activa si existe, sino crearla
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("lead_id", leadId)
    .eq("user_id", user.id)
    .eq("state", "active")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let conversationId: string
  if (existing) {
    conversationId = (existing as any).id
  } else {
    const { data: created, error: createErr } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        lead_id: leadId,
        title: `Cotización ${(lead as any).contact_name}`,
        state: "active",
        channel: "web",
      })
      .select("id")
      .single()
    if (createErr || !created) {
      console.error("Error creando conversación lead-emilia:", createErr?.message)
      return NextResponse.json({ error: "No se pudo crear la conversación" }, { status: 500 })
    }
    conversationId = (created as any).id
  }

  // Prompt sugerido: intentar gpt-4o-mini; si falla, fallback determinístico
  const suggestedPrompt = await generateSuggestedPrompt(leadInput)

  return NextResponse.json({
    conversation_id: conversationId,
    suggested_prompt: suggestedPrompt,
  })
}

async function generateSuggestedPrompt(lead: LeadInput): Promise<string> {
  const fallback = buildFallbackPrompt(lead)
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return fallback

  const { system, user } = buildOpenAIInstructions(lead)
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000) // 8s timeout
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: 200,
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      console.warn("OpenAI parser non-OK:", res.status)
      return fallback
    }
    const json = await res.json()
    const text = json?.choices?.[0]?.message?.content?.trim()
    return text && text.length > 0 ? text : fallback
  } catch (err: any) {
    console.warn("OpenAI parser failed, using fallback:", err?.message || err)
    return fallback
  }
}
```

- [ ] **Step 2: Crear archivo de tests**

```ts
// app/api/leads/[id]/emilia/__tests__/route.test.ts
/**
 * @jest-environment node
 */
import { GET, POST } from "../route"

// Mocks de Supabase y getCurrentUser
jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}))
jest.mock("@/lib/supabase/server", () => ({
  createServerClient: jest.fn(),
}))
jest.mock("@/lib/settings/org-features", () => ({
  getOrgFeatureFlag: jest.fn(),
}))

const { getCurrentUser } = require("@/lib/auth")
const { createServerClient } = require("@/lib/supabase/server")
const { getOrgFeatureFlag } = require("@/lib/settings/org-features")

const USER_ORG = "org-beta"
const OTHER_ORG = "org-other"
const LEAD_ID = "lead-1"

function mockSupabase(builders: Record<string, any>) {
  return {
    from: jest.fn((table: string) => builders[table] ?? ({
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => ({ data: null }) }) }) }) }) }) }),
    })),
  }
}

describe("/api/leads/[id]/emilia", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.OPENAI_API_KEY = "" // forzar fallback en tests
  })

  it("GET 400 si user sin org_id", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: null } })
    createServerClient.mockResolvedValue({})
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(400)
  })

  it("GET 403 si flag OFF", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG } })
    createServerClient.mockResolvedValue({})
    getOrgFeatureFlag.mockResolvedValue(false)
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/beta/i)
  })

  it("GET 404 si lead pertenece a otro org", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG } })
    getOrgFeatureFlag.mockResolvedValue(true)
    createServerClient.mockResolvedValue(mockSupabase({
      leads: {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: LEAD_ID, agency_id: "a1", agencies: { org_id: OTHER_ORG } },
            }),
          }),
        }),
      },
    }))
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(404)
  })

  it("GET 200 con null si lead OK pero no hay conversación", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG } })
    getOrgFeatureFlag.mockResolvedValue(true)
    createServerClient.mockResolvedValue(mockSupabase({
      leads: {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: LEAD_ID, agency_id: "a1", agencies: { org_id: USER_ORG } },
            }),
          }),
        }),
      },
      conversations: {
        select: () => ({
          eq: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }),
        }),
      },
    }))
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeNull()
  })

  it("POST crea conversación nueva y devuelve fallback prompt", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG } })
    getOrgFeatureFlag.mockResolvedValue(true)
    createServerClient.mockResolvedValue(mockSupabase({
      leads: {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: LEAD_ID,
                contact_name: "Juan",
                destination: "Cancún",
                region: "CARIBE",
                notes: null,
                agency_id: "a1",
                agencies: { org_id: USER_ORG },
              },
            }),
          }),
        }),
      },
      conversations: {
        select: () => ({
          eq: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }),
        }),
        insert: () => ({
          select: () => ({ single: async () => ({ data: { id: "conv-new" } }) }),
        }),
      },
    }))
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.conversation_id).toBe("conv-new")
    expect(body.suggested_prompt).toMatch(/Cancún/)
  })
})
```

- [ ] **Step 3: Correr los tests del endpoint**

Run: `npm run test -- "app/api/leads/\[id\]/emilia"`
Expected: 5 tests PASS.

- [ ] **Step 4: Smoke manual en dev**

Run: `npm run dev`
En el browser (logueado como mypupybox@gmail.com): `curl -X POST http://localhost:3067/api/leads/{lead_id}/emilia -H "Cookie: ..."` (o simplemente abrir devtools y disparar fetch).
Expected sin flag setteado todavía: 403.
Después de Task 9 (seed activar flag): 200 con `{conversation_id, suggested_prompt}`.

- [ ] **Step 5: Commit**

```bash
git add app/api/leads/\[id\]/emilia/
git commit -m "feat(api): add /api/leads/[id]/emilia with beta gating + multi-tenant"
```

---

## Task 7: Componente `components/sales/lead-emilia-chat.tsx`

**Files:**
- Create: `components/sales/lead-emilia-chat.tsx`

**Skill recomendada:** `impeccable` para refinar la UI (colores, spacing, micro-interacciones, estados de loading). Invocarla con el contexto: "Implementar chat embebido con cards seleccionables. Estados: prompt-pending, loading, results, missing_info, error, post-generation. Reusar FlightResultCard y HotelResultCard de components/emilia/".

- [ ] **Step 1: Crear el componente con todos los estados**

```tsx
// components/sales/lead-emilia-chat.tsx
"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, ChevronLeft, MessageSquarePlus, Send, AlertTriangle, CheckCircle2, ExternalLink, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { FlightResultCard } from "@/components/emilia/flight-result-card"
import { HotelResultCard } from "@/components/emilia/hotel-result-card"
import { buildQuotationPayload, type EmiliaFlight, type EurovipsHotel } from "@/lib/emilia/quotation-mapper"

const MAX_HOTELS = 4

interface Message {
  role: "user" | "assistant"
  text: string
  cards?: {
    flights?: { count: number; items: EmiliaFlight[] }
    hotels?: { count: number; items: EurovipsHotel[] }
    requestType?: string
  }
  meta?: {
    confidence?: number
    originalRequest?: any
    missing_fields?: string[]
  }
}

interface Props {
  lead: {
    id: string
    contact_name: string
    contact_phone?: string | null
    destination?: string | null
    region?: string | null
    agency_id?: string | null
  }
  onBack: () => void                              // Volver al modo "detail"
  onQuotationCreated?: (quotation: any) => void   // Notifica al padre (refresh listado)
}

export function LeadEmiliaChat({ lead, onBack, onQuotationCreated }: Props) {
  const [loading, setLoading] = useState(true)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [createdQuotation, setCreatedQuotation] = useState<any | null>(null)

  // Selección
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null)
  const [selectedHotels, setSelectedHotels] = useState<Map<string, string>>(new Map()) // hotelId → roomId

  // Inicialización: GET conversación activa, sino POST para crear + pedir prompt
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const getRes = await fetch(`/api/leads/${lead.id}/emilia`)
        if (cancelled) return
        if (getRes.status === 403) {
          toast.error("Esta feature está en beta y no está habilitada para tu organización")
          onBack()
          return
        }
        const getData = await getRes.json()
        if (getData?.data?.id) {
          setConversationId(getData.data.id)
          await loadHistory(getData.data.id)
        } else {
          // No hay conversación activa → crear nueva con prompt sugerido
          const postRes = await fetch(`/api/leads/${lead.id}/emilia`, { method: "POST" })
          if (cancelled) return
          const postData = await postRes.json()
          if (!postRes.ok) {
            toast.error(postData.error || "No se pudo iniciar el chat")
            onBack()
            return
          }
          setConversationId(postData.conversation_id)
          setInput(postData.suggested_prompt || "")
        }
      } catch (err: any) {
        if (!cancelled) {
          toast.error("Error iniciando el chat: " + (err?.message || ""))
          onBack()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])

  async function loadHistory(convId: string) {
    try {
      const res = await fetch(`/api/emilia/conversations/${convId}`)
      if (res.ok) {
        const json = await res.json()
        const msgs = (json?.messages || []).map((m: any): Message => ({
          role: m.role,
          text: m.content?.text || "",
          cards: m.content?.cards,
          meta: m.content?.metadata,
        }))
        setMessages(msgs)
      }
    } catch {
      // silencioso — historial es nice-to-have
    }
  }

  async function handleSend() {
    if (!input.trim() || !conversationId || sending) return
    const text = input.trim()
    setInput("")
    setMessages(prev => [...prev, { role: "user", text }])
    setSending(true)
    try {
      const res = await fetch("/api/emilia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errText = data?.error || (res.status === 429 ? "Demasiadas búsquedas. Esperá unos segundos." : "No pude buscar ahora.")
        setMessages(prev => [...prev, { role: "assistant", text: errText }])
        return
      }
      if (data.status === "incomplete") {
        setMessages(prev => [...prev, {
          role: "assistant",
          text: data.message || "Necesito más información.",
          meta: { missing_fields: data.missing_fields || [] },
        }])
        return
      }
      setMessages(prev => [...prev, {
        role: "assistant",
        text: data?.assistant_message?.content?.text || "Acá tenés los resultados:",
        cards: {
          flights: data?.results?.flights,
          hotels: data?.results?.hotels,
          requestType: data?.requestType,
        },
        meta: data?.assistant_message?.meta,
      }])
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "assistant", text: "Error de red: " + (err?.message || "") }])
    } finally {
      setSending(false)
    }
  }

  // Última respuesta con cards para mostrar selección
  const lastResults = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].cards?.flights?.items?.length || messages[i].cards?.hotels?.items?.length) {
        return messages[i]
      }
    }
    return null
  }, [messages])

  const flightsList = lastResults?.cards?.flights?.items || []
  const hotelsList = lastResults?.cards?.hotels?.items || []
  const confidence = lastResults?.meta?.originalRequest?.confidence ?? 1

  function toggleFlight(id: string) {
    setSelectedFlightId(prev => (prev === id ? null : id))
  }

  function toggleHotel(hotelId: string, roomId?: string) {
    setSelectedHotels(prev => {
      const next = new Map(prev)
      if (next.has(hotelId)) {
        next.delete(hotelId)
      } else {
        if (next.size >= MAX_HOTELS) {
          toast.error(`Solo podés seleccionar hasta ${MAX_HOTELS} hoteles. Deseleccioná uno para elegir otro.`)
          return prev
        }
        next.set(hotelId, roomId || "0")
      }
      return next
    })
  }

  async function handleGenerate() {
    if (generating) return
    const flight = flightsList.find(f => f.id === selectedFlightId) || null
    const selectedHotelArr = hotelsList
      .filter(h => selectedHotels.has(h.id))
      .map(h => ({ hotel: h, roomIndex: parseInt(selectedHotels.get(h.id) || "0", 10) }))

    const originalRequest = lastResults?.meta?.originalRequest
    const generalData = {
      departureDate: originalRequest?.flights?.departureDate || originalRequest?.hotels?.checkinDate || "",
      returnDate: originalRequest?.flights?.returnDate || originalRequest?.hotels?.checkoutDate || null,
      adults: originalRequest?.flights?.adults || originalRequest?.hotels?.adults || 1,
      children: originalRequest?.flights?.children || originalRequest?.hotels?.children || 0,
      infants: originalRequest?.flights?.infants || originalRequest?.hotels?.infants || 0,
    }
    if (!generalData.departureDate) {
      toast.error("Pedile a Emilia que aclare las fechas antes de generar.")
      return
    }
    if (!lead.agency_id) {
      toast.error("El lead no tiene agencia asociada.")
      return
    }

    setGenerating(true)
    try {
      const payload = buildQuotationPayload({
        lead: {
          id: lead.id,
          contact_name: lead.contact_name,
          destination: lead.destination ?? null,
          region: lead.region ?? null,
          agency_id: lead.agency_id,
        },
        selectedFlight: flight,
        selectedHotels: selectedHotelArr,
        generalData,
      })
      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error || "No se pudo crear la cotización")
        return
      }
      setCreatedQuotation(json.data)
      toast.success(`Cotización ${json.data?.quotation_number} creada`)
      onQuotationCreated?.(json.data)
    } catch (err: any) {
      toast.error("Error generando cotización: " + (err?.message || ""))
    } finally {
      setGenerating(false)
    }
  }

  const generateLabel = useMemo(() => {
    const fc = selectedFlightId ? 1 : 0
    const hc = selectedHotels.size
    if (fc + hc === 0) return "Generar cotización"
    const opts = Math.max(hc, 1)
    return `Generar cotización · ${opts} opción${opts > 1 ? "es" : ""} (${fc} vuelo + ${hc} hotel${hc !== 1 ? "es" : ""})`
  }, [selectedFlightId, selectedHotels])

  const canGenerate = (selectedFlightId !== null || selectedHotels.size > 0) && !generating

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-2">Iniciando chat con Emilia…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 px-6 py-3 border-b text-sm">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Detalle del lead
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="font-semibold text-primary inline-flex items-center gap-1">
          <MessageSquarePlus className="h-4 w-4" /> Chat con Emilia
        </span>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Revisá el prompt sugerido y enviá a Emilia.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {m.text}
              {m.meta?.missing_fields && m.meta.missing_fields.length > 0 && (
                <ul className="mt-2 text-xs list-disc list-inside opacity-80">
                  {m.meta.missing_fields.map((f, idx) => <li key={idx}>{f}</li>)}
                </ul>
              )}
            </div>
          </div>
        ))}

        {/* Confidence warning */}
        {confidence < 0.7 && lastResults && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>Emilia entendió tu pedido con baja confianza ({Math.round(confidence * 100)}%). Verificá los datos antes de generar la cotización.</span>
          </div>
        )}

        {/* Cards de vuelos */}
        {flightsList.length > 0 && (
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-foreground/60 mb-2">
              <span>✈️ Vuelos · {selectedFlightId ? 1 : 0} de {flightsList.length} seleccionado</span>
              <span className="text-foreground/40 normal-case">máx 1</span>
            </div>
            <div className="space-y-2">
              {flightsList.map((flight) => (
                <FlightResultCard
                  key={flight.id}
                  flight={flight as any}
                  selected={selectedFlightId === flight.id}
                  onSelectionChange={(id) => toggleFlight(id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Cards de hoteles */}
        {hotelsList.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-foreground/60 mb-2">
              <span>🏨 Hoteles · {selectedHotels.size} de {hotelsList.length} seleccionados</span>
              <span className="text-foreground/40 normal-case">máx 4</span>
            </div>
            <div className="space-y-2">
              {hotelsList.map((hotel) => (
                <HotelResultCard
                  key={hotel.id}
                  hotel={hotel as any}
                  selected={selectedHotels.has(hotel.id)}
                  selectedRoomId={selectedHotels.get(hotel.id)}
                  onRoomSelect={(roomId) => toggleHotel(hotel.id, roomId)}
                  onSelectionChange={(hid, sel) => sel ? toggleHotel(hid) : toggleHotel(hid)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Banner post-creación */}
        {createdQuotation && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm text-emerald-900 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">Cotización {createdQuotation.quotation_number} creada</div>
              <div className="text-xs opacity-80">{(createdQuotation.quotation_options?.length || 1)} opción(es) · vinculada al lead</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => window.open(`/cotizacion/${createdQuotation.public_token}`, "_blank")}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ver
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreatedQuotation(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Input + CTA */}
      <div className="border-t px-6 py-3 space-y-3">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribí a Emilia (ej. más baratos, otra fecha…)"
            className="min-h-[60px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend()
            }}
            disabled={sending}
          />
          <Button onClick={handleSend} disabled={!input.trim() || sending} className="self-end">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full"
          variant="default"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {generateLabel}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores en el archivo (puede haber warnings de tipos `any` de los cards — son aceptables porque los componentes existentes tienen sus propias interfaces).

- [ ] **Step 3: Commit**

```bash
git add components/sales/lead-emilia-chat.tsx
git commit -m "feat(sales): add LeadEmiliaChat embedded chat component"
```

- [ ] **Step 4: (Después de Task 8) Invocar skill impeccable para pulir UI**

Una vez que el flow esté armado end-to-end, abrir el chat en local y usar la skill `impeccable` para refinar:
- Spacing entre cards y mensajes
- Estados hover/focus de los CTAs
- Skeleton de loading mientras Emilia busca
- Empty state cuando hay 0 mensajes pero conversación creada
- Color del banner de confidence (puede ser muy estridente o sutil)
- Layout responsive (mobile/tablet vs desktop)
- Animación micro al seleccionar/deseleccionar card

Hacer cambios incrementales y commitearlos por separado: `style(sales): polish LeadEmiliaChat with impeccable feedback`.

---

## Task 8: Modificar `components/sales/lead-detail-dialog.tsx`

**Files:**
- Modify: `components/sales/lead-detail-dialog.tsx` (agregar mode state, swap conditional, gate del flag)

- [ ] **Step 1: Importar el nuevo componente y agregar estado del mode**

En la sección de imports (después de la línea ~36, donde está `import { getQuotationOptionPricing }`):

```tsx
import { LeadEmiliaChat } from "@/components/sales/lead-emilia-chat"
```

Después de la línea `const [quotationDialogOpen, setQuotationDialogOpen] = useState(false)` (línea ~225), agregar:

```tsx
const [mode, setMode] = useState<"detail" | "emilia">("detail")
```

- [ ] **Step 2: Modificar el handler del botón "Cotizar" — hacer fetch al endpoint para decidir flow**

Localizar el botón "Cotizar" actual (alrededor de la línea ~981-992):

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => {
    setEditingQuotationId(null)
    setQuotationDialogOpen(true)
  }}
  className="shrink-0"
>
  <FileText className="h-3.5 w-3.5" />
  <span className="ml-1.5">Cotizar</span>
</Button>
```

Reemplazarlo por:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={async () => {
    // Beta gating: si la feature flag está ON para la org, abrir chat embebido.
    // Si está OFF (o el endpoint da error), caer al QuotationBuilder clásico.
    try {
      const probe = await fetch(`/api/leads/${lead.id}/emilia`, { method: "HEAD" })
      // HEAD no está implementado; usamos GET pero solo evaluamos status
    } catch {}
    const res = await fetch(`/api/leads/${lead.id}/emilia`)
    if (res.ok) {
      setMode("emilia")
    } else {
      // Flag OFF (403) o error: caer al builder clásico
      setEditingQuotationId(null)
      setQuotationDialogOpen(true)
    }
  }}
  className="shrink-0"
>
  <FileText className="h-3.5 w-3.5" />
  <span className="ml-1.5">Cotizar</span>
</Button>
```

(Quitar el comentario y la línea del HEAD probe — fue un leftover de un approach descartado. Versión final del handler:)

```tsx
onClick={async () => {
  const res = await fetch(`/api/leads/${lead.id}/emilia`)
  if (res.ok) {
    setMode("emilia")
  } else {
    setEditingQuotationId(null)
    setQuotationDialogOpen(true)
  }
}}
```

- [ ] **Step 3: Renderizar condicionalmente el contenido del modal según `mode`**

Localizar el bloque que empieza con `<DialogContent className="max-w-2xl p-0">` (línea ~490) y termina con `</DialogContent>` (línea ~1048).

**No cambiar nada del contenido actual** — solamente envolver TODO lo que hay dentro de `<DialogContent>` (header + secciones + footer) con:

```tsx
<DialogContent className="max-w-2xl p-0">
  {mode === "emilia" ? (
    <LeadEmiliaChat
      lead={{
        id: lead.id,
        contact_name: lead.contact_name,
        contact_phone: lead.contact_phone,
        destination: lead.destination,
        region: lead.region,
        agency_id: lead.agency_id,
      }}
      onBack={() => setMode("detail")}
      onQuotationCreated={() => {
        loadQuotations()
      }}
    />
  ) : (
    <>
      {/* TODO EL CONTENIDO ACTUAL del DialogContent va acá adentro sin cambios */}
      {/* Header con nombre y badges + secciones + footer */}
    </>
  )}
</DialogContent>
```

- [ ] **Step 4: Resetear mode cuando el modal se cierra**

Agregar un `useEffect` cerca de los otros (alrededor de la línea ~328):

```tsx
useEffect(() => {
  if (!open) setMode("detail")
}, [open])
```

- [ ] **Step 5: Verificar compilación + lint**

Run: `npm run lint && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Smoke test manual (sin flag activo)**

Run: `npm run dev`
Abrir un lead cualquiera de Lozada o cualquier org SIN el flag activado → click "Cotizar" → debe abrir el QuotationBuilder clásico (como hoy).

Expected: comportamiento idéntico al actual.

- [ ] **Step 7: Commit**

```bash
git add components/sales/lead-detail-dialog.tsx
git commit -m "feat(sales): swap lead-detail-dialog to Emilia chat when beta flag on"
```

---

## Task 9: SQL seed para activar beta en Oficial Testing Vibook

**Files:**
- Create: `supabase/migrations/{timestamp}_seed_lead_emilia_chat_beta.sql`

- [ ] **Step 1: Generar migración**

Run: `npx supabase migration new seed_lead_emilia_chat_beta`
Expected: path del nuevo archivo.

- [ ] **Step 2: Pegar contenido**

```sql
-- Activa la beta del chat de Emilia desde el lead para Oficial Testing Vibook.
-- Idempotente: si ya existe, lo deja en true.
--
-- Para activar en más orgs en el futuro, hacer otro INSERT similar con
-- el org_id correspondiente. Para desactivar puntualmente:
--   DELETE FROM organization_settings
--   WHERE org_id = '<org>' AND key = 'features.lead_emilia_chat';

INSERT INTO organization_settings (org_id, key, value)
VALUES (
  '410ada50-d8ae-4d18-8c90-36a9223b378b',  -- Oficial Testing Vibook
  'features.lead_emilia_chat',
  'true'
)
ON CONFLICT (org_id, key) DO UPDATE SET value = EXCLUDED.value;
```

- [ ] **Step 3: Aplicar migración**

Run: `npx supabase db push`
Expected: log de aplicación exitosa.

- [ ] **Step 4: Verificar que el flag está activo**

Run:
```bash
set -a; source .env.local; set +a
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/organization_settings?org_id=eq.410ada50-d8ae-4d18-8c90-36a9223b378b&key=eq.features.lead_emilia_chat&select=*" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
```
Expected: array con 1 row donde `value="true"`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_seed_lead_emilia_chat_beta.sql
git commit -m "feat(db): activate lead_emilia_chat beta for Oficial Testing Vibook"
```

---

## Task 10: Smoke test end-to-end + verificación de precio

**Files:** ninguno (sesión manual de validación)

- [ ] **Step 1: Levantar dev server con auth real**

Run: `DISABLE_AUTH=false npm run dev`
Expected: server arranca en puerto 3067.

- [ ] **Step 2: Login como mypupybox@gmail.com**

Browser: `http://localhost:3067/login` → email `mypupybox@gmail.com` / password `admin123` → debería entrar al dashboard de Oficial Testing Vibook.

- [ ] **Step 3: Crear un lead de prueba con notas ricas**

En `/sales/leads` → "Nuevo lead":
- Nombre: "Test Beta Emilia"
- WhatsApp: cualquiera
- Destino: "Punta Cana"
- Región: CARIBE
- Notas: "Pareja, primer semana de julio, 5 noches, all inclusive, presupuesto USD 4000 c/u"

Expected: lead creado, aparece en la lista.

- [ ] **Step 4: Abrir el lead y apretar "Cotizar"**

Expected:
- El contenido del modal se swap a chat con Emilia (breadcrumb "← Detalle del lead / 🤖 Chat con Emilia").
- Después de ~1-2 segundos (OpenAI parser), el input aparece pre-rellenado con un texto tipo: "Cotizar viaje a Punta Cana (Caribe) para 2 adultos, salida primera semana de julio, 5 noches, all-inclusive."

- [ ] **Step 5: Enviar el prompt a Emilia**

Click "Enviar". Esperar respuesta (puede tardar varios segundos).

Expected: aparecen cards de vuelos y hoteles, con checkboxes funcionales.

- [ ] **Step 6: Seleccionar 1 vuelo + 3 hoteles**

Expected:
- El badge de "✈️ Vuelos · 1 de N seleccionado" actualiza
- El badge de "🏨 Hoteles · 3 de N seleccionados" actualiza
- Botón "Generar cotización" muestra "Generar cotización · 3 opciones (1 vuelo + 3 hoteles)"

- [ ] **Step 7: Generar cotización**

Click el botón. Esperar.

Expected:
- Banner verde "✓ Cotización COT-XXXX-XXXX creada"
- Toast de success
- En `/quotations` aparece la cotización nueva con 3 opciones, status DRAFT

- [ ] **Step 8: Verificar precio (CRÍTICO)**

Abrir la cotización generada en `/quotations/{id}` (o vista pública con el public_token).

Comparar para CADA opción:
- Precio del card del vuelo en el chat de Emilia
- Precio del card del hotel en el chat de Emilia
- `total_amount` de la opción en la cotización

Cálculo esperado: `unit_price_vuelo × cantidad_pax + total_price_room`

**Si el total de la cotización es DOBLE de lo esperado** → bug: `price.amount` del vuelo de Emilia ya es por grupo, no por pax. Fix:
1. En `lib/emilia/quotation-mapper.ts`, función `mapFlightToItem`, cambiar:
   ```ts
   quantity: flight.adults + flight.children,
   unit_price: flight.price.amount,
   ```
   por:
   ```ts
   quantity: 1,
   unit_price: flight.price.amount,
   ```
2. Actualizar tests para reflejarlo.
3. Commit: `fix(emilia): flight price is per group, not per pax`.

- [ ] **Step 9: Probar reapertura**

Cerrar el modal del lead, reabrir, click "Cotizar" otra vez.

Expected: el chat se hidrata con el historial de mensajes previo, mismas cards visibles (si Emilia mantiene el contexto). El input arranca vacío (no se re-genera prompt).

- [ ] **Step 10: Probar multi-tenant (otra cuenta)**

Logout. Login con OTRA cuenta de OTRA org (cualquiera SIN el flag).
Abrir cualquier lead, click "Cotizar".

Expected: abre el QuotationBuilder clásico (no el chat). Si por algún error abre el chat, hay un bug en el gate.

Validar también que con curl directo:
```bash
curl -X GET https://localhost:3067/api/leads/{other_org_lead_id}/emilia \
  -H "Cookie: ..."
```
devuelve 403 o 404.

- [ ] **Step 11: Verificar tests en CI**

Run: `npm run test && npm run lint && npm run build`
Expected: todo verde.

- [ ] **Step 12: Commit del informe de smoke test (opcional)**

Si se hicieron ajustes durante el smoke (ej. fix de precio en step 8), commit los cambios. Sino, nada que commitear.

---

## Self-review

✅ **Spec coverage**: cada sección del spec tiene tarea asignada.
- Arquitectura → Tasks 1, 2, 6, 7, 8
- Schema → Task 2
- UI/UX → Task 7 (+ refinamiento con impeccable)
- Mapping Emilia → Quotation → Tasks 3, 4
- Error handling → cubierto en endpoint (Task 6) y chat component (Task 7)
- Testing → Tasks 3, 4, 6 unit/integration; Task 10 e2e manual
- Rollout → Tasks 2, 9, 10
- Riesgos asumidos → Task 10 step 8 (verificación de precio explícita)
- Open questions del spec → Task 10 step 8 cubre `price.amount` por pax/grupo

✅ **Placeholders scan**: sin "TBD", sin "implementar después", todos los snippets de código están completos.

✅ **Type consistency**: tipos `EmiliaFlight`, `EurovipsHotel`, `LeadInput`, `GeneralData`, `LeadInfo`, `SelectedHotel` definidos en Tasks 3 y 4, usados consistentemente en Tasks 6, 7. Función `buildFallbackPrompt` y `buildOpenAIInstructions` definidas en Task 3, usadas en Task 6. Constante `FEATURE_FLAG_LEAD_EMILIA_CHAT` definida en Task 1, usada en Tasks 6 y 8.
