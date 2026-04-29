# Ganancia Facturación — Design (SP-2)

**Status:** draft awaiting user review
**Author:** Claude (sesión 2026-04-24, brainstorming skill)
**Scope:** SP-2 del programa AFIP. Construye encima de SP-1a (Hardening) y SP-1c (PDF Downloads) ya deployed.

---

## 1. Contexto y objetivo

Hoy el flow de facturación desde una operación (`/operations/billing/new?operationId=X`) pre-carga **venta + costo de operador como dos items separados con signo positivo**, lo cual no tiene sentido contable: factura sale+cost ≠ factura del servicio prestado. El usuario de MAXEVA (agencia de viajes) tiene que editar manualmente los items para dejar solo el margen, cambiar descripción, IVA, etc.

**El problema real:** una agencia de viajes no factura el viaje (eso lo factura el operador/hotel/aerolinea). La agencia factura su **comisión por intermediación turística** = el margen entre venta y costo. Y necesita:

- Ver claramente cuánto queda por facturar de cada operación
- Poder facturar el margen completo **o una parte** (split en anticipo + saldo, o facturar solo una porción ahora)
- Tener trazabilidad: qué facturas salieron de qué operación, con qué CAE, por qué monto

El objetivo de SP-2 es **reemplazar el flow confuso actual con un "Facturar ganancia" directo y seguro** que:

- Precarga UN solo item con el margen restante
- Caps el monto a facturar por el restante (no se puede sobre-facturar)
- Muestra historial claro en el detalle de operación
- Usa toda la infra de SP-1a (verification + RLS) + SP-1c (QR AFIP + PDF)

## 2. Success criteria

Cuando esta fase esté deployada:

1. **El detalle de operación muestra un box "Facturación de ganancia"** con margen total, ya facturado, restante y lista de facturas asociadas.
2. **Botón "Facturar ganancia"** redirige a un form pre-cargado con 1 item "Comisión por intermediación turística" con precio = restante, editable pero con tope.
3. **El backend rechaza** cualquier factura con `operation_id` cuyo `imp_total` haría que la suma facturada exceda el margen de la operación. Error 400 con mensaje claro del max permitido.
4. **Sum de invoices autorizadas de una operación ≤ margen total** como invariante enforced en backend (race conditions protegidas vía idempotency + recheck al autorizar).
5. **Cross-tenant blindado**: un user no puede facturar una operación que pertenece a otro org. La RLS ya lo cubre; verify explícito en endpoint.
6. **Cero schema changes** — reusa `invoices.operation_id` + `operations.margin_amount` existentes.
7. **El flow viejo (2 items: venta + costo) queda eliminado** para `?operationId=X`. Facturas libres (sin operación) siguen siendo posibles desde `/new` sin query param.

## 3. Non-goals

- **Facturar múltiples operaciones en una factura** (M:N junction table `invoice_operations`) → future si aparece el caso real. Por ahora 1 invoice = 0 or 1 operación.
- **Auto-facturación en batch** ("facturá todas las operaciones pendientes del mes") → future.
- **Facturas de anticipo / seña con lógica separada** → out of scope. Si el usuario quiere facturar "50% anticipo", lo hace ingresando 50% del margen manualmente.
- **Nota de crédito automática si se modifica el margen después de facturar** → future. Si el costo cambia post-factura, el user abre NC manual.
- **Comisiones del vendedor del sistema** (commission_records) → no relacionado. SP-2 es solo facturación AFIP.
- **Ajustes por FX cuando venta/costo son en monedas distintas** → ya lo maneja `operation.margin_amount` que se calcula en ARS. No tocamos ese cálculo.
- **Notificación al cliente por email/WhatsApp** cuando se factura → future.

## 4. Arquitectura

### 4.1 Componentes

