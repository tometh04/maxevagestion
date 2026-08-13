# Telemetría de producto: Google Analytics 4

Estado: activo desde 2026-08-12.
Alcance: cross-cutting (root layout + 16 call sites de eventos).

Esta nota es el contrato de privacidad de la telemetría. Si vas a agregar un
evento, un parámetro o una pantalla, leela antes.

## Qué mide y qué no

GA4 acá responde **cómo se usa el producto**: qué pantallas se abren, dónde se
traba el onboarding, qué proporción de checkouts se completa, qué módulos se
usan. No responde **cuánto factura una agencia**: para eso está Postgres, que es
la única fuente de verdad de cualquier número financiero.

Nunca reconciliar métricas de GA contra billing, caja o ledger. Los ad blockers
tiran aproximadamente 20-40% de los hits, sesgado hacia usuarios técnicos.

## Contrato de privacidad

**Se manda:**

- `page_view` con la URL normalizada.
- Eventos de producto con parámetros categóricos, booleanos y buckets.
- Identidad user-scoped: `user_id` (UUID de `users.id`), `org_id`, `role`, `plan`.

**No se manda nunca:**

email, nombre de persona, nombre de agencia u operador, montos, moneda con
importe, datos de clientes o pasajeros, teléfono, CUIT/DNI/CBU, texto libre
escrito por el usuario (notas, comentarios, prompts de Cerebro, mensajes de
error de AFIP), tokens ni términos de búsqueda.

**Superficies excluidas:** `/cotizacion/*`. Son las vistas públicas por token que
abren los clientes finales de la agencia: otra audiencia, y no consintieron nada.
En esas rutas el snippet de gtag ni siquiera se emite en el HTML.

**Consentimiento:** hoy no hay banner. Es un riesgo aceptado explícitamente. Un
UUID de Supabase es pseudónimo pero sigue siendo dato personal bajo GDPR, y
`org_id` hace re-identificables a los tenants frente a Google. La política de
privacidad debería nombrar a Google Analytics como procesador. Si algún día hace
falta gatear por consentimiento, el único lugar a tocar es `isGaEnabled()` en
`lib/analytics/ga/config.ts`.

## Cómo está armado

```txt
app/layout.tsx
  <GoogleAnalytics />          carga gtag.js, se auto-excluye por ruta
  <AnalyticsPageView />        page_view normalizado por navegación (en <Suspense>)

app/(dashboard)/layout.tsx     <AnalyticsIdentity identity={buildAnalyticsIdentity(...)} />
app/admin/layout.tsx           idem, con role: "platform_admin"

lib/analytics/
  events.ts     catálogo tipado + EVENT_SINKS — FUENTE DE VERDAD, común a ambos sinks
  modules.ts    vocabulario de módulos + moduleFromPath (puro)
  track.ts      DISPATCHER — la única puerta de entrada para los call sites
  ga/
    config.ts     isGaEnabled() — puerta de entrada del sink GA
    paths.ts      isAnalyticsEnabledPath / normalizePath / normalizeQuery (puro)
    scrub.ts      scrubParams / bucketCount (puro) — corre para los DOS sinks
    identity.ts   buildAnalyticsIdentity (puro, server-safe)
    track.ts      transporte — ÚNICO módulo que habla con gtag
  telemetry/
    config.ts     isTelemetryEnabled() — puerta de entrada del sink propio
    emit.ts       transporte browser — batch + sendBeacon a /api/telemetry
    server.ts     escritura de usage_events + trackServerEvent()
```

Ojo: `lib/analytics/date-filter.ts` es otro bounded context (reporting de negocio
del tenant).

## Dos sinks, un catálogo

Desde 2026-08-13 GA4 no es el único destino. Cada evento declara en
`EVENT_SINKS` a dónde va:

- **`ga`** — comportamiento agregado, funnels, adquisición. Lo comen los ad
  blockers en un 20-40% y no se puede cruzar contra billing.
