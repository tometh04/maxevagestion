#!/bin/bash
# ============================================================
# Script para actualizar operation_date de operaciones importadas
# USO:
#   bash scripts/update-operation-dates.sh          → DRY RUN
#   bash scripts/update-operation-dates.sh --execute → EJECUTAR
# ============================================================

set -e

# Cargar env
source .env.local

SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
API="$SUPABASE_URL/rest/v1"
HEADERS=(-H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H "Content-Type: application/json" -H "Prefer: return=minimal")

MODE="DRY_RUN"
if [ "$1" = "--execute" ]; then
  MODE="EXECUTE"
fi

echo "============================================================"
echo "  ACTUALIZACIÓN DE operation_date"
echo "  Modo: $MODE"
echo "============================================================"
echo ""

# 1. Obtener operaciones con su cliente principal usando RPC
echo "🔍 Obteniendo operaciones..."
OPERATIONS=$(curl -s "$API/rpc/execute_readonly_query" \
  "${HEADERS[@]}" \
  -d '{
    "query_text": "SELECT o.id, o.file_code, o.operation_date, o.departure_date, o.destination, c.first_name, c.last_name FROM operations o LEFT JOIN operation_customers oc ON oc.operation_id = o.id AND oc.role = '\''MAIN'\'' LEFT JOIN customers c ON c.id = oc.customer_id WHERE o.status != '\''CANCELLED'\'' ORDER BY o.departure_date"
  }')

# Verificar respuesta
if echo "$OPERATIONS" | grep -q '"error"'; then
  echo "❌ Error obteniendo operaciones:"
  echo "$OPERATIONS" | head -5
  exit 1
fi

OP_COUNT=$(echo "$OPERATIONS" | python3 -c "import json,sys; data=json.load(sys.stdin); print(len(data) if data else 0)" 2>/dev/null || echo "0")
echo "   $OP_COUNT operaciones encontradas"
echo ""

# 2. Guardar operaciones en archivo temporal
TEMP_OPS="/tmp/erp_operations.json"
echo "$OPERATIONS" > "$TEMP_OPS"

# 3. Procesar CSV y generar updates
echo "📄 Procesando CSV..."

python3 << 'PYTHON_SCRIPT'
import csv
import json
import sys
import os

# Meses en español → número
MESES = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
    'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
    'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
}

def month_to_date(month_str):
    if not month_str or not month_str.strip():
        return None
    name = month_str.strip().lower()
    month = MESES.get(name)
    if month is None:
        return None
    # Enero = 2026, todo lo demás = 2025
    year = 2026 if name == 'enero' else 2025
    return f"{year}-{month:02d}-01"

def parse_date(date_str):
    if not date_str or not date_str.strip():
        return None
    s = date_str.strip().replace('//', '/').replace(' ', '')
    parts = s.split('/')
    if len(parts) >= 3:
        day = int(parts[0])
        month = int(parts[1])
        year = int(parts[2])
        if year < 100:
            year += 2000
        if 1 <= day <= 31 and 1 <= month <= 12:
            return f"{year}-{month:02d}-{day:02d}"
    return None

# Leer operaciones de la BD
with open('/tmp/erp_operations.json', 'r') as f:
    operations = json.load(f) or []

print(f"   {len(operations)} operaciones en BD")

