# Sistema de autorizaciones de pagos

**Fecha**: 2026-04-27
**Bullet origen**: Reunión Gabi #14 — "Pagos pendientes para usuarios junior, Maxi y Santi como autorizadores, rangos por implementar"
**Status**: Spec aprobado por Tomi

## Problema

Los sellers junior cargan pagos en el ERP sin un control previo. Si meten un monto erróneo o registran un pago a un cliente equivocado, el ledger contable se ensucia inmediatamente y hay que des-contabilizar después (proceso engorroso, abierto a errores). Maxi y Santi (Lozada) quieren un workflow donde ciertos usuarios necesiten aprobación antes de que el pago impacte caja/ledger.

## Objetivo

Cada agencia configura **rangos de aprobación por rol**. Cuando un user crea un pago cuyo monto excede su rango, el pago queda en estado `PENDING_APPROVAL` (sin tocar caja/ledger). Un usuario con rango suficiente lo aprueba (recién ahí se contabiliza) o lo rechaza con motivo.

## No-objetivos

- No tocar `cash_movements`, `recurring_payments`, ni `purchase_invoices` en v1. Solo `payments` (pagos a clientes/operadores en operaciones) y `operator_payments` (pagos a operadores standalone).
- No implementar override por user específico — solo reglas por rol. Si Maxi quiere darle a un seller individual un límite especial, eso vendría en v2.
- No implementar workflows multi-paso (ej: 2 firmas para montos > X). Solo single-approver por ahora.
- No notificación push/email del approve/reject. Solo bell in-app.

## Arquitectura

```
SELLER junior crea payment $100k
  ↓
POST /api/payments
  ↓
Cargar agency.payment_approval_rules
  ↓
requiresApproval($100k_ARS, role='SELLER', rules) → true
  ↓
INSERT payment con approval_status = 'PENDING_APPROVAL', sin ledger, sin cash_movement
  ↓
Bell notification para users que canApprove($100k, ...)

────────── ADMIN entra a /payments/pending-approvals ──────────

ADMIN ve la lista, click "Aprobar" en uno
  ↓
POST /api/payments/[id]/approve
  ↓
Validar canApprove($100k_ARS, role='ADMIN', rules)
  ↓
UPDATE payment: approval_status='APPROVED', approved_by, approved_at
  ↓
Crear ledger_movement + cash_movement (mismo helper que el path normal)
  ↓
Bell notification al creador: "Tu pago fue aprobado"
```

### Componentes

#### 1. Schema A — columns en `payments` y `operator_payments`

```sql
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'NONE'
    CHECK (approval_status IN ('NONE','PENDING_APPROVAL','APPROVED','REJECTED')),
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_pending_approval
  ON payments (created_at DESC)
  WHERE approval_status = 'PENDING_APPROVAL';

-- mismo set para operator_payments
```

`approval_status` default `'NONE'` = backward compatible: pagos viejos no requieren aprobación.

#### 2. Schema B — `agency_settings.payment_approval_rules`

Tabla `agency_settings` ya existe (1 row por agency, columna `data JSONB`). En lugar de schema new column, agregamos una key específica.

Nuevo nested key dentro de `data`:

```json
{
  "payment_approval_rules": [
    {"role": "SELLER", "max_amount_ars": 0},
    {"role": "CONTABLE", "max_amount_ars": 500000},
    {"role": "ADMIN", "max_amount_ars": null}
  ]
}
```

Default para agencias existentes (Lozada incluida): si la key no existe → no rules → nadie necesita aprobación. Esto preserva el comportamiento actual sin migration de data.

#### 3. lib/payments/approval.ts (puro + TDD)

```typescript
type ApprovalRule = { role: string; max_amount_ars: number | null }

export function requiresApproval(
  amountArs: number,
  userRole: string,
  rules: ApprovalRule[],
): boolean {
  if (!rules || rules.length === 0) return false
  const rule = rules.find(r => r.role === userRole)
  if (!rule) return false  // role no listado = no requiere
  if (rule.max_amount_ars === null) return false  // ilimitado
  return amountArs > rule.max_amount_ars
}

export function canApprove(
  amountArs: number,
  approverRole: string,
  rules: ApprovalRule[],
): boolean {
  if (!rules || rules.length === 0) return true  // sin rules, todos pueden
  const rule = rules.find(r => r.role === approverRole)
  if (!rule) return true  // role no listado = ilimitado
  if (rule.max_amount_ars === null) return true  // ilimitado explícito
  return amountArs <= rule.max_amount_ars
}

export function convertToArs(
  amount: number,
  currency: "ARS" | "USD",
  arsPerUsd: number,
): number {
  return currency === "USD" ? amount * arsPerUsd : amount
}
```

#### 4. Modificar POST /api/payments/route.ts (insert flow)

Agregar al inicio de la creación, después de validar permisos:

```typescript
const rules = await loadApprovalRules(agencyId, supabase)
const fxRate = await getCurrentArsPerUsd(supabase)
const amountArs = convertToArs(amount, currency, fxRate)

if (requiresApproval(amountArs, user.role, rules)) {
  // INSERT con approval_status='PENDING_APPROVAL', SKIP ledger + cash_movement
  // Crear bell notification para approvers
  return NextResponse.json({ payment, requires_approval: true })
}

// Si no, flow normal (existente)
```

