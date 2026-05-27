# Cotización automática desde el lead vía chat de Emilia

**Fecha**: 2026-05-27
**Autor**: Fran (vía brainstorming colaborativo)
**Estado**: Spec aprobado, pendiente plan de implementación

---

## Resumen ejecutivo

Cuando el vendedor abre el modal de un lead y aprieta **"Cotizar"**, el modal swap su contenido por un chat embebido con Emilia. El input del chat aparece pre-rellenado con un prompt sugerido (generado por OpenAI a partir de `lead.notes`). El vendedor puede ajustar el texto, enviar a Emilia, y conversar libremente hasta tener los resultados que quiere. Selecciona cards de vuelos (máx. 1) y hoteles (máx. 4) y aprieta **"Generar cotización"**: se crea una quotation DRAFT vinculada al lead con N opciones (una por hotel), abierta en el banner del propio chat con CTAs `Ver` / `Cerrar chat`.

El chat queda persistido en `conversations` con `lead_id`. Si el vendedor reabre el lead, ve la conversación previa hidratada.

Capa de defense-in-depth multi-tenant respetada: filtros `org_id` explícitos en todos los endpoints user-facing.

---

## Decisiones tomadas durante brainstorming

| Decisión | Opción elegida | Justificación |
|---|---|---|
| Flujo del botón "Cotizar" | Abrir chat con Emilia embebido en el modal | Permite conversación libre, no fuerza al vendedor a completar form a ciegas |
| Cierre del flujo | Botón "Generar cotización" al final del chat | El vendedor decide cuándo está conforme; evita DRAFTs basura |
| Persistencia | Conversación guardada vinculada al lead | Permite retomar leads que no convirtieron al primer intento |
| Layout (D2) | Contenido del modal swap con breadcrumb | Menos invasivo que refactorizar tabs |
| Pre-fill del input | OpenAI parser sobre `lead.notes` | Más preciso que regex; +1 llamada $0.001/apertura |
| Mapeo cards → cotización (M1) | 1 vuelo + N hoteles = N opciones | Sweet spot UX; alinea con sync de vuelos del builder actual |
| Límites de selección | UI bloquea desde el click | Previene errores; toast preventivo |
| Post-generación | Chat queda abierto + banner inline | Permite seguir charlando o generar otra cotización |
| Versionado API Emilia | Adaptar al shape nuevo + reparar `chat/route.ts` | Sample real muestra `meta.combinedData.flights/.hotels`, shape divergente del legacy |

---

## Arquitectura

### Data flow

```
┌─────────────────────────────────────────────────────────────────┐
│  lead-detail-dialog.tsx  (modificar)                            │
│  Estado: mode: "detail" | "emilia"                              │
│  Si mode==="detail" → contenido actual sin cambios              │
│  Si mode==="emilia" → renderiza <LeadEmiliaChat />              │
└──────────────────────────┬──────────────────────────────────────┘
                           │ click "Cotizar" → mode="emilia"
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  <LeadEmiliaChat />  (NUEVO)                                    │
│  - Breadcrumb: ← Detalle / 🤖 Chat con Emilia                   │
│  - Carga/crea conversación vía POST /api/leads/[id]/emilia      │
│  - Hist + cards seleccionables (reusa FlightResultCard +        │
│    HotelResultCard del módulo /emilia)                          │
│  - Input + botón Enviar (POST /api/emilia/chat existente)       │
│  - Footer CTA: "Generar cotización (X seleccionados)"           │
└────────────────────┬───────────────────┬────────────────────────┘
                     │                   │
                     ▼                   ▼
        POST /api/leads/[id]/emilia   POST /api/emilia/chat
        (NUEVO — crea conv +          (EXISTENTE — fix shape
        prompt sugerido vía           data.results → 
        OpenAI)                       meta.combinedData)
                     │
                     │ cards seleccionados
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  lib/emilia/quotation-mapper.ts  (NUEVO)                        │
│  selección + generalData → payload de /api/quotations           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
              POST /api/quotations (existente, sin cambios)
                       │
                       ▼
              Banner inline en chat:
              "✓ Cotización #COT-XXX creada"  [Ver] [Cerrar chat]
              (chat queda abierto)
```

### Archivos