- **`db`** — `usage_events` en Postgres. Exacto, por tenant, cruzable contra
  `subscription_status`. Ver `usage-heatmap.md`.

Es el patrón "un tracking plan, muchos destinos" de Segment/PostHog, sin vendor.
El `Record` de `EVENT_SINKS` es exhaustivo: un evento nuevo sin sink declarado
rompe el build en vez de perderse en silencio.

**La regla que evita el doble conteo**: si la acción ya deja una fila en una
tabla de dominio, NO va al sink `db` — el mapa de calor deriva esas escrituras
directamente de las tablas. El sink `db` es para lecturas (`module_viewed`,
`record_opened`, `report_exported`) y para `ai_query_submitted`, que no deja
fila propia. Hay un test que lo fija.

Los call sites importan `trackEvent` de `lib/analytics/track` y nunca de
`ga/track` ni de `telemetry/emit`: importar el transporte directo manda el
evento a un solo sink ignorando lo declarado. El lint lo hace cumplir.

### Por qué la exclusión de `/cotizacion` es client-side

`middleware.ts` setea el header `x-pathname` en la línea ~93, pero retorna antes,
en la ~64, para `/cotizacion/*` — y también para el bypass `DISABLE_AUTH`, para
el branch de envs placeholder y para el webhook de manychat. "Falta el header"
significa cuatro cosas distintas y ningún default es seguro: asumir habilitado
manda GA a las vistas públicas, asumir deshabilitado mata la telemetría en local
y ante cualquier misconfig de prod.

`usePathname()` funciona durante el render server de un client component, así que
el early return deja el script fuera del HTML. Y la regla queda como función pura
testeable, que es lo que pide `AGENTS.md`.

Montar por layout no sirve: `(auth)` no tiene `layout.tsx` y `app/paywall/` solo
tiene `page.tsx`, así que serían cinco puntos de montaje y el próximo route group
quedaría sin telemetría en silencio.

### Por qué los page_view son manuales

El `page_view` automático de GA4 manda la URL cruda. Dos problemas concretos:

1. **Cardinalidad**: `/operations/<uuid>` genera un `page_path` por operación;
   GA4 colapsa dimensiones de alta cardinalidad en `(other)`.
2. **PII**: `components/admin/orgs-search-bar.tsx` empuja el buscador a la URL
   (`?q=...`) y su placeholder es *"Buscar por nombre, slug, CUIT, email, ID..."*.
   Con el comportamiento default eso le manda nombres de agencia, CUITs y emails
   a Google, un hit por keystroke debounceado.

Por eso el `config` va con `send_page_view: false` y cada hit pasa explícitamente
`page_location`, `page_path` y `page_referrer` ya normalizados. **Esto último es
load-bearing**: gtag re-deriva esos campos de `document.location` y
`document.referrer` en *cada* evento salvo que se los pise, así que un solo
`trackEvent` sin override en `/admin/orgs?q=Juan Perez` filtra la búsqueda entera.

El allowlist de query tiene un efecto secundario útil: como `q` se descarta, el
debounce del buscador colapsa a la misma clave y no se manda un page_view por
tecla.

## Cómo agregar un evento

1. Declararlo en `lib/analytics/events.ts` con su shape de params.
2. Declarar sus sinks en `EVENT_SINKS`, en el mismo archivo. **El `Record` es
   exhaustivo: si no lo agregás, no compila.** Si la acción ya deja fila en una
   tabla de dominio, va solo a `ga`.
3. Agregar una muestra en `lib/analytics/__tests__/events.test.ts`. **El tipo de
   `SAMPLES` también es exhaustivo.** Ese test verifica que ningún parámetro
   declarado se pierda al pasar por el scrubber.
4. Llamar a `trackEvent(...)` — importado de `@/lib/analytics/track`, nunca del
   transporte — en el success path del componente, después del `toast` existente
   y nunca dentro de un `try` que pueda alterar el control flow. Desde el server
   (API routes, webhooks, crons) va `trackServerEvent()`.