```
┌─────────────────────────────────────────────────────────┐
│  UI: detalle de operación                                │
│  components/operations/operation-facturacion-section.tsx │
│  (nuevo componente)                                      │
│  - Muestra stats margen + lista facturas                 │
│  - Botón "Facturar ganancia" → router.push              │
└──────────────────┬──────────────────────────────────────┘
                   │ GET
                   ▼
┌─────────────────────────────────────────────────────────┐
│  API: /api/operations/[id]/margin-summary (NUEVO)        │
│  - Calcula margin_total, already_invoiced, remaining     │
│  - Lista invoices con operation_id=X                     │
│  - RLS automático                                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  UI: /operations/billing/new?operationId=X&mode=margin   │
│  (REFACTOR existing page)                                │
│  - Si mode=margin: 1 item pre-cargado con margen remain  │
│  - Input precio editable, max = remaining                │
│  - Eliminamos la precarga de 2 items (venta+costo)       │
└──────────────────┬──────────────────────────────────────┘
                   │ POST
                   ▼
┌─────────────────────────────────────────────────────────┐
│  API: /api/invoices POST (REFACTOR)                      │
│  - Validación: si operation_id present                   │
│    → fetch operation, check org_id match                 │
│    → sum(authorized invoices) + new <= margin            │
│    → si excede: 400 con suggested_max                    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  lib/accounting/margin-summary.ts (NUEVO)                │
│  - calculateMarginSummary(op, invoices): pure function   │
│  - Testeable sin DB                                      │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Modelo de datos — sin cambios

Usamos lo que ya existe:
- `operations.margin_amount` — calculado al crear/update operación (existe desde 001_initial_schema)
- `operations.org_id` — para cross-tenant check (del SaaS conversion)
- `invoices.operation_id` — FK existing (nullable, ON DELETE SET NULL)
- `invoices.imp_total` — monto facturado
- `invoices.status` — `authorized` es el que cuenta para "ya facturado"

**No migration SQL.** Solo código.

### 4.3 Contrato del nuevo endpoint

```
GET /api/operations/:id/margin-summary

200 OK:
{
  "operation": {
    "id": "uuid",
    "file_code": "OP-001",
    "destination": "Cancún",
    "sale_amount_total": 200000,
    "operator_cost": 180000,
    "margin_amount": 20000,
    "customer": { "id": "...", "name": "Juan Pérez" } | null,
    "has_afip_emisor": true
  },
  "summary": {
    "margin_total": 20000,
    "already_invoiced": 15000,
    "remaining": 5000,
    "can_invoice": true,
    "reason_disabled": null
  },
  "invoices": [
    {
      "id": "uuid",
      "cbte_nro": 42,
      "pto_vta": 5,
      "cbte_tipo": 6,
      "imp_total": 15000,
      "fecha_emision": "2026-03-28",
      "status": "authorized",
      "verification_status": "verified",
      "cae": "86139389743826"
    }
  ]
}

404: operation no encontrada (RLS-scoped)
403: sin permiso
```

`can_invoice: false` con `reason_disabled: "no_margin" | "no_customer" | "no_afip" | "already_fully_invoiced"` — la UI lo usa para deshabilitar el botón con tooltip explicativo.

### 4.4 UI del box en detalle de operación

```
╔═══════════════════════════════════════════════════╗
║  💰 FACTURACIÓN DE GANANCIA                       ║
║                                                    ║
║  Margen total:        $20.000 ARS                 ║
║  Ya facturado:        $15.000 (75%)               ║
║  ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░ (barra progreso)             ║
║  Restante:             $5.000                     ║
║                                                    ║
║  ┌──────────────────────────┐                     ║
║  │ + Facturar ganancia →    │                     ║
║  └──────────────────────────┘                     ║
║                                                    ║
║  Facturas emitidas:                               ║
║  ┌──────────────────────────────────────────────┐ ║
║  │ B 0005-00000042 • $15.000 • 28/03 • ✓ Verif │ ║
║  └──────────────────────────────────────────────┘ ║
╚═══════════════════════════════════════════════════╝
```

- Si `remaining === 0`: botón disabled, label "Ya facturada completa", color verde
- Si `can_invoice === false && reason === "no_customer"`: botón disabled, tooltip "Asigná un cliente primero"
- Si `can_invoice === false && reason === "no_afip"`: botón disabled, tooltip "Configurá AFIP en Integraciones"
- Si `margin_amount < 0` (pérdida): box oculto o mensaje "Operación con pérdida — no hay margen a facturar"

### 4.5 Form refactor (`mode=margin`)

Cambios en `app/(dashboard)/operations/billing/new/page.tsx`:

**Cuando `operationId` está presente**, siempre usar el flow margen (opción B aprobada). Eliminar la precarga de venta+costo (2 items separados).

```typescript
// En handleOperationChange (o equivalente post-fetch)
if (operationId) {
  // Llamar /api/operations/[id]/margin-summary
  const summary = await fetch(`/api/operations/${operationId}/margin-summary`).then(r => r.json())

  if (!summary.summary.can_invoice) {
    // Redirigir con toast explicativo
    router.back()
    toast({ title: "No se puede facturar", description: "...", variant: "destructive" })
    return
  }

  // Precargar cliente
  if (summary.operation.customer) {
    await applyCustomerSelection(summary.operation.customer)
  }

  // Precargar UN solo item con margen restante
  const descripcion = `Comisión por intermediación turística - ${summary.operation.destination} (${summary.operation.file_code})`
  setItems([
    {
      descripcion,
      cantidad: 1,
      precio_unitario: summary.summary.remaining,
      iva_porcentaje: 21,
      tax_treatment: "GRAVADO",
    }
  ])
}
```

**Validación client-side** al editar el precio: si `precio_unitario > summary.summary.remaining`, mostrar warning "Max $X restante" y forzar `min(remaining)` al submit (o bloquear el submit hasta que baje).

### 4.6 Backend validation en `/api/invoices` POST

Agregar check cuando `body.operation_id` presente:

```typescript
if (body.operation_id) {
  // 1. Fetch operation via RLS (si no pertenece al org, 404)
  const { data: op } = await supabase
    .from("operations")
    .select("id, org_id, margin_amount")
    .eq("id", body.operation_id)
    .single()

  if (!op) {
    return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
  }

  // 2. Cross-check org_id
  if (op.org_id !== agency.org_id) {
    return NextResponse.json({ error: "Operación no pertenece a tu organización" }, { status: 403 })
  }

  // 3. Sum existing authorized invoices
  const { data: existing } = await supabase
    .from("invoices")
    .select("imp_total")
    .eq("operation_id", body.operation_id)
    .eq("status", "authorized")

  const already = (existing ?? []).reduce((acc, i) => acc + Number(i.imp_total), 0)
  const remaining = Number(op.margin_amount) - already
  const newTotal = Number(calculatedInvoice.totals.imp_total)

  if (newTotal > remaining + 0.01) {
    return NextResponse.json(
      {
        error: `No se puede facturar $${newTotal}: el restante de la operación es $${remaining}`,
        max_remaining: remaining,
      },
      { status: 400 }
    )
  }
}
```

**Idempotency / race condition:** el check es en el POST del draft. Si dos requests concurrentes llegan, podría haber over-invoicing. Mitigación: **repetir el check en el endpoint `/authorize`** justo antes de llamar AFIP. Si ya se emitió algo mientras este draft estaba en pending, el authorize rechaza.

### 4.7 Pure function — margin summary

`lib/accounting/margin-summary.ts`:

```typescript
export interface MarginSummary {
  margin_total: number
  already_invoiced: number
  remaining: number
  can_invoice: boolean
  reason_disabled: "no_margin" | "no_customer" | "no_afip" | "already_fully_invoiced" | null
}

