# SP-6 — Facturas de Compra (Operadores)

**Fecha**: 2026-04-25
**Status**: Spec
**Sprint anterior**: SP-2 Ganancia Facturación (2026-04-24)
**Sprint siguiente**: SP-3 Libro IVA Digital (consume datos de este módulo)

## Objetivo

Construir el módulo de carga de **facturas recibidas de operadores** (mayoristas, aerolíneas, hotelería, etc.) con datos AFIP completos, asignación N:M a operaciones y asiento contable automático. El output alimenta el sprint siguiente (SP-3 Libro IVA Digital — sección Compras del REGINFO).

Hoy `iva_purchases` se autocrea por operación con solo `operator_cost_total` + IVA calculado. No tiene tipo de comprobante, CUIT, punto de venta ni percepciones — datos imprescindibles para AFIP.

## Decisiones de diseño (brainstorming 2026-04-25)

1. **Cardinalidad N:M** factura ↔ operación (una factura mayorista puede cubrir varias operaciones; una operación puede tener múltiples facturas de proveedores distintos).
2. **Solo Percepción IVA sufrida** (RG 2408 / RG 5329) en v1. IIBB y retenciones aplicadas por Lozada quedan fuera de scope. Estructura `purchase_invoice_perceptions` queda lista para SP-6.5.
3. **Entry point híbrido**: módulo dedicado en `/accounting/purchase-invoices` + atajo en tab Facturación de la operación.
4. **OCR opcional** con OpenAI Vision (ya hay infra en `/api/documents/parse`).
5. **Factura y pago separados**: cargar factura no crea pago. Vinculación con `operator_payments` se hace al pagar (FK nullable).
6. **Split prorateado por `operator_cost_total`** de cada operación, editable por Maxi.

## Modelo de datos

### Tablas nuevas

#### `purchase_invoices` — header AFIP

```sql
CREATE TABLE purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id),
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,

  -- Datos AFIP
  invoice_type TEXT NOT NULL CHECK (invoice_type IN ('A', 'B', 'C', 'M', 'OTHER')),
  cuit_emitter TEXT NOT NULL,           -- snapshot del CUIT del operador al momento de carga
  point_of_sale TEXT NOT NULL,          -- 4 dígitos (zero-padded)
  invoice_number TEXT NOT NULL,         -- 8 dígitos (zero-padded)
  issue_date DATE NOT NULL,
  due_date DATE,

  -- Moneda
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  exchange_rate NUMERIC(18,6),          -- requerido si currency='USD'

  -- Importes en moneda original
  net_amount_21 NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_amount_105 NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_amount_exempt NUMERIC(18,2) NOT NULL DEFAULT 0,
  iva_amount_21 NUMERIC(18,2) NOT NULL DEFAULT 0,
  iva_amount_105 NUMERIC(18,2) NOT NULL DEFAULT 0,
  perception_iva NUMERIC(18,2) NOT NULL DEFAULT 0,
  other_taxes NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(18,2) NOT NULL,

  -- Importes ARS (calculados en backend al confirmar)
  total_amount_ars NUMERIC(18,2) NOT NULL,
  iva_amount_ars NUMERIC(18,2) NOT NULL,    -- iva_21 + iva_105 convertido
  perception_iva_ars NUMERIC(18,2) NOT NULL,

  -- Estado
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED')),

  -- Integraciones
  journal_entry_id UUID REFERENCES journal_entries(id),
  pdf_storage_path TEXT,                -- supabase storage path
  ocr_metadata JSONB,                   -- { confidence, raw_text, fields_extracted }

  -- Auditoría
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,

  -- Constraint: total = sum de todos los componentes (con tolerancia $0.01 por redondeo)
  CONSTRAINT purchase_invoices_total_check CHECK (
    ABS(total_amount - (
      net_amount_21 + net_amount_105 + net_amount_exempt
      + iva_amount_21 + iva_amount_105
      + perception_iva + other_taxes
    )) < 0.01
  ),

  -- Constraint: USD requiere exchange_rate
  CONSTRAINT purchase_invoices_fx_required CHECK (
    currency = 'ARS' OR exchange_rate IS NOT NULL
  ),

  -- Único por org + emisor + pto + nro (no duplicar)
  CONSTRAINT purchase_invoices_unique UNIQUE (org_id, cuit_emitter, point_of_sale, invoice_number)
);

CREATE INDEX idx_purchase_invoices_org_date ON purchase_invoices(org_id, issue_date DESC);
CREATE INDEX idx_purchase_invoices_operator ON purchase_invoices(operator_id);
CREATE INDEX idx_purchase_invoices_status ON purchase_invoices(org_id, status);
```