Mismo cambio en `POST /api/operator-payments/route.ts`.

#### 5. Endpoints approve / reject

```
POST /api/payments/[id]/approve        // body: {} 
POST /api/payments/[id]/reject         // body: { reason: string }
POST /api/operator-payments/[id]/approve
POST /api/operator-payments/[id]/reject
```

Cada uno:
1. Valida `canApprove(payment.amount_ars, user.role, rules)`. Si no → 403.
2. UPDATE payment: status, approved_by/at o rejection_reason.
3. Si approved → llamar el mismo helper que crea ledger_movement + cash_movement (refactor del POST original a una función reusable).
4. Bell notification al creador.
5. logSecurityEvent.

#### 6. UI — bandeja de aprobaciones

`app/(dashboard)/payments/pending-approvals/page.tsx`:
- Solo accesible a users que `canApprove(any_amount, user.role, rules)` para al menos una agencia.
- Lista pagos en estado PENDING_APPROVAL agrupados por agencia.
- Por row: monto, moneda, cliente/operador, creador, fecha, botones "Aprobar" / "Rechazar (con motivo)".
- Sidebar: link "Aprobaciones (N)" con badge del count, solo visible si user puede aprobar al menos algún tipo de pago.

#### 7. UI — settings de rules

`/settings/agencies/[id]` → tab "Aprobaciones de pagos":
- Tabla editable role × max_amount_ars.
- Roles disponibles: SELLER, CONTABLE, ADMIN, SUPER_ADMIN.
- Vacío = ilimitado.
- Botón "Guardar" → POST `/api/agencies/[id]/payment-approval-rules`.

#### 8. Bell notifications

Nuevo alert type:
```sql
ALTER TABLE alerts DROP CONSTRAINT alerts_type_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_type_check
  CHECK (type IN (..., 'PAYMENT_PENDING_APPROVAL', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED'));
```

- `PAYMENT_PENDING_APPROVAL` → para approvers cuando se crea uno
- `PAYMENT_APPROVED` / `PAYMENT_REJECTED` → para creator cuando se resuelve

## FX rate handling

Cuando el pago es USD y la regla está en ARS:
- `getCurrentArsPerUsd(supabase)` lee `monthly_exchange_rates` (tabla existente) o `exchange_rates`. Usar el último valor del mes actual.
- Si no hay tipo de cambio cargado → fallback a 1000 (impreciso, mejor que crashear) + log warning.

El amount_ars persistido **no** se guarda en la fila — se calcula al vuelo cada vez que se necesita comparar contra rules. Esto evita que si el FX cambia entre crear y aprobar, el monto referencial siga siendo el mismo. Es importante: la decisión de aprobación se toma con el FX del momento de la decisión, no del momento de creación.

## Defaults / migración de data

- `payments`/`operator_payments` existentes: `approval_status` queda en `'NONE'` (default), nada cambia.
- `agency_settings`: ninguna agency tiene `payment_approval_rules` por defecto → todos los pagos siguen sin requerir aprobación. Maxi tiene que ir a settings y configurarlo si quiere activar.
- **No backfill** de rules para Lozada — Maxi decide cuándo activarlo.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Rompe Lozada al activar | Default = vacío, no rompe. Maxi opta-in. |
| FX rate desactualizado da decisión errónea | Si un pago borderline está cerca del límite, mostrar el cálculo en el UI ("$10,000 USD × $1,250/USD = $12,500,000 ARS — límite ADMIN: $500,000 → requiere aprobación de SUPER_ADMIN"). |
| Pagos PENDING quedan colgados si nadie aprueba | Bell del approver visible. Reporte semanal de "pagos esperando aprobación > 7 días" (fuera de scope v1). |
| Approver acepta sin mirar | logSecurityEvent registra approver_user_id + amount + payment_id. Audit log queda. |
| Race: 2 approvers aprueban a la vez | UPDATE con WHERE approval_status='PENDING_APPROVAL' como guard. Solo el primer UPDATE pasa. |
| RLS no expone payments PENDING a approvers | Verificar que los approvers tienen acceso al row. Para SELLER → solo veían sus propios pagos antes; ahora ADMIN tiene que poder ver todos los PENDING de su org. RLS ya permite eso (ADMIN ve todos los payments del org). |

## Testing

- Unit tests `lib/payments/approval.ts`: matriz role × amount × rules con casos edge (rules vacío, role no listado, max_amount=null, USD vs ARS).
- Integration: smoke manual del flow completo:
  1. Crear payment como SELLER que excede límite → debe quedar PENDING.
  2. Verificar que NO se creó ledger_movement.
  3. Aprobar como ADMIN → verificar ledger creado.
  4. Rechazar otro → verificar status REJECTED + no ledger.

## Smoke pendiente al deployear

1. Pasar las 2 migrations (A y B).
2. Pushear código.
3. Como Maxi: ir a `/settings/agencies/<lozada-rosario>` → tab Aprobaciones → setear `SELLER → 0 ARS`. Guardar.
4. Como SELLER (Micaela o cualquier vendedora): crear un pago de cliente. Verificar que aparece "Pendiente de aprobación" + no se contabilizó.
5. Como Maxi: ir a `/payments/pending-approvals` → ver el row → Aprobar.
6. Verificar que se creó ledger + cash_movement post-aprobación.
7. Repetir con un Reject. Verificar que el rejection_reason queda guardado.