export function calculateMarginSummary(
  operation: { margin_amount: number; customer_id: string | null },
  invoices: Array<{ imp_total: number; status: string }>,
  hasAfipConfig: boolean
): MarginSummary {
  const margin = Number(operation.margin_amount)
  const already = invoices
    .filter(i => i.status === "authorized")
    .reduce((acc, i) => acc + Number(i.imp_total), 0)
  const remaining = Math.round((margin - already) * 100) / 100 // 2-decimal safe

  let reason: MarginSummary["reason_disabled"] = null
  if (margin <= 0) reason = "no_margin"
  else if (!operation.customer_id) reason = "no_customer"
  else if (!hasAfipConfig) reason = "no_afip"
  else if (remaining <= 0) reason = "already_fully_invoiced"

  return {
    margin_total: margin,
    already_invoiced: already,
    remaining: Math.max(0, remaining),
    can_invoice: reason === null,
    reason_disabled: reason,
  }
}
```

Pura, 100% testeable.

## 5. Testing

### 5.1 Unit — margin summary

`__tests__/accounting/margin-summary.test.ts`:
- 0 invoices → remaining = margin_total
- 1 authorized invoice por el total → remaining = 0 + reason `already_fully_invoiced`
- 2 authorized invoices parciales → remaining = margin - sum
- 1 authorized + 1 rejected → solo autorizada cuenta
- margin = 0 → can_invoice = false, reason `no_margin`
- margin negativa → can_invoice = false, reason `no_margin`, remaining = 0 (no negative)
- operation sin customer → reason `no_customer`
- hasAfipConfig = false → reason `no_afip`
- Float precision: margin=20000.00, invoice=19999.99 → remaining=0.01 (tolerado >0 = can_invoice si reason !== 'no_margin')

### 5.2 Unit — endpoint `/api/operations/[id]/margin-summary`

Mock supabase, verificar:
- 200 con summary correcto cuando op existe y user tiene acceso
- 404 cuando op no existe (RLS)
- Shape de response matchea spec §4.3

### 5.3 Integration — invoice POST validation

`__tests__/invoices/post-validation.test.ts`:
- POST sin `operation_id` → pasa (existing behavior, no validation)
- POST con `operation_id` + imp_total <= remaining → pasa
- POST con `operation_id` + imp_total > remaining → 400 con `max_remaining`
- POST con `operation_id` cross-tenant → 403
- Race condition simulada: dos POST concurrentes + authorize simultáneo → segundo authorize rechaza

### 5.4 E2E smoke manual

1. Abrir operación con margen $20.000 y cliente asignado
2. Ver box "Facturación de ganancia" con remaining=$20.000
3. Click "Facturar ganancia" → form con 1 item precargado $20.000
4. Cambiar a $5.000, submit → CAE
5. Back to operation → box muestra ya facturado=$5.000, remaining=$15.000, lista con 1 factura
6. Click "Facturar ganancia" de nuevo → precarga $15.000
7. Intentar subir a $50.000 → warning UI
8. Submit $15.000 → CAE
9. Box muestra "Ya facturada completa" ✓
10. Botón disabled

## 6. Riesgos y mitigaciones

| Riesgo | Prob | Mitigación |
|---|---|---|
| Race condition: 2 usuarios autorizan simultáneamente + exceden margen | Baja | Re-check en authorize endpoint antes de llamar AFIP + atomic update con lock no es feasible en Supabase — aceptamos riesgo bajo y usamos warning |
| Usuario cambia `margin_amount` de la operación después de facturar (renegoció costo) | Media | No bloqueamos — muestra warning en UI: "Margen ajustado desde $X a $Y, ya facturaste $Z". User decide NC manual si corresponde. |
| Float precision en comparaciones de dinero | Alta si no se cuida | `Math.round(x * 100) / 100` en el helper + tolerancia de 1ct en validación backend |
| Operaciones legacy sin `margin_amount` (NULL o 0) | Baja | `margin_amount` es NOT NULL desde `001_initial_schema`. Default 0. Si es 0, box dice "sin margen" |
| Operación sin cliente asignado | Media | Botón disabled con tooltip "Asigná un cliente primero" |
| El cambio a `mode=margin` rompe algún caller externo que esperaba el comportamiento viejo (2 items venta+costo) | Baja | Grep de callers — solo el detalle de operación + el sidebar linkean. Los 2 items viejos eran siempre manualmente editados antes de submit según memoria. Breaking acceptable |
| Factura C (monotributista) no tiene IVA discriminado — el "margen gravado 21%" no aplica | Media | El form respeta el tipo de factura del cliente. Si emisor monotributo, Factura C se emite sin IVA discriminado pero el concepto "comisión" se mantiene. El campo IVA se oculta automáticamente (ya existe la lógica en el form actual via `shouldHideInvoiceTaxBreakdown`) |

## 7. Open questions (resueltas tentativamente)

1. **¿Cap hard o soft en el amount?** Tentative: **hard** (backend 400 si excede + client-side warning). Razonable porque sobre-facturar el margen es un error contable serio.
2. **¿Botón "Facturar todo lo restante" y "Facturar parcial"?** Tentative: **no**, un solo botón con amount editable. YAGNI — el default siempre es "todo restante".
3. **¿Historial incluye facturas rejected o solo authorized?** Tentative: **todas**, pero las rejected/discrepancy se muestran en gris con badge. Authorized cuentan para el remaining.
4. **¿Notificar al vendedor cuando se factura su operación?** Out of scope.

## 8. Entregables concretos

### Archivos nuevos

- `lib/accounting/margin-summary.ts` — función pura `calculateMarginSummary`
- `app/api/operations/[id]/margin-summary/route.ts` — GET endpoint
- `components/operations/operation-facturacion-section.tsx` — box UI en detalle de operación
- `__tests__/accounting/margin-summary.test.ts` — unit tests (9 casos)
- `__tests__/operations/margin-summary-api.test.ts` — integration del endpoint
- `__tests__/invoices/post-operation-validation.test.ts` — tests de validación backend

### Archivos modificados

- `app/(dashboard)/operations/billing/new/page.tsx` — eliminar precarga de 2 items, reemplazar por llamada a margin-summary + 1 item único
- `app/api/invoices/route.ts` — agregar validación de operation_id + margin remaining al POST
- `components/operations/operation-detail-client.tsx` — montar `<OperationFacturacionSection />` en la sección apropiada del detalle (cerca de los datos financieros / accounting)

### No SQL migration

Cero schema changes.

## 9. Métricas post-deploy

- **% de facturas con `operation_id` NOT NULL** antes vs después — esperamos que el nuevo flow dé más linkage explícito
- **Facturas rejected por `max_remaining`** en logs — debería ser >0 ocasional (validación funciona) pero NO frecuente (si es frecuente, la UI client-side no está previniendo bien)
- **Operaciones con `remaining = 0 && margin > 0`** (fully invoiced) después de 30 días — target 70%+ del margen de operaciones cerradas

## 10. Próximo paso

Aprobación del user → `writing-plans` → subagent-driven execution (mismo patrón que SP-1a y SP-1c).