#### `purchase_invoice_operations` — split N:M

```sql
CREATE TABLE purchase_invoice_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE RESTRICT,

  amount_original NUMERIC(18,2) NOT NULL,    -- porción asignada en moneda factura
  amount_ars NUMERIC(18,2) NOT NULL,         -- calculado con exchange_rate del header

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT pio_unique UNIQUE (purchase_invoice_id, operation_id),
  CONSTRAINT pio_amount_positive CHECK (amount_original > 0)
);

CREATE INDEX idx_pio_invoice ON purchase_invoice_operations(purchase_invoice_id);
CREATE INDEX idx_pio_operation ON purchase_invoice_operations(operation_id);
```

**Validación de suma**: trigger `BEFORE INSERT/UPDATE/DELETE` que valida `SUM(amount_original) ≈ purchase_invoices.total_amount` (tolerancia $0.01) **solo cuando `purchase_invoices.status = 'CONFIRMED'`**. En DRAFT puede estar incompleto.

#### `purchase_invoice_perceptions` — detalle de percepciones (futuro-proof)

```sql
CREATE TABLE purchase_invoice_perceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,

  perception_type TEXT NOT NULL CHECK (perception_type IN (
    'IVA_RG_2408',
    'IVA_RG_5329',
    'IIBB_CABA', 'IIBB_BSAS', 'IIBB_CORDOBA', 'IIBB_OTHER'  -- v1 no usa, queda para SP-6.5
  )),
  amount NUMERIC(18,2) NOT NULL,
  jurisdiction TEXT,    -- nullable, solo IIBB

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pip_invoice ON purchase_invoice_perceptions(purchase_invoice_id);
```

En v1 solo se inserta `perception_type IN ('IVA_RG_2408', 'IVA_RG_5329')`. La columna `purchase_invoices.perception_iva` es la suma cacheada de todas las percepciones IVA — el form expone una sola, pero el backend permite cargar las dos por separado vía API si el operador discriminó.

### Tabla modificada

```sql
ALTER TABLE operator_payments
  ADD COLUMN purchase_invoice_id UUID NULL REFERENCES purchase_invoices(id);

CREATE INDEX idx_operator_payments_purchase_invoice ON operator_payments(purchase_invoice_id);
```

Backward compatible: pagos existentes y nuevos siguen funcionando sin invoice. Solo cuando Maxi pague una factura cargada, la linkea explícitamente.

### RLS — patrón estándar SaaS

```sql
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoice_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoice_perceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_invoices_tenant_isolation ON purchase_invoices
  FOR ALL TO authenticated
  USING (
    org_id IN (SELECT user_org_ids())
    OR EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.auth_id = auth.uid()
      WHERE pa.user_id = u.id
    )
  )
  WITH CHECK (
    org_id IN (SELECT user_org_ids())
  );
```

Las tablas hijas (`purchase_invoice_operations`, `purchase_invoice_perceptions`) usan el mismo patrón vía JOIN con `purchase_invoices.org_id`.

## API endpoints