**Modificar:**
- `components/sales/lead-detail-dialog.tsx` — agregar estado `mode` y render condicional. El contenido `detail` no cambia.
- `app/api/emilia/chat/route.ts` — **fix**: cambiar parseo de `data.results.flights/.hotels` a `assistant_message.meta.combinedData.flights/.hotels`. Validar regression: el módulo `/emilia` actual sigue funcionando.

**Crear:**
- `components/sales/lead-emilia-chat.tsx` — el chat embebido completo.
- `app/api/leads/[id]/emilia/route.ts` — `GET` devuelve la conversación activa del lead (o null); `POST` crea conversación nueva con `lead_id` y llama OpenAI (`gpt-4o-mini`) para generar el prompt sugerido a partir de `lead.notes`.
- `lib/emilia/lead-context.ts` — helper que construye el contexto del lead (destination, region, notes) para el parser y para Emilia.
- `lib/emilia/quotation-mapper.ts` — función pura que mapea cards seleccionados a payload de `/api/quotations`.
- `lib/emilia/quotation-mapper.test.ts` — tests unitarios.
- `lib/emilia/__tests__/lead-context.test.ts` — tests del prompt builder.
- `supabase/migrations/{timestamp}_add_lead_id_to_conversations.sql` — migración (timestamp generado por `supabase migration new`).

**Reusar (sin cambios):**
- `components/emilia/flight-result-card.tsx` — ya tiene checkbox y `onSelectionChange`.
- `components/emilia/hotel-result-card.tsx` — ya tiene checkbox + `RoomGroupSelector` con `selectedRoomId`.
- `POST /api/emilia/chat` — endpoint existente (con el fix de shape mencionado).
- `POST /api/quotations` — endpoint existente.

---

## Schema changes

### Migración: `add_lead_id_to_conversations.sql`

```sql
-- 1. Columna nueva nullable (no rompe filas existentes)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS lead_id UUID
  REFERENCES leads(id) ON DELETE SET NULL;

-- 2. Index parcial: solo filas con lead_id
CREATE INDEX IF NOT EXISTS idx_conversations_lead
  ON conversations(lead_id, last_message_at DESC)
  WHERE lead_id IS NOT NULL;

-- 3. Comentario documental
COMMENT ON COLUMN conversations.lead_id IS
  'Si la conversación se inició desde el modal de un lead específico, link al lead. NULL = chat genérico desde /emilia.';
```

### Defense-in-depth multi-tenant

Sigue la regla de oro del proyecto (filtro `org_id` explícito, NO confiar en RLS):

1. `POST /api/leads/[id]/emilia`: antes de crear la conversación con `lead_id`, validar que `lead.agency_id` pertenece al `user.org_id` (vía `getOrgAgencyIds(user.org_id)`). Si no pertenece → 404 enmascarado.
2. `GET /api/leads/[id]/emilia`: mismo validación previa al SELECT.
3. La query a `conversations` SIEMPRE filtra por `user_id = user.id`, además del `lead_id`.

### 1 conversación activa por lead

Política: si ya existe una `conversation` con `lead_id=X` y `state='active'`, se reusa. Si `state='closed'` o no existe, se crea nueva. El usuario puede cerrar manualmente con un botón ⌫ en el header del chat.

---

## UI/UX

### Estados del chat

1. **Apertura inicial** — input pre-rellenado con prompt sugerido por OpenAI parser. Vendedor revisa, ajusta si quiere y aprieta Enviar.
2. **Loading** — skeleton de 3 cards animadas + texto "Emilia está buscando…".
3. **Con resultados** — cards de vuelos (sección con label "✈️ Vuelos · X de Y seleccionado · máx 1") y cards de hoteles (label "🏨 Hoteles · X de Y seleccionados · máx 4 (1 por opción)"). Scroll horizontal en cada banda.
4. **`missing_info`** — mensaje normal de Emilia listando lo faltante. Input habilitado.
5. **Error 429/500** — mensaje de error en chat + botón Reintentar. Input editable.
6. **Confidence < 0.7** — banner amarillo: "Emilia entendió con baja confianza. Verificá los datos antes de generar."
7. **Selección que excede límite** — toast "Solo podés seleccionar hasta 4 hoteles" + click bloqueado.
8. **Post-generación** — banner verde inline: "✓ Cotización #COT-2026-XXXX creada · [Ver] [Cerrar chat]". Chat sigue accesible.

