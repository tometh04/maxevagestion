#!/usr/bin/env bash
# Telemetría GA4 — Fail CI si algún archivo toca gtag / dataLayer fuera de los
# módulos autorizados.
#
# Por qué: todo lo que sale hacia Google tiene que pasar por `scrubParams()` y
# por el override de page_location/page_path/page_referrer que vive en
# `lib/analytics/ga/track.ts`. Un `gtag('event', ...)` suelto en un componente
# se saltea las dos cosas y filtra PII (montos, nombres, el `?q=` del buscador
# del admin) sin que se note en un code review.
#
# Uso:
#   bash scripts/check-analytics.sh
#
# Se integra con `npm run lint` vía package.json.

set -euo pipefail

# Únicos módulos que pueden hablar con gtag.
ALLOWED_PATHS=(
  "lib/analytics/ga/track.ts"
  "components/analytics/google-analytics.tsx"  # solo el <Script src> del loader
)

# Se busca USO real (`window.dataLayer`, `.push` sobre el layer, llamada a
# `gtag(`, el host de GTM), no la mención en un comentario: si no, documentar el
# diseño en una nota rompe el lint. Se excluyen los tests, que mockean el
# dataLayer a propósito.
current=$(grep -rlE "window\.dataLayer|dataLayer\.push|gtag\(|googletagmanager\.com" \
  --include="*.ts" --include="*.tsx" \
  app/ lib/ components/ 2>/dev/null \
  | grep -vE "(^|/)__tests__/" \
  | sort -u || true)

allowed=$(printf '%s\n' "${ALLOWED_PATHS[@]}" | sort -u)

offenders=$(comm -23 <(echo "$current") <(echo "$allowed"))

if [ -n "$offenders" ]; then
  echo "Telemetría: archivos fuera de lib/analytics/ga tocan gtag/dataLayer." >&2
  echo "" >&2
  echo "Archivos ofensores:" >&2
  echo "$offenders" | sed 's/^/  /' >&2
  echo "" >&2
  echo "Usá los helpers tipados en vez de llamar a gtag directo:" >&2
  echo "  import { trackEvent } from '@/lib/analytics/track'" >&2
  echo "  trackEvent('nombre_del_evento', { ...params })" >&2
  echo "" >&2
  echo "Si el evento no existe, declaralo primero en lib/analytics/events.ts." >&2
  echo "Recordá: nunca montos, nombres, emails, teléfonos, CUIT/DNI ni texto libre." >&2
  exit 1
fi

# ─── Sink propio: nadie le pega a /api/telemetry salvo el emisor ──────────────
#
# Mismo razonamiento que arriba, otro destino. Un `fetch('/api/telemetry')` suelto
# en un componente se saltea `scrubParams()`, el batching y el gate de
# `isTelemetryEnabled()` — y como la tabla es la de mayor volumen del schema,
# también dispara un insert por evento en vez de uno por lote.
TELEMETRY_ALLOWED=(
  "lib/analytics/telemetry/config.ts"   # define la constante del endpoint
  "lib/analytics/telemetry/emit.ts"     # cliente: batch + sendBeacon
)

telemetry_current=$(grep -rlE "['\"\`]/api/telemetry" \
  --include="*.ts" --include="*.tsx" \
  app/ lib/ components/ 2>/dev/null \
  | grep -vE "(^|/)__tests__/" \
  | grep -vE "^app/api/telemetry/" \
  | sort -u || true)

telemetry_allowed=$(printf '%s\n' "${TELEMETRY_ALLOWED[@]}" | sort -u)
telemetry_offenders=$(comm -23 <(echo "$telemetry_current") <(echo "$telemetry_allowed"))

if [ -n "$telemetry_offenders" ]; then
  echo "Telemetría: archivos fuera del emisor le pegan a /api/telemetry." >&2
  echo "" >&2
  echo "Archivos ofensores:" >&2
  echo "$telemetry_offenders" | sed 's/^/  /' >&2
  echo "" >&2
  echo "Emitir siempre por el dispatcher, que rutea según EVENT_SINKS:" >&2
  echo "  import { trackEvent } from '@/lib/analytics/track'" >&2
  echo "Desde el server (API routes, webhooks, crons):" >&2
  echo "  import { trackServerEvent } from '@/lib/analytics/telemetry/server'" >&2
  exit 1
fi

# ─── El dispatcher es la única puerta de entrada ──────────────────────────────
#
# Importar `ga/track` o `telemetry/emit` directo desde un call site manda el
# evento a UN solo sink, ignorando lo que declara `EVENT_SINKS`. El síntoma es
# una métrica que existe en GA y no en la DB (o al revés) y que nadie sabe
# explicar meses después.
DISPATCH_ALLOWED=(
  "components/analytics/analytics-identity.tsx"   # set/clear de user properties (solo GA)
  "components/analytics/analytics-page-view.tsx"  # page_view de GA + module_viewed
  "lib/analytics/track.ts"
)

# Se busca el IMPORT, no la mención: `google-analytics.tsx` documenta en un
# comentario por qué el bootstrap vive en `ga/track.ts`, y eso no es un call site.
dispatch_current=$(grep -rlE "from ['\"][^'\"]*analytics/(ga/track|telemetry/emit)['\"]" \
  --include="*.ts" --include="*.tsx" \
  app/ lib/ components/ 2>/dev/null \
  | grep -vE "(^|/)__tests__/" \
  | grep -vE "^lib/analytics/(ga|telemetry)/" \
  | sort -u || true)

dispatch_allowed=$(printf '%s\n' "${DISPATCH_ALLOWED[@]}" | sort -u)
dispatch_offenders=$(comm -23 <(echo "$dispatch_current") <(echo "$dispatch_allowed"))

if [ -n "$dispatch_offenders" ]; then
  echo "Telemetría: hay call sites que saltean el dispatcher." >&2
  echo "" >&2
  echo "Archivos ofensores:" >&2
  echo "$dispatch_offenders" | sed 's/^/  /' >&2
  echo "" >&2
  echo "Importá siempre desde el dispatcher:" >&2
  echo "  import { trackEvent } from '@/lib/analytics/track'" >&2
  exit 1
fi

echo "Telemetría: gtag, /api/telemetry y el dispatcher contenidos en sus módulos."