```
GET    /api/purchase-invoices                              # listado con filtros
POST   /api/purchase-invoices                              # crear (DRAFT o CONFIRMED)
GET    /api/purchase-invoices/[id]                         # detalle + operations + perceptions
PATCH  /api/purchase-invoices/[id]                         # editar (solo DRAFT)
POST   /api/purchase-invoices/[id]/confirm                 # DRAFT → CONFIRMED + crea asiento
POST   /api/purchase-invoices/[id]/cancel                  # CONFIRMED → CANCELLED + contra-asiento
POST   /api/purchase-invoices/[id]/operations              # asignar/reasignar split
POST   /api/purchase-invoices/ocr                          # subir PDF → DRAFT con campos OCR
GET    /api/operators/[id]/purchase-invoices               # facturas del operador (para "linkear existente")
GET    /api/operations/[id]/purchase-invoices              # facturas asignadas a la operación
```

Todos los endpoints usan `getCurrentUser()` + `canPerformAction(role, 'accounting', 'write')` para mutaciones. SELLER no debería tener acceso (escalar permission matrix).

## Flujo de UI

### Módulo dedicado: `/accounting/purchase-invoices`

```
┌─────────────────────────────────────────────────────────────────┐
│ Facturas Recibidas                                              │
│ [+ Nueva factura]  [+ Nueva con OCR PDF]                        │
│ [Filtros: estado | operador | mes | alícuota | con/sin pago]    │
├─────────────────────────────────────────────────────────────────┤
│ Fecha │ Operador │ Tipo │ Pto-Nro    │ Total      │ Estado      │
│ 24/04 │ Ola Vir. │  A   │ 0001-00045 │ $250.000   │ CONFIRMED   │
│ 23/04 │ Julia    │  A   │ 0003-00012 │ USD 1.500  │ DRAFT (OCR) │
└─────────────────────────────────────────────────────────────────┘
```

### Form de carga (page única, 3 secciones)

**Sección 1: Cabecera AFIP**
- Operador (autocomplete de tabla operators, snapshot CUIT al seleccionar)
- Tipo (A/B/C/M/Otro)
- Punto de venta + Nro
- Fecha emisión, vto
- Currency + Exchange rate (auto-fill BCRA del día si USD)
- Importes por alícuota:
  - Neto 21% / IVA 21%
  - Neto 10.5% / IVA 10.5%
  - Neto exento
  - Percepción IVA
  - Otros impuestos
  - **Total** (auto-calculado, banner rojo si no cuadra)

**Sección 2: Asignación a operaciones**
- Multi-select de operaciones del operador seleccionado (filtra `operations` con `operation_operators.operator_id = X`).
- Tabla editable:
  ```
  ☑ OP-123 - Cliente X - cost orig USD 800   → assign USD 920 [editable]
  ☑ OP-124 - Cliente Y - cost orig USD 500   → assign USD 580 [editable]
                                       Total: USD 1.500 ✓
  ```
- **Auto-prorateo on selection**: pesos = `operations.operator_cost_total` filtrado por operador. Diferencia de redondeo va a la primera operación.
- Live validation: si `sum(assigned) ≠ total`, banner rojo, no deja confirmar.

**Sección 3: Preview asiento contable**
- Read-only, calculado backend.
- Botones: `[Guardar borrador]` (status=DRAFT) y `[Confirmar y generar asiento]` (status=CONFIRMED).

### Atajo desde operación

En `/operations/[id]` tab "Facturación", agregar bloque arriba de "Facturas Emitidas":

```
Facturas de Compra recibidas
[+ Nueva factura del operador]   [Linkear factura existente]
- 24/04 Ola Virtual | A 0001-00045 | $150.000 (asignado a esta op) [ver]
```

- "Nueva factura": abre `/accounting/purchase-invoices/new?operator_id=X&operation_id=Y` con los IDs preseleccionados.
- "Linkear factura existente": dialog que lista facturas CONFIRMED del mismo operador no-100%-asignadas. Permite agregar split.