### Interacciones

- Cards seleccionadas muestran **número de opción** (1, 2, 3, 4) en el badge, no solo ✓. Anticipa el orden en la cotización.
- Click en desseleccionada → seleccionar; click en seleccionada → desseleccionar.
- Botón "Generar cotización" deshabilitado hasta tener al menos 1 selección. Texto del botón se actualiza dinámico: "Generar cotización · 3 opciones (1 vuelo + 3 hoteles)".
- La UI se implementa con la skill **impeccable** (frontend-design) cuando se ejecute el plan.

### Sin frontend tokens propios

Reusa `components/ui/` (shadcn/ui) y los colores del theme actual. No se crean nuevas variables CSS.

---

## Mapping Emilia → Quotation

### EmiliaFlight (TVC) → quotation_item

| Campo Emilia | quotation_item | Notas |
|---|---|---|
| `airline.name` | `airline` | String directo |
| `legs[0].options[0].segments[0].departure.airportCode + " - " + legs[0].options[0].segments[last].arrival.airportCode` | `flight_route` | "EZE - PUJ" |
| `departure_date` | `flight_date` | YYYY-MM-DD |
| `return_date` | `flight_return_date` | Nullable |
| `stops.count` | `flight_stops` | Pre-calculado |
| `cabin.class` | `flight_class` | Normalizar a enum builder (ECONOMY/PREMIUM_ECONOMY/BUSINESS/FIRST) |
| `price.amount` | `unit_price` | **Verificar en QA** si es por pax o por grupo |
| `price.currency` | `cost_currency` | Usual USD |
| `adults + children` | `quantity` | ⚠ `children` singular (server-side); el frontend legacy usa `childrens` |
| — | `cost_amount, operator_id, admin_fee_percentage` | 0 / null / 0; vendedor ajusta en builder |
| — | `generates_commission` | `true` (FLIGHT está en `COMMISSION_TYPES`) |

### EurovipsHotel → quotation_item (con room seleccionado)

| Campo Emilia | quotation_item | Notas |
|---|---|---|
| `name` | `hotel_name` | — |
| `parseStars(category)` | `hotel_stars` | Helper nuevo con regex sobre "5 estrellas" / "★★★★★". Sin match → null. |
| `address` | `hotel_address` | — |
| `phone` | `hotel_phone` | Optional |
| `images[0] ?? null` | `hotel_photo_url` | Primera imagen del array |
| `city` | `destination_city` | — |
| `rooms[selectedIdx].type` | `room_type` | `selectedIdx` viene del `RoomGroupSelector` (prop `selectedRoomId`) |
| — | `meal_plan` | null; vendedor ajusta. v2: parsear `rooms[].description` con regex/IA |
| `check_in / check_out` | `checkin_date / checkout_date` | YYYY-MM-DD |
| `nights` | `nights` | Directo |
| `rooms[selectedIdx].total_price` | `unit_price` | Precio del room (incluye noches); `quantity=1` |
| `rooms[selectedIdx].currency` | `cost_currency` | Por room |
| 1 | `quantity` / `rooms` | 1 cuarto por default |
| — | `cost_amount, operator_id, admin_fee_percentage` | 0 / null / 0 |
| — | `generates_commission` | `true` (HOTEL está en `COMMISSION_TYPES`) |

### Datos generales (fechas, pax)

Salen de `assistant_message.meta.originalRequest`:

```ts
generalData = {
  departureDate: meta.originalRequest.flights?.departureDate || meta.originalRequest.hotels?.checkinDate,
  returnDate:    meta.originalRequest.flights?.returnDate    || meta.originalRequest.hotels?.checkoutDate,
  adults:        meta.originalRequest.flights?.adults || meta.originalRequest.hotels?.adults || 1,
  children:      meta.originalRequest.flights?.children || meta.originalRequest.hotels?.children || 0,
  infants:       meta.originalRequest.flights?.infants  || meta.originalRequest.hotels?.infants  || 0,
}
```

Si `confidence < 0.7` → banner de advertencia en el chat.

### Lógica del mapper