# Leer CSV
csv_path = 'import-rosario.csv'
rows = []
with open(csv_path, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        rows.append(row)

print(f"   {len(rows)} filas en CSV")
print()

# Procesar
updates = []
not_found = []
skipped = 0
already_correct = 0

for i, row in enumerate(rows):
    row_num = i + 2

    nombre = row.get('Nombre del Cliente', '').strip()
    destino = row.get('Destino', '').strip()
    fecha_op = row.get('Fecha Operación', row.get('Fecha Operacion', '')).strip()
    fecha_sal = row.get('Fecha Salida', '').strip()

    if not nombre and not destino:
        skipped += 1
        continue

    new_date = month_to_date(fecha_op)
    if not new_date:
        skipped += 1
        continue

    csv_departure = parse_date(fecha_sal)
    csv_lastname = nombre.split()[0].lower() if nombre else ''
    csv_dest = destino.lower()

    # Buscar match
    match = None
    for op in operations:
        # Match departure_date
        op_dep = (op.get('departure_date') or '')[:10]
        if csv_departure and op_dep != csv_departure:
            continue

        # Match destino
        op_dest = (op.get('destination') or '').lower()
        if csv_dest and op_dest and csv_dest not in op_dest and op_dest not in csv_dest:
            continue

        # Match apellido
        op_last = (op.get('last_name') or '').lower()
        op_first = (op.get('first_name') or '').lower()
        if csv_lastname:
            if (csv_lastname not in op_last and op_last not in csv_lastname and
                csv_lastname not in op_first and op_first not in csv_lastname):
                continue

        match = op
        break

    if not match:
        if len(not_found) < 20:
            not_found.append(f"Fila {row_num}: {nombre} | {destino} | {fecha_sal}")
        else:
            not_found.append("...")
        continue

    current_date = (match.get('operation_date') or '')[:10] if match.get('operation_date') else 'NULL'
    if current_date == new_date:
        already_correct += 1
        continue

    client_name = f"{match.get('first_name', '?')} {match.get('last_name', '?')}"
    updates.append({
        'id': match['id'],
        'file_code': match.get('file_code', '-'),
        'cliente': client_name,
        'destino': match.get('destination', '-'),
        'old_date': current_date,
        'new_date': new_date,
    })

# Resumen
print("=" * 80)
print("📊 RESUMEN")
print("=" * 80)
print(f"   Filas CSV:          {len(rows)}")
print(f"   Saltadas:           {skipped}")
print(f"   No encontradas:     {len(not_found)}")
print(f"   Ya correctas:       {already_correct}")
print(f"   A ACTUALIZAR:       {len(updates)}")
print()

if not_found:
    print("❓ No encontradas (primeras 20):")
    for nf in not_found[:20]:
        print(f"   {nf}")
    print()

if updates:
    print("📝 CAMBIOS:")
    print("-" * 100)
    print(f"{'FILE CODE':<18} {'CLIENTE':<25} {'DESTINO':<20} {'ACTUAL':<15} → {'NUEVA'}")
    print("-" * 100)
    for u in updates:
        print(f"{u['file_code'][:17]:<18} {u['cliente'][:24]:<25} {u['destino'][:19]:<20} {u['old_date']:<15} → {u['new_date']}")
    print("-" * 100)
    print()

# Guardar updates para el bash script
with open('/tmp/erp_updates.json', 'w') as f:
    json.dump(updates, f)

print(f"💾 {len(updates)} updates guardados en /tmp/erp_updates.json")
PYTHON_SCRIPT

echo ""

if [ "$MODE" = "DRY_RUN" ]; then
  echo "🔍 DRY-RUN completado. Para ejecutar:"
  echo "   bash scripts/update-operation-dates.sh --execute"
  exit 0
fi

# 4. EJECUTAR UPDATES
echo "⚡ Ejecutando actualizaciones..."
UPDATED=0
ERRORS=0

while IFS= read -r line; do
  ID=$(echo "$line" | python3 -c "import json,sys; u=json.loads(sys.stdin.read()); print(u['id'])")
  NEW_DATE=$(echo "$line" | python3 -c "import json,sys; u=json.loads(sys.stdin.read()); print(u['new_date'])")
  FILE_CODE=$(echo "$line" | python3 -c "import json,sys; u=json.loads(sys.stdin.read()); print(u['file_code'])")

  RESULT=$(curl -s -o /dev/null -w "%{http_code}" \
    "$API/operations?id=eq.$ID" \
    -X PATCH \
    "${HEADERS[@]}" \
    -d "{\"operation_date\": \"$NEW_DATE\"}")

  if [ "$RESULT" = "204" ]; then
    UPDATED=$((UPDATED + 1))
    echo "   ✅ $FILE_CODE → $NEW_DATE"
  else
    ERRORS=$((ERRORS + 1))
    echo "   ❌ $FILE_CODE → HTTP $RESULT"
  fi
done < <(python3 -c "
import json
with open('/tmp/erp_updates.json') as f:
    updates = json.load(f)
for u in updates:
    print(json.dumps(u))
")

echo ""
echo "============================================================"
echo "✅ Actualizadas: $UPDATED"
echo "❌ Errores: $ERRORS"
echo "============================================================"