### Flujo OCR

1. Click "Nueva con OCR PDF" → dialog file upload.
2. Upload PDF a `purchase-invoices/<org_id>/<temp_id>.pdf` en Supabase Storage.
3. POST `/api/purchase-invoices/ocr` con storage path.
4. Backend llama OpenAI Vision con prompt específico de factura A AFIP (ver "OCR" sección).
5. Crea `purchase_invoices` con status=DRAFT + campos extraídos + `ocr_metadata`.
6. Redirige al form pre-llenado con banner amarillo "Datos extraídos por OCR — verificá antes de confirmar".

## Integraciones

### OCR — `/api/purchase-invoices/ocr`

- **Stack**: reusa wrapper de OpenAI Vision existente (`lib/ai/openai-vision.ts` o equivalente del módulo OCR de pasaportes).
- **Prompt**: "Extraé los siguientes campos de esta factura argentina tipo A: tipo de comprobante, CUIT del emisor, punto de venta (4 dígitos), número (8 dígitos), fecha de emisión, neto gravado al 21%, IVA al 21%, neto gravado al 10.5%, IVA al 10.5%, neto exento, percepción IVA, otros impuestos, total. Devolvé JSON con esos campos exactos. Si un campo no aparece, ponelo en 0."
- **Output schema**: zod-validado, con `confidence` numérica por campo.
- **Costo**: GPT-4o vision ~$0.01/factura. ~50 facturas/mes → $0.50/mes (negligible).
- **Fallback**: si falla o confidence promedio < 0.7, no se guarda DRAFT — se devuelve error y el form se abre vacío con banner "OCR no pudo leer la factura, completá manualmente".

### Asiento contable — `lib/accounting/journal-entries.ts`

Al confirmar (DRAFT → CONFIRMED), `createJournalEntry()` con:

```ts
{
  org_id,
  entry_date: invoice.issue_date,
  description: `Factura compra ${type} ${ptoNro} de ${operator.name}`,
  source_type: 'purchase_invoice',
  source_id: invoice.id,
  movements: [
    // Débitos: gasto/costo + IVA crédito + percepción
    { account_code: ACCOUNT_CODES.COSTO_OPERADORES, debit: net_total_ars }, // 4.2.01
    { account_code: ACCOUNT_CODES.IVA_CREDITO,      debit: iva_amount_ars }, // 1.1.07
    { account_code: ACCOUNT_CODES.PERCEPCIONES_AFIP, debit: perception_iva_ars }, // 2.1.04 (a recuperar)
    // Crédito: cuentas a pagar al operador
    { account_code: ACCOUNT_CODES.CUENTAS_POR_PAGAR, credit: total_amount_ars, counterparty_id: operator_id } // 2.1.01
  ]
}
```

Donde `net_total_ars = (net_amount_21 + net_amount_105 + net_amount_exempt) * exchange_rate`.

**Nota sobre `PERCEPCIONES_AFIP` (2.1.04)**: hoy está catalogado como **PASIVO** en `account-codes.ts` ("Percepciones a depositar"). Las percepciones **sufridas** son técnicamente un **activo a recuperar** (saldo a favor). Para v1 las imputamos a `2.1.04` con `debit` (compensa contra el saldo natural haber del pasivo, generando saldo deudor neto). Si Gabi (la contadora) prefiere una cuenta separada (ej. `1.1.08 OTROS_CREDITOS` o un código nuevo `1.1.09 PERCEPCIONES_SUFRIDAS`), se ajusta antes del confirm con un seed de cuenta nueva. **Decisión a confirmar con Gabi en review pre-deploy**.

**Anulación**: `POST /confirm/cancel` crea asiento contrario (debit↔credit invertidos) referenciando `parent_journal_entry_id`. Las dos rows quedan en histórico.

### Vinculación con `operator_payments`

