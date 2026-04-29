#!/usr/bin/env python3
"""
Fix retroactivo: vincular operaciones importadas (CSV USD) con clientes.

1. Lee el CSV USD (import-rosario.csv)
2. Busca operaciones sin operation_customers en la DB
3. Matchea por destino + fecha salida + monto venta
4. Si el cliente no existe, lo crea
5. Crea el registro en operation_customers
"""

import csv
import json
import sys
import uuid
import urllib.request
import urllib.parse
import re

# ============================================================
# CONFIG
# ============================================================
SB_URL = "https://pmqvplyyxiobkllapgjp.supabase.co"
SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtcXZwbHl5eGlvYmtsbGFwZ2pwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA5MTI5NCwiZXhwIjoyMDc5NjY3Mjk0fQ.VBeE3W9HNeTc4FQs_QCU9uD-EHDtPpGZVaPQS5nNp3c"
CSV_PATH = "/Users/tomiisanchezz/Desktop/Repos/erplozada/import-rosario.csv"

DRY_RUN = "--dry-run" in sys.argv

# ============================================================
# HELPERS
# ============================================================
def sb_request(endpoint, method="GET", data=None, params=None):
    url = f"{SB_URL}/rest/v1/{endpoint}"
    if params:
        url += "?" + urllib.parse.urlencode(params)

    headers = {
        "apikey": SB_KEY,
        "Authorization": f"Bearer {SB_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"  ❌ HTTP {e.code}: {error_body}")
        return None

def clean_amount(amount_str):
    if not amount_str or not amount_str.strip():
        return 0.0
    cleaned = amount_str.strip().replace("$", "").replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0

def parse_date(date_str):
    """Parse DD/MM/YYYY -> YYYY-MM-DD"""
    if not date_str or not date_str.strip():
        return None
    parts = date_str.strip().split("/")
    if len(parts) != 3:
        return None
    day = int(parts[0])
    month = int(parts[1])
    year = int(parts[2])
    return f"{year}-{month:02d}-{day:02d}"

def split_name(full_name):
    if not full_name or not full_name.strip():
        return "Sin nombre", "-"
    parts = full_name.strip().split()
    if len(parts) == 1:
        return parts[0], "-"
    return parts[0], " ".join(parts[1:])

# ============================================================
# MAIN
# ============================================================
def main():
    print(f"{'🔍 DRY RUN' if DRY_RUN else '🚀 EJECUTANDO'} — Fix import customers (CSV USD)")
    print()

    # 1. Leer CSV
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        all_rows = list(reader)

    csv_rows = [r for r in all_rows if r.get("Nombre del Cliente", "").strip() and r.get("Destino", "").strip()]
    print(f"📂 CSV: {len(csv_rows)} filas con datos")

    # 2. Parsear CSV a estructura matcheable
    csv_data = []
    for r in csv_rows:
        name = r.get("Nombre del Cliente", "").strip()
        dest = r.get("Destino", "").strip().lower()
        dep = parse_date(r.get("Fecha Salida", ""))
        sale = clean_amount(r.get("Monto Venta", ""))
        csv_data.append({
            "name": name,
            "dest": dest,
            "departure_date": dep,
            "sale_amount": sale,
        })

    # 3. Buscar operaciones sin operation_customers
    print("📋 Buscando operaciones sin cliente vinculado...")

    # Primero: todas las operaciones
    ops = sb_request("operations", params={
        "select": "id,destination,departure_date,sale_amount_total,file_code",
        "limit": "2000",
        "order": "created_at.desc",
    })

    if not ops:
        print("❌ No se pudieron obtener operaciones")
        return

    # Segundo: todos los operation_customers existentes
    oc_existing = sb_request("operation_customers", params={
        "select": "operation_id",
        "limit": "5000",
    })

    linked_op_ids = set()
    if oc_existing:
        for oc in oc_existing:
            linked_op_ids.add(oc["operation_id"])

    # Operaciones sin cliente
    orphan_ops = [op for op in ops if op["id"] not in linked_op_ids]
    print(f"   Total operaciones: {len(ops)}")
    print(f"   Con cliente vinculado: {len(linked_op_ids)}")
    print(f"   Sin cliente (huérfanas): {len(orphan_ops)}")
    print()

    # 4. Cargar clientes existentes
    print("📋 Cargando clientes existentes...")
    customers = sb_request("customers", params={"select": "id,first_name,last_name", "limit": "2000"})

    customer_cache = {}
    if customers:
        for c in customers:
            fn = (c.get("first_name") or "").strip().lower()
            ln = (c.get("last_name") or "").strip().lower()
            key = f"{fn}|{ln}"
            customer_cache[key] = c["id"]
    print(f"   {len(customer_cache)} clientes en cache")
    print()

    # 5. Matchear operaciones huérfanas con CSV
    stats = {
        "matched": 0,
        "not_matched": 0,
        "customers_created": 0,
        "customers_reused": 0,
        "links_created": 0,
        "errors": 0,
    }

    not_matched_ops = []

    for op in orphan_ops:
        op_dest = (op.get("destination") or "").strip().lower()
        op_dep = op.get("departure_date")
        if op_dep:
            op_dep = op_dep[:10]  # YYYY-MM-DD
        op_sale = float(op.get("sale_amount_total") or 0)

        # Buscar match en CSV por destino + fecha + monto
        match = None
        for csv_row in csv_data:
            if csv_row["dest"] == op_dest and csv_row["departure_date"] == op_dep:
                # Check amount (tolerancia de $1 por redondeo)
                if abs(csv_row["sale_amount"] - op_sale) < 1.0:
                    match = csv_row
                    break

        # Si no matcheó por los 3 campos, intentar destino + monto (sin fecha)
        if not match:
            for csv_row in csv_data:
                if csv_row["dest"] == op_dest and abs(csv_row["sale_amount"] - op_sale) < 1.0:
                    match = csv_row
                    break

        if not match:
            stats["not_matched"] += 1
            not_matched_ops.append(f"{op.get('file_code', '?')} | {op_dest} | {op_dep} | ${op_sale}")
            continue

        stats["matched"] += 1
        client_name = match["name"]

        # 6. Buscar o crear cliente
        first_name, last_name = split_name(client_name)
        customer_key = f"{first_name.lower()}|{last_name.lower()}"

        customer_id = customer_cache.get(customer_key)

        if customer_id:
            stats["customers_reused"] += 1
        else:
            # Crear cliente
            if DRY_RUN:
                customer_id = f"DRY-{client_name}"
                stats["customers_created"] += 1
            else:
                email = f"{first_name.lower().replace(' ', '')}@importado.com"
                result = sb_request("customers", method="POST", data={
                    "first_name": first_name,
                    "last_name": last_name,
                    "email": email,
                    "phone": "-",
                })
                if result and len(result) > 0:
                    customer_id = result[0]["id"]
                    customer_cache[customer_key] = customer_id
                    stats["customers_created"] += 1
                else:
                    print(f"  ❌ Error creando cliente: {client_name}")
                    stats["errors"] += 1
                    continue

        # 7. Crear operation_customers
        if DRY_RUN:
            print(f"  [DRY] Vincular: {client_name} → {op_dest} (${op_sale})")
            stats["links_created"] += 1
        else:
            result = sb_request("operation_customers", method="POST", data={
                "operation_id": op["id"],
                "customer_id": customer_id,
                "role": "MAIN",
            })
            if result:
                stats["links_created"] += 1
            else:
                print(f"  ❌ Error vinculando: {client_name} → {op['id']}")
                stats["errors"] += 1

    # Resumen
    print()
    print("=" * 60)
    print(f"{'🔍 DRY RUN' if DRY_RUN else '✅ COMPLETADO'}")
    print(f"  Operaciones matcheadas con CSV: {stats['matched']}")
    print(f"  Operaciones sin match: {stats['not_matched']}")
    print(f"  Clientes creados: {stats['customers_created']}")
    print(f"  Clientes reutilizados: {stats['customers_reused']}")
    print(f"  Vínculos creados: {stats['links_created']}")
    print(f"  Errores: {stats['errors']}")
    print("=" * 60)

    if not_matched_ops and len(not_matched_ops) <= 30:
        print()
        print(f"Operaciones sin match ({len(not_matched_ops)}):")
        for line in not_matched_ops:
            print(f"  {line}")

if __name__ == "__main__":
    main()
