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

lib/analytics/ga/
  config.ts     isGaEnabled() — única puerta de entrada
  paths.ts      isAnalyticsEnabledPath / normalizePath / normalizeQuery (puro)
  scrub.ts      scrubParams / bucketCount (puro)
  identity.ts   buildAnalyticsIdentity (puro, server-safe)
  events.ts     catálogo tipado de eventos
  track.ts      transporte — ÚNICO módulo que habla con gtag
```

Ojo: `lib/analytics/date-filter.ts` es otro bounded context (reporting de negocio
del tenant). Todo lo de GA vive bajo `lib/analytics/ga/`.

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

1. Declararlo en `lib/analytics/ga/events.ts` con su shape de params.
2. Agregar una muestra en `lib/analytics/ga/__tests__/events.test.ts`. **El tipo
   de `SAMPLES` es exhaustivo: si no lo agregás, no compila.** Ese test verifica
   que ningún parámetro declarado se pierda al pasar por el scrubber.
3. Llamar a `trackEvent(...)` en el success path del componente, después del
   `toast` existente y nunca dentro de un `try` que pueda alterar el control flow.
4. Registrar los params nuevos como custom definitions en la consola de GA4. Los
   no registrados se recolectan pero no aparecen en reportes, y **no es
   retroactivo**.

### La trampa de los nombres de parámetro

`scrubParams` descarta por fragmento de clave, así que un parámetro
perfectamente válido en TypeScript puede desaparecer en runtime sin que nadie se
entere: `has_cuit` contiene "cuit", `has_quoted_price` contiene "price". Por eso
existe el test de catálogo. Los nombres correctos son `has_tax_id` y `had_quote`.

Excepción: las claves `*_bucket` pasan aunque matcheen el denylist, siempre que
el valor sea una etiqueta exacta de `bucketCount()`. Así `passengers_bucket`
funciona sin abrir la puerta a texto libre.

## Enforcement

- `scripts/check-analytics.sh` (corre en `npm run lint`) falla si algo fuera de
  `lib/analytics/ga/track.ts` y `components/analytics/google-analytics.tsx` toca
  gtag o el dataLayer. Convierte "todo pasa por el scrubber" en un check.
- Dos capas independientes contra PII: el tipado de `events.ts` en compile time,
  y `scrubParams` en runtime para lo que se cuele por un cast.
- Tests: `npm test -- lib/analytics/ga` (112 casos).

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