- Solo se agrega columna FK `purchase_invoice_id`. No se cambia el flow de pago.
- En la UI de pago al operador (existente), se agrega un select opcional "Factura asociada" con dropdown de facturas CONFIRMED no-pagadas del operador.
- Una factura puede tener múltiples pagos (parciales). El cálculo de "saldo pendiente" se hace via SUM(operator_payments.amount) WHERE purchase_invoice_id = X.

## Edge cases

| Caso | Manejo |
|------|--------|
| OCR low confidence (<0.7 promedio) | No se guarda DRAFT, error → form vacío |
| Factura duplicada (CUIT+pto+nro+org) | UNIQUE constraint, error 409 con link a la factura existente |
| Operador sin CUIT en DB | Form bloquea confirmación, link a `/operators/[id]/edit` |
| USD sin exchange_rate | Required field, sugerencia BCRA del día via cache existente (`lib/accounting/bcra-exchange-rates.ts`) |
| Anular factura confirmada | status=CANCELLED + crea contra-asiento. NO se borra |
| Edit factura DRAFT | Libre (campos + split) |
| Edit factura CONFIRMED | Bloqueada. Solo "Anular y crear nueva" |
| Total no cuadra con suma campos | Backend rechaza con 400 explícito (`{ field: 'total', expected, actual }`) |
| Split N:M no cuadra con total | Backend rechaza confirmación con 400 (`{ assigned_sum, total }`). DRAFT permite incompleto |
| Operador no existe | Form ofrece "Crear nuevo operador" inline (modal) antes de continuar |
| PDF subido > 10MB | Rechazo upfront, mensaje claro |

## Multi-tenant

- Todas las tablas tienen `org_id` y RLS pattern del SaaS.
- `operator_payments.purchase_invoice_id` no necesita org_id propio: hereda via JOIN al confirmar.
- Tests de aislamiento en `__tests__/isolation/purchase-invoices.test.ts`: org A no ve facturas de org B (mismo patrón que `tenant-segregation.test.ts`).

## Permisos

Agregar al `lib/permissions.ts` matrix:

```
'accounting.purchase-invoices': {
  SUPER_ADMIN: ['read', 'write', 'confirm', 'cancel'],
  ADMIN:       ['read', 'write', 'confirm', 'cancel'],
  CONTABLE:    ['read', 'write', 'confirm', 'cancel'],
  SELLER:      [], // sin acceso
  VIEWER:      ['read'],
}
```

## Testing

### Unit tests
- `lib/accounting/__tests__/purchase-invoices.test.ts`:
  - Cálculo prorateo por `operator_cost_total` (incluyendo edge case: 1 sola operación, redondeo a primera operación).
  - Validación total = sum de campos (con tolerancia $0.01).
  - Conversión FX para currency=USD.
  - Generación de asiento (mocking `createJournalEntry`).
- `lib/ai/__tests__/purchase-invoice-ocr.test.ts`:
  - Mock OpenAI Vision response, validar shape del output.
  - Caso confidence baja → throw error.

### Integration tests (API)
- POST factura DRAFT → GET → assert campos.
- POST factura DRAFT → POST /confirm → assert journal_entry creado + status CONFIRMED.
- POST /confirm con split que no cuadra → 400.
- POST factura duplicada (mismo CUIT+pto+nro) → 409.
- POST /cancel factura CONFIRMED → contra-asiento + status CANCELLED.

### Tenant isolation tests
- `__tests__/isolation/purchase-invoices.test.ts`: setUp 2 orgs, sesión org A no ve invoices de org B (lectura, escritura, listing).

### Smoke E2E manual (al merge)
Checklist en `docs/superpowers/plans/2026-04-25-purchase-invoices-e2e.md` — se escribe junto al plan de implementación.

## Convivencia con `iva_purchases` legacy

`iva_purchases` se mantiene **sin cambios**. Sigue auto-creándose por operación al guardar la op (campo automático cost = `operator_cost_total`). Sirve como **fallback** para operaciones sin factura cargada.