```ts
function mapEmiliaSelectionToQuotationPayload(input: {
  lead: { id, contact_name, destination, region, agency_id },
  selectedFlight: EmiliaFlight | null,           // 0 o 1
  selectedHotels: { hotel: EurovipsHotel, roomId: string }[],   // 0 a 4
  generalData: { departureDate, returnDate, adults, children, infants },
}) {
  const numOptions = Math.max(input.selectedHotels.length, 1)
  const options = []

  for (let i = 0; i < numOptions; i++) {
    const items = []
    if (input.selectedFlight) {
      items.push(mapFlightToItem(input.selectedFlight, input.generalData))
    }
    if (input.selectedHotels[i]) {
      items.push(mapHotelToItem(input.selectedHotels[i], input.generalData))
    }
    options.push({
      title: `Opción ${i + 1}`,
      items,
      total_amount: items.reduce((s, it) => s + it.unit_price * it.quantity, 0),
      calculated_total_amount: ...,
      manual_total_amount: null,
    })
  }

  return {
    lead_id: input.lead.id,
    agency_id: input.lead.agency_id,
    destination: input.lead.destination,
    region: input.lead.region,
    departure_date: input.generalData.departureDate,
    return_date: input.generalData.returnDate,
    adults, children, infants,
    currency: "USD",
    pricing_mode: "PER_PERSON",
    payment_methods: [],
    options,
  }
}
```

### Casos edge del mapper

- **0 hoteles + 1 vuelo**: 1 opción con solo vuelo.
- **N hoteles + 0 vuelos**: N opciones, cada una con solo el hotel.
- **0 + 0**: el botón "Generar cotización" está deshabilitado, este caso no llega al mapper.
- **`generalData` incompleto** (faltan fechas o pax): mapper lanza error; UI muestra toast "Pedile a Emilia que aclare fechas y cantidad de pax antes de generar".

---

## Error handling

| Escenario | Respuesta UI | Estado chat |
|---|---|---|
| OpenAI parser falla/timeout en apertura | Fallback genérico `Cotizar viaje a {destination}`. Sin toast. Log a Sentry. | Operativo |
| Emilia 429 | Mensaje del asistente "Demasiadas búsquedas, esperá X segundos". Botón Enviar disabled con countdown. | Operativo |
| Emilia 401/403 | "Emilia no está configurada. Contactá al administrador." Slack alert. | Bloqueado |
| Emilia 500 / network | "No pude buscar ahora. Intentá de nuevo." Botón Reintentar. | Operativo |
| Emilia `missing_info` | Mensaje del asistente listando lo que falta. Input habilitado. | Operativo |
| Emilia `confidence < 0.7` | Banner amarillo "Emilia entendió con baja confianza. Verificá los datos." | Operativo |
| "Generar cotización" sin selección | Botón disabled con tooltip "Seleccioná al menos un vuelo o un hotel" | Operativo |
| `generalData` sin fechas/pax | Toast "Pedile a Emilia que aclare fechas y cantidad de pax". Botón bloqueado. | Operativo |
| `POST /api/quotations` falla | Toast destructive con mensaje del error. Selección preservada. | Operativo |
| Selección excede límite | Toast preventivo + click bloqueado en el UI (nunca se permite exceder) | Operativo |
| Lead pertenece a otro org | `POST /api/leads/[id]/emilia` devuelve 404 enmascarado. | No accesible |
| Org sin flag `features.lead_emilia_chat=true` | Endpoint devuelve 403; UI no muestra modo Emilia (cae al QuotationBuilder clásico). | Beta gating activo |

---

## Testing

### Unit (Jest)

**`lib/emilia/__tests__/quotation-mapper.test.ts`**
- 1 vuelo + 3 hoteles → 3 opciones, cada una con copia del vuelo
- 0 vuelos + 2 hoteles → 2 opciones, sin vuelo
- 1 vuelo + 0 hoteles → 1 opción con solo vuelo
- `parseStars()` con casos: "5 estrellas", "★★★★★", "Boutique", "5 star", null/undefined
- Verifica que `generates_commission=true` para FLIGHT y HOTEL
- Verifica defaults: `cost_amount=0, operator_id=null, admin_fee_percentage=0`

**`lib/emilia/__tests__/lead-context.test.ts`**
- Prompt con destination + notes ricas → output bien estructurado
- Prompt sin notes → solo destination + region
- Prompt sin destination → mensaje claro de error

### Integration (API routes)