5. Si el evento tiene sink `ga`: registrar los params nuevos como custom
   definitions en la consola de GA4. Los no registrados se recolectan pero no
   aparecen en reportes, y **no es retroactivo**.

### Nombres reservados por GA4

GA4 se reserva los nombres de su esquema de ecommerce y de los parámetros
predefinidos: `currency`, `value`, `items`, `transaction_id`, `price`,
`quantity`, `search_term`, `page_location`, `language`, etc. Los recolecta
igual, pero la consola **rechaza registrarlos como dimensión custom** ("Parameter
name is not allowed for this scope"), así que el dato queda invisible en todos
los reportes.

Por eso el parámetro de moneda de los pagos se llama `payment_currency` y no
`currency`. El test `events.test.ts` valida la lista completa contra el catálogo.

### La trampa de los nombres de parámetro

`scrubParams` descarta por fragmento de clave, así que un parámetro
perfectamente válido en TypeScript puede desaparecer en runtime sin que nadie se
entere: `has_cuit` contiene "cuit", `has_quoted_price` contiene "price". Por eso
existe el test de catálogo. Los nombres correctos son `has_tax_id` y `had_quote`.

Excepción: las claves `*_bucket` pasan aunque matcheen el denylist, siempre que
el valor sea una etiqueta exacta de `bucketCount()`. Así `passengers_bucket`
funciona sin abrir la puerta a texto libre.

## Enforcement

`scripts/check-analytics.sh` (corre en `npm run lint`) tiene tres guards, y los
tres convierten una convención en un check:

1. **gtag/dataLayer** solo en `lib/analytics/ga/track.ts` y
   `components/analytics/google-analytics.tsx`. Sostiene "todo pasa por el
   scrubber".
2. **`/api/telemetry`** solo desde `lib/analytics/telemetry/emit.ts`. Un `fetch`
   suelto se saltea el scrubber, el batching y el gate — y dispara un insert por
   evento contra la tabla de mayor volumen del schema.
3. **`ga/track` y `telemetry/emit`** solo se importan desde el dispatcher. Sin
   esto, un call site manda el evento a un solo sink ignorando `EVENT_SINKS`, y
   el síntoma (una métrica que está en GA y no en la DB) aparece meses después.

Además, dos capas independientes contra PII: el tipado de `events.ts` en compile
time, y `scrubParams` en runtime para lo que se cuele por un cast. Corre para
los dos sinks: el propio también es un stream que lee el platform admin de todos
los tenants.

Tests: `npm test -- lib/analytics` (158 casos).

## Configuración en la consola de GA4

Obligatorio antes del primer hit en producción:

- **Apagar Enhanced Measurement, todo.** No es opcional: el sub-feature "site
  search" auto-scrapea `q`, `s`, `search`, `query`, `keyword` de la URL y los
  reporta como `search_term` — reabre exactamente el leak que cierra el
  allowlist, del lado del servidor y sin nada que detectar en un code review.
  También apagar page_views (mandamos manuales, si no se duplica todo), outbound
  clicks, scrolls, form interactions, downloads y video.
- Registrar custom definitions: `org_id`, `role`, `plan` como **user-scoped**;
  `surface`, `result`, `plan_id`, `invoice_kind`, `entity`, `source_channel`,
  `from_stage`, `to_stage`, `sale_currency`, `payment_method` y los `*_bucket`
  como **event-scoped**.
- Retención de datos: 14 meses. Google signals: off.

## Deploy

`NEXT_PUBLIC_GA_MEASUREMENT_ID` se inlinea en **build time**. Setearla en Railway
sin redeployar no hace nada: el bundle queda con el string vacío y GA nunca carga,
en silencio. Setear **y** redeployar.

No setear `NEXT_PUBLIC_GA_DEBUG` en producción.