**Source-of-truth para SP-3 (Libro IVA)**:
- Si la operación tiene uno o más `purchase_invoice_operations` con `purchase_invoice.status = CONFIRMED` → se usa la data del invoice (real AFIP).
- Si no → fallback a `iva_purchases` (data calculada).

La función `getMonthlyIVAToPay()` en `lib/accounting/iva.ts` se ajusta en SP-3 para preferir la nueva tabla cuando exista. En SP-6 v1 **no se modifica**, sigue usando `iva_purchases` como hoy.

**No se hace backfill** de `purchase_invoices` desde `iva_purchases` (no tenemos los datos AFIP reales). Los meses anteriores quedan como están (data legacy).

## Out of scope explícito (v1)

- **Percepciones IIBB** (estructura ya en `purchase_invoice_perceptions`, falta UI+TXT). → SP-6.5
- **Retenciones aplicadas por Lozada** (Ganancias/IVA/IIBB como agente de retención). → SP-6.5 si aplica
- **Importaciones** (`REGINFO_CV_COMPRAS_IMPORTACIONES`). → futuro
- **Notas de crédito de operador** (tipo NC). → futuro
- **Generación TXT del Libro IVA**. → SP-3 (sprint siguiente)
- **OCR de tipos B, C, M** — v1 solo entrenado para tipo A (las más comunes y estandarizadas). Tipos B/C/M se cargan manualmente.
- **Multi-PDF batch upload**. → futuro

## Plan de migración / rollout

1. Migración 163 (`20260425120000_purchase_invoices.sql`): crea las 3 tablas + RLS + indices + alter `operator_payments` + bucket Storage.
2. Tipos regenerados con `npm run db:generate`.
3. Permission matrix updated en `lib/permissions.ts`.
4. APIs + UI en feature flag opcional (`ENABLE_PURCHASE_INVOICES`) para que no rompa Maxi mientras se prueba en LOLO test org.
5. Validación con Gabi (contadora) sobre el código de cuenta para percepción sufrida (ver nota arriba).
6. Smoke E2E con factura A real de un operador chico (riesgo bajo).
7. Anuncio a Maxi + screencast.

## Métricas de éxito

- Maxi carga **>= 80% de las facturas recibidas del mes** dentro de los primeros 30 días post-launch.
- Tiempo promedio de carga manual < 2 min/factura, OCR < 30 seg/factura.
- Cero pérdidas de cuadre (asiento contable cuadra al confirmar).
- Aislamiento entre orgs verificado (test isolation passing).

## Dependencias

- `lib/accounting/journal-entries.ts` (existente, reforma contable de abril)
- `lib/accounting/account-codes.ts` (existente)
- `lib/accounting/bcra-exchange-rates.ts` (existente)
- `lib/ai/openai-vision.ts` (existente, OCR pasaportes)
- `lib/supabase/server.ts` + `lib/auth.ts` + `lib/permissions.ts` (existentes)
- Storage bucket dedicado `purchase-invoices` (creado en la migration con RLS por `org_id` en path)

## Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| OCR mal extrae percepciones (campo no estándar) | Marcar percepción como override manual default si confidence < 0.8 |
| Asiento contable mal mapeado de percepción sufrida | Pre-deploy validation con Gabi contadora |
| Maxi carga facturas DRAFT sin nunca confirmar (data fantasma) | Filtro default oculta DRAFTs viejos. Cron warning si DRAFT > 30 días sin tocar |
| Operador con CUIT mal cargado en DB legacy | Form sugiere actualizar antes de confirmar. Log audit |
| Volumen alto OCR → costo OpenAI sube | Monitor mensual. Si > 1000 facturas/mes → considerar Tesseract local |

---

**Próximo paso**: writing-plans skill → plan de implementación con TDD checkpoints.
