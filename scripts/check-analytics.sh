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
  echo "  import { trackEvent } from '@/lib/analytics/ga/track'" >&2
  echo "  trackEvent('nombre_del_evento', { ...params })" >&2
  echo "" >&2
  echo "Si el evento no existe, declaralo primero en lib/analytics/ga/events.ts." >&2
  echo "Recordá: nunca montos, nombres, emails, teléfonos, CUIT/DNI ni texto libre." >&2
  exit 1
fi

echo "Telemetría: gtag/dataLayer contenidos en los módulos autorizados."
