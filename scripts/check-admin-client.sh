#!/usr/bin/env bash
# SaaS Pilar 2 — Fail CI si algún archivo nuevo usa `createAdminClient`
# fuera del allowlist.
#
# Uso:
#   bash scripts/check-admin-client.sh
#
# Se integra con `npm run lint` vía package.json.

set -euo pipefail

ALLOWLIST_FILE="scripts/admin-client-allowlist.txt"

if [ ! -f "$ALLOWLIST_FILE" ]; then
  echo "check-admin-client: no se encuentra $ALLOWLIST_FILE" >&2
  exit 1
fi

# Archivos actualmente permitidos (ignora líneas vacías y comentarios).
allowed=$(grep -vE '^\s*(#|$)' "$ALLOWLIST_FILE" | awk '{print $1}' | sort -u)

# Archivos que importan o referencian createAdminClient.
current=$(grep -rln "createAdminClient" --include="*.ts" --include="*.tsx" app/ lib/ 2>/dev/null | sort -u || true)

# Archivos fuera del allowlist = errores.
offenders=$(comm -23 <(echo "$current") <(echo "$allowed"))

if [ -n "$offenders" ]; then
  echo "SaaS Pilar 2: archivos fuera del allowlist usan createAdminClient." >&2
  echo "" >&2
  echo "Archivos ofensores:" >&2
  echo "$offenders" | sed 's/^/  /' >&2
  echo "" >&2
  echo "Opciones:" >&2
  echo "  1. Migrar a createServerClient (RLS tenant_isolation)." >&2
  echo "  2. Si el admin client es genuinamente requerido (storage, auth," >&2
  echo "     cron, webhook), agregar el path a $ALLOWLIST_FILE con justificación." >&2
  exit 1
fi

# Archivos en el allowlist que ya no usan admin = info (sugerencia de limpieza).
stale=$(comm -13 <(echo "$current") <(echo "$allowed"))
if [ -n "$stale" ]; then
  echo "Entries en el allowlist sin uso actual (considerá removerlos):" >&2
  echo "$stale" | sed 's/^/  /' >&2
fi

echo "createAdminClient: todos los usos dentro del allowlist."
