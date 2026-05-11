#!/usr/bin/env python3
"""
Import Rosario ARS operations from CSV
- Converts ARS amounts to USD at TC 1500
- Creates customers, operations, operation_operators, operation_customers, payments
- Payments: impact deudas (receivables/payables) but do NOT move financial accounts (no ledger_movement_id)
"""

import csv
import json
import sys
import uuid
import urllib.request
import urllib.parse
import re
from datetime import datetime

# ============================================================
# CONFIG
# ============================================================
import os

# Security P0: env vars en vez de JWT hardcodeada. Setear antes de correr:
#   export SB_URL="https://pmqvplyyxiobkllapgjp.supabase.co"
#   export SB_KEY="$SUPABASE_SERVICE_ROLE_KEY"
SB_URL = os.environ.get("SB_URL") or os.environ.get("SUPABASE_URL")
SB_KEY = os.environ.get("SB_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not SB_URL or not SB_KEY:
    raise SystemExit(
        "ERROR: faltan env vars SB_URL y SB_KEY (o SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."
    )
ROSARIO_AGENCY_ID = os.environ.get("ROSARIO_AGENCY_ID", "66563aeb-4e8b-40ee-a622-b39defb380dd")
TC = 1500.0  # Exchange rate ARS/USD
CSV_PATH = "/Users/tomiisanchezz/Downloads/Import Sistema - Rosario ARS (1).csv"

# Seller mapping: CSV name -> user ID
SELLER_MAP = {
    "santi": "84c54c89-e6c3-4bac-80ac-9e2186eb3aaf",       # Santiago Nader
    "ramiro": "eca8bd76-50af-46f2-9d20-148e620a8f23",       # Ramiro Airaldi
    "cande": "c9d53499-e9bc-4f11-97b6-1eaf3f049723",        # Candela Bertolotto
    "jose": "888c7097-512d-47f3-96e8-25074de4179d",          # Josefina Giordano
    "mica": "a7fb94f9-1ef6-4749-b6eb-ac17b7f08a05",          # Micaela Nader
    "emi roca": "0f843ee8-2890-48ee-a51b-6d3511b980cc",      # Emilia Roca
    "naza": "c6cc61f6-0954-4a26-b72b-40c1f0f5566f",          # Naza
    "yamil": "b9496cdb-7d18-473c-b9d8-2dafcc7e7912",         # Yamil Isnaldo
}

# Fallback seller (Santiago Nader - most ops)
FALLBACK_SELLER = "84c54c89-e6c3-4bac-80ac-9e2186eb3aaf"

DRY_RUN = "--dry-run" in sys.argv

# ============================================================
# HELPERS
# ============================================================
def sb_request(endpoint, method="GET", data=None, params=None):
    """Make a Supabase REST API request"""
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
    """Parse ARS amount like '$316,500.00' or ' $145,800.00' -> float"""
    if not amount_str or not amount_str.strip():
        return 0.0
    cleaned = amount_str.strip().replace("$", "").replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0

def ars_to_usd(ars_amount):
    """Convert ARS to USD at TC 1500, rounded to 2 decimals"""
    return round(ars_amount / TC, 2)

def parse_operation_date(dd_mm):
    """Parse DD/MM -> YYYY-MM-DD (month 01 = 2026, rest = 2025)"""
    if not dd_mm or not dd_mm.strip():
        return None
    parts = dd_mm.strip().split("/")
    if len(parts) != 2:
        return None
    day = int(parts[0])
    month = int(parts[1])
    year = 2026 if month == 1 else 2025
    return f"{year}-{month:02d}-{day:02d}"

def parse_full_date(date_str):
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
    """Split name into first_name and last_name"""
    if not full_name or not full_name.strip():
        return "Sin nombre", "-"
    parts = full_name.strip().split()
    if len(parts) == 1:
        return parts[0], "-"
    return parts[0], " ".join(parts[1:])

def find_seller(seller_name):
    """Map CSV seller name to user ID"""
    if not seller_name or not seller_name.strip():
        return FALLBACK_SELLER
    normalized = seller_name.strip().lower()
    # Exact match
    if normalized in SELLER_MAP:
        return SELLER_MAP[normalized]
    # Partial match
    for key, uid in SELLER_MAP.items():
        if key in normalized or normalized in key:
            return uid
    print(f"  ⚠️  Vendedor no encontrado: '{seller_name}' → usando fallback")
    return FALLBACK_SELLER

def generate_file_code():
    """Generate unique file code"""
    date_str = datetime.now().strftime("%Y%m%d")
    random_part = uuid.uuid4().hex[:6].upper()
    return f"OP-{date_str}-{random_part}"

# ============================================================
# MAIN IMPORT
# ============================================================
def main():
    print(f"{'🔍 DRY RUN' if DRY_RUN else '🚀 EJECUTANDO'} — Import Rosario ARS")
    print(f"📂 CSV: {CSV_PATH}")
    print(f"💱 TC: {TC}")
    print()

    # Read CSV
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        all_rows = list(reader)

    # Filter rows with data
    rows = [r for r in all_rows if r.get("Nombre del Cliente", "").strip()]
    print(f"📊 Filas totales: {len(all_rows)}, con datos: {len(rows)}")

    # Filter out totals row (check for unreasonably high amounts)
    filtered_rows = []
    for r in rows:
        # Skip rows that look like totals (amount > $50M ARS)
        venta = clean_amount(r.get("Monto Venta", ""))
        if venta > 50_000_000:
            print(f"  ⚠️  Saltando fila de totales: Venta={venta}")
            continue
        filtered_rows.append(r)

    rows = filtered_rows
    print(f"📊 Filas a importar: {len(rows)}")
    print()

    # Load existing operators
    print("📋 Cargando operadores existentes...")
    operators = sb_request("operators", params={"select": "id,name"})
    operator_map = {}
    if operators:
        for op in operators:
            operator_map[op["name"].lower().strip()] = op["id"]
    print(f"   {len(operator_map)} operadores: {', '.join(operator_map.keys())}")

    # Load existing customers
    print("📋 Cargando clientes existentes...")
    customers = sb_request("customers", params={"select": "id,first_name,last_name", "limit": "1000"})
    customer_cache = {}
    if customers:
        for c in customers:
            key = f"{c['first_name'].lower().strip()}|{c['last_name'].lower().strip()}"
            customer_cache[key] = c["id"]
    print(f"   {len(customer_cache)} clientes en cache")
    print()

    # Counters
    stats = {
        "operations_created": 0,
        "customers_created": 0,
        "customers_reused": 0,
        "operators_linked": 0,
        "payments_created": 0,
        "errors": 0,
        "warnings": [],
    }

    for i, row in enumerate(rows):
        row_num = i + 1
        client_name = row.get("Nombre del Cliente", "").strip()
        destination = row.get("Destino", "").strip()
        seller_name = row.get("Nombre Vendedor", "").strip()

        print(f"[{row_num}/{len(rows)}] {client_name} → {destination} (vendedor: {seller_name})")

        # Parse dates
        operation_date = parse_operation_date(row.get("Fecha Operación", ""))
        departure_date = parse_full_date(row.get("Fecha Salida", ""))
        return_date = parse_full_date(row.get("Fecha Regreso", ""))

        if not operation_date:
            print(f"  ⚠️  Sin fecha operación, saltando")
            stats["errors"] += 1
            continue

        # Parse amounts (ARS -> USD)
        sale_ars = clean_amount(row.get("Monto Venta", ""))
        collected_ars = clean_amount(row.get("Monto Cobrado", ""))
        operator_cost_ars = clean_amount(row.get("Monto Operador", ""))
        paid_to_operator_ars = clean_amount(row.get("Pagado a Operador", ""))

        sale_usd = ars_to_usd(sale_ars)
        collected_usd = ars_to_usd(collected_ars)
        operator_cost_usd = ars_to_usd(operator_cost_ars)
        paid_to_operator_usd = ars_to_usd(paid_to_operator_ars)

        margin_usd = round(sale_usd - operator_cost_usd, 2)
        margin_pct = round((margin_usd / sale_usd * 100), 2) if sale_usd > 0 else 0

        # Find seller
        seller_id = find_seller(seller_name)

        # Find/create customer
        first_name, last_name = split_name(client_name)
        customer_key = f"{first_name.lower()}|{last_name.lower()}"

        if customer_key in customer_cache:
            customer_id = customer_cache[customer_key]
            stats["customers_reused"] += 1
        else:
            if DRY_RUN:
                customer_id = f"DRY-CUST-{row_num}"
                stats["customers_created"] += 1
            else:
                email = f"{first_name.lower().replace(' ', '')}@importado.com"
                cust_result = sb_request("customers", method="POST", data={
                    "first_name": first_name,
                    "last_name": last_name,
                    "email": email,
                    "phone": "-",
                })
                if cust_result and len(cust_result) > 0:
                    customer_id = cust_result[0]["id"]
                    customer_cache[customer_key] = customer_id
                    stats["customers_created"] += 1
                else:
                    print(f"  ❌ Error creando cliente {client_name}")
                    stats["errors"] += 1
                    continue

        # Find operator
        operator_name = row.get("Operador 1", "").strip()
        operator_id = operator_map.get(operator_name.lower(), None) if operator_name else None

        if operator_name and not operator_id:
            if not DRY_RUN:
                op_result = sb_request("operators", method="POST", data={"name": operator_name})
                if op_result and len(op_result) > 0:
                    operator_id = op_result[0]["id"]
                    operator_map[operator_name.lower()] = operator_id
            else:
                operator_id = f"DRY-OP-{operator_name}"

        # Create operation
        operation_data = {
            "agency_id": ROSARIO_AGENCY_ID,
            "seller_id": seller_id,
            "operator_id": operator_id,
            "type": "PACKAGE",
            "product_type": "PAQUETE",
            "destination": destination or "Sin destino",
            "operation_date": operation_date,
            "departure_date": departure_date or operation_date,
            "return_date": return_date,
            "adults": int(row.get("Adultos", "1") or "1"),
            "children": int(row.get("Niños", "0") or "0"),
            "infants": 0,
            "status": "CONFIRMED",
            "sale_amount_total": sale_usd,
            "sale_currency": "USD",
            "operator_cost": operator_cost_usd,
            "operator_cost_currency": "USD",
            "currency": "USD",
            "margin_amount": margin_usd,
            "margin_percentage": margin_pct,
            "file_code": generate_file_code(),
        }

        if DRY_RUN:
            operation_id = f"DRY-{row_num}"
            print(f"  [DRY] Op: venta=${sale_usd} costo=${operator_cost_usd} margen=${margin_usd} fecha={operation_date}")
            stats["operations_created"] += 1
        else:
            op_result = sb_request("operations", method="POST", data=operation_data)
            if op_result and len(op_result) > 0:
                operation_id = op_result[0]["id"]
                stats["operations_created"] += 1
            else:
                print(f"  ❌ Error creando operación")
                stats["errors"] += 1
                continue

        # Link operator to operation (operation_operators)
        if operator_id and not DRY_RUN:
            sb_request("operation_operators", method="POST", data={
                "operation_id": operation_id,
                "operator_id": operator_id,
                "cost": operator_cost_usd,
                "cost_currency": "USD",
            })
            stats["operators_linked"] += 1

        # Link customer to operation (operation_customers)
        if customer_id and not DRY_RUN:
            sb_request("operation_customers", method="POST", data={
                "operation_id": operation_id,
                "customer_id": customer_id,
                "role": "MAIN",
            })

        # Create payments (NO ledger_movement_id = no financial account impact)
        if not DRY_RUN:
            # Payment from customer (INCOME) - if collected > 0
            if collected_usd > 0:
                sb_request("payments", method="POST", data={
                    "operation_id": operation_id,
                    "payer_type": "CUSTOMER",
                    "direction": "INCOME",
                    "method": "TRANSFER",
                    "amount": collected_usd,
                    "currency": "USD",
                    "date_due": operation_date,
                    "date_paid": operation_date,
                    "status": "PAID",
                    "reference": "Import Rosario ARS",
                })
                stats["payments_created"] += 1

            # Payment to operator (EXPENSE) - if paid > 0
            if paid_to_operator_usd > 0:
                sb_request("payments", method="POST", data={
                    "operation_id": operation_id,
                    "payer_type": "OPERATOR",
                    "direction": "EXPENSE",
                    "method": "TRANSFER",
                    "amount": paid_to_operator_usd,
                    "currency": "USD",
                    "date_due": operation_date,
                    "date_paid": operation_date,
                    "status": "PAID",
                    "reference": "Import Rosario ARS",
                })
                stats["payments_created"] += 1

        if DRY_RUN:
            if collected_usd > 0:
                stats["payments_created"] += 1
            if paid_to_operator_usd > 0:
                stats["payments_created"] += 1

    # Summary
    print()
    print("=" * 60)
    print(f"{'🔍 DRY RUN COMPLETADO' if DRY_RUN else '✅ IMPORT COMPLETADO'}")
    print(f"  Operaciones creadas: {stats['operations_created']}")
    print(f"  Clientes creados: {stats['customers_created']}")
    print(f"  Clientes reutilizados: {stats['customers_reused']}")
    print(f"  Operadores vinculados: {stats['operators_linked']}")
    print(f"  Pagos creados: {stats['payments_created']}")
    print(f"  Errores: {stats['errors']}")
    if stats["warnings"]:
        print(f"  Warnings:")
        for w in stats["warnings"]:
            print(f"    - {w}")
    print("=" * 60)

if __name__ == "__main__":
    main()