**`app/api/leads/[id]/emilia/__tests__/route.test.ts`**
- `POST` crea conversación nueva con `lead_id` y devuelve `{conversation_id, suggested_prompt}` (con flag ON)
- `POST` reusa conversación si ya existe una `active` para el lead
- `GET` devuelve la conversación activa si existe, null sino
- **Defense**: user de otro org → 404 enmascarado
- **Beta gate**: org sin flag `features.lead_emilia_chat=true` → 403 con mensaje "Feature en beta"
- **Beta gate**: org beta (Oficial Testing Vibook) con flag ON → 200
- OpenAI falla → fallback al prompt genérico, response 200

**Regression en `app/api/emilia/__tests__/chat-route.test.ts`** (nuevo o agregado)
- El parser ahora maneja shape `meta.combinedData.flights/.hotels`
- Backward-compat: si vuelve a aparecer shape legacy `data.results.flights`, sigue funcionando (try ambos)

### Manual / e2e

- **Golden path**: abrir lead → Cotizar → revisar prompt → enviar → seleccionar 1 vuelo + 2 hoteles → Generar → ver cotización con 2 opciones en `/sales/leads/{id}` y en `/quotations`
- **Reapertura**: cerrar modal y reabrir → chat se hidrata con historial
- **Multi-tenant**: probar con 2 cuentas distintas, un solo lead → la cuenta del otro org no accede
- **Verificación de precio**: comparar el monto de una opción contra el card mostrado en `/emilia`. Si diverge → bug en mapper (probablemente `price.amount` es por grupo, no por pax)
- **Módulo `/emilia` general**: confirmar que el fix de shape en `chat/route.ts` no rompe el chat genérico del módulo

---

## Rollout

**Permisos**: el botón "Cotizar" ya existe en el lead-modal con permiso de leads (SUPER_ADMIN, ADMIN, SELLER owner). **No cambia**. El chat hereda los mismos.

**Feature flag (BETA gating)**: la feature arranca en **versión beta** habilitada **solo para la org "Oficial Testing Vibook"** (`org_id = 410ada50-d8ae-4d18-8c90-36a9223b378b`, usuario propietario `mypupybox@gmail.com`).

Se sigue el patrón existente del proyecto (`lib/settings/org-features.ts` → `organization_settings` key/value):

- **Feature flag key**: `features.lead_emilia_chat`
- **Activación**: row en `organization_settings` con `(org_id, key='features.lead_emilia_chat', value='true')`

Gating en runtime (3 touchpoints):

1. **UI (`lead-detail-dialog.tsx`)**: el botón "Cotizar" mantiene su label, pero su `onClick`:
   - Si flag ON → `setMode("emilia")` (abre chat)
   - Si flag OFF → comportamiento actual (abre `QuotationBuilderDialog`)
   - El flag se carga 1 vez al montar el modal (vía `useEffect` que fetchea desde un endpoint helper o lo recibe como prop del Server Component padre)
2. **`POST /api/leads/[id]/emilia`**: chequea `getOrgFeatureFlag(supabase, user.org_id, "features.lead_emilia_chat")`. Si OFF → 403 con mensaje "Feature en beta — no disponible para tu organización".
3. **`GET /api/leads/[id]/emilia`**: mismo gate.

**SQL para activar el beta** (ejecutar manualmente post-deploy, también puede ir como migración de seed):

```sql
INSERT INTO organization_settings (org_id, key, value)
VALUES (
  '410ada50-d8ae-4d18-8c90-36a9223b378b',  -- Oficial Testing Vibook
  'features.lead_emilia_chat',
  'true'
)
ON CONFLICT (org_id, key) DO UPDATE SET value = EXCLUDED.value;
```

**Salir de beta (futuro)**: cuando se decida GA, se remueven los 3 gates del código en un PR aparte. El flag puede dejarse en DB para registro histórico o limpiarse con `DELETE FROM organization_settings WHERE key='features.lead_emilia_chat'`.

**Sin `EMILIA_API_KEY`**: independiente del flag de beta. Si la org beta no tiene la API key configurada, el chat muestra "Emilia no está configurada — contactá al administrador" (mismo flow que `/emilia` hoy).

**Migración**: 1 sola, additiva (`lead_id` nullable en `conversations`). Cero riesgo de downtime.

**Pre-deploy checklist**:
1. Correr migración en dev y verificar query plan del index parcial
2. `npm run db:generate` para refrescar types
3. `npm run test` — todos los tests verdes
4. `npm run build && npm run lint`
5. Smoke test manual end-to-end en local con `DISABLE_AUTH=false`
6. Verificar que `/api/emilia/chat` sigue funcionando para el módulo `/emilia` (regression del fix)

**Telemetría (opcional, post-MVP)**: evento `emilia_lead_quotation_generated` con `{lead_id, quotation_id, options_count, has_flight, hotels_count, confidence}` para medir adopción.

**Slack notification**: ninguna. Feature interno del vendedor.

---

## Riesgos asumidos

- **Costo OpenAI**: modelo `gpt-4o-mini` (consistente con otros usos del proyecto). Estimado ~$0.001 por apertura del chat parseando notes. Asumible.
- **Costo Emilia**: ya pagado en el plan. El chat dispara cuando el vendedor envía, no en cada apertura.
- **Shape Emilia puede seguir evolucionando**: el fix incluido cubre el shape actual. Si Emilia vuelve a cambiar, hay que hacer otro PR.
- **Validación de precio por-pax vs por-grupo**: pendiente confirmación en QA. Si está mal en QA, ajustar el mapper antes de mergear.
- **`meal_plan` queda en null**: el vendedor debe completarlo manualmente en el QuotationBuilder. Aceptable por ahora; v2 podría parsear `rooms[].description` con regex/IA.
- **3 gates de beta a remover al pasar a GA**: cuando se decida liberar la feature, hay 3 lugares en el código que cuestionan el flag (1 UI + 2 endpoints). Olvidar uno → comportamiento inconsistente. Mitigación: usar la misma constante (`FEATURE_FLAG_LEAD_EMILIA_CHAT`) en los 3 lugares para que un grep encuentre todo.

---

## Fuera de scope (v2)

- Guardar metadata extra en `quotation_items`: `provider, transactionId, fare_id_broker, policies` — útil cuando integremos reservas reales (makeBudget de Eurovips, ticketing TVC).
- Parser de `meal_plan` desde `rooms[].description`.
- Mostrar desglose `netAmount/taxAmount` en la cotización pública.
- Inferir `operator_id` matcheando `provider` ("TVC", "EUROVIPS") con operadores existentes en el catálogo de la org.
- Drag & drop entre opciones para reordenar.
- Generar cotización con TRANSFERS/ASSISTANCE/EXCURSIONS (Emilia hoy solo devuelve flights + hotels).

---

## Open questions / pre-implementation checks

1. **¿`price.amount` del vuelo es por pax o por grupo?** Confirmar con QA en la primera cotización generada. Si por grupo, dividir por `adults + children` al asignar a `unit_price` o ajustar `quantity=1` para vuelos.
2. **¿El endpoint `/api/emilia/chat` actual está roto?** Verificar antes de empezar: si el módulo `/emilia` muestra resultados, el shape `data.results` sigue funcionando y el fix solo agrega soporte para `meta.combinedData`. Si ya no muestra, el fix también lo arregla.
3. **¿`HotelResultCard` permite saber el `selectedRoomId` desde afuera del componente?** Verificar prop `onRoomSelect` y plumbing — necesario para que el mapper sepa qué room está seleccionado.

---

## Estructura de archivos final

```
components/
├── sales/
│   ├── lead-detail-dialog.tsx          [MODIFY] +mode state, conditional render
│   └── lead-emilia-chat.tsx            [NEW]    Chat embebido completo
└── emilia/
    ├── flight-result-card.tsx          [REUSE]  Sin cambios
    ├── hotel-result-card.tsx           [REUSE]  Sin cambios
    └── room-group-selector.tsx         [REUSE]  Sin cambios

app/api/
├── leads/[id]/emilia/route.ts          [NEW]    GET/POST conversación del lead
├── emilia/chat/route.ts                [FIX]    parser de meta.combinedData
└── quotations/route.ts                 [REUSE]  Sin cambios

lib/emilia/
├── lead-context.ts                     [NEW]    Helper: build prompt context
├── quotation-mapper.ts                 [NEW]    Pure func: selección → payload
└── __tests__/
    ├── lead-context.test.ts            [NEW]
    └── quotation-mapper.test.ts        [NEW]

supabase/migrations/
└── {timestamp}_add_lead_id_to_conversations.sql  [NEW]
```
