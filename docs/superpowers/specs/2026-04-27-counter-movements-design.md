# Sistema de contra-movimientos

**Fecha**: 2026-04-27
**Bullet origen**: Reunión Gabi #17 — "Sistema de contra-movimientos (no eliminaciones)"
**Status**: Spec aprobado por Tomi

## Problema

El contador (Yamil/Gabi) hoy puede borrar `cash_movements` y `ledger_movements` directamente. Borrar un movimiento contable destruye el audit trail y rompe la trazabilidad ante AFIP/auditorías. La práctica contable correcta es **reversar** (generar un movimiento opuesto que neutraliza el balance) y dejar ambos rows visibles para historial.

## Objetivo

Reemplazar el flow "borrar movement" con un flow "reversar movement" que:
1. Genera un movimiento contrario automáticamente (mismo monto, tipo opuesto INCOME↔EXPENSE).
2. Marca el original como reversado con motivo + apuntador al row de reversión.
3. Mantiene ambos rows visibles en la tabla.

## No-objetivos

- No tocamos `payments` ni `operator_payments` — esos tienen su propio workflow (mark-as-pending, etc.).
- No tocamos `invoices` (AFIP requiere notas de crédito formales, fuera de scope).
- No removemos los DELETE técnicos del backend (los que usa el sistema cuando un payment se cancela y necesita limpiar). Solo cambiamos los DELETE iniciados por user.
- No reversal en cascada de payments/withholdings: si un cash_movement reversado tenía allocations o asoc, queda como TODO en logs (el contador decide qué hacer manual).

## Arquitectura

```
Contador en /cash/movements click "↩ Reversar" en row X
  ↓
Modal pide motivo (required)
  ↓
POST /api/cash-movements/[id]/reverse {reason}
  ↓
Validar: row exists + permisos + no esté ya reversado + no sea él mismo una reversión
  ↓
INSERT cash_movement nuevo con:
  - type = opuesto a X.type (INCOME → EXPENSE / EXPENSE → INCOME)
  - amount = X.amount, currency, financial_account_id, agency_id = mismos
  - category = "Contra-movimiento"
  - notes = "Reversión de [X.id]: [reason]"
  - movement_date = today
  - reverses_movement_id = X.id
  ↓
UPDATE X: reversed_at = NOW(), reversed_by_movement_id = nuevo.id, reversal_reason = reason
  ↓
Si X.ledger_movement_id IS NOT NULL: cascade a ledger_movements (mismo flow)
  ↓
logSecurityEvent
  ↓
UI refresh: ambos rows visibles, X tachado/badge REVERSADO, nuevo con badge ↩ REVERSO
```

### Schema

```sql
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS reverses_movement_id UUID REFERENCES cash_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_movement_id UUID REFERENCES cash_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_cash_movements_reverses_movement_id
  ON cash_movements(reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;

ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS reverses_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_ledger_movements_reverses_movement_id
  ON ledger_movements(reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;
```

Backward compat: 4 cols nullable, comportamiento sin cambios para rows existentes.

### Lib pura `lib/accounting/reversal.ts`

```typescript
export type MovementType = "INCOME" | "EXPENSE"

export function oppositeMovementType(type: MovementType): MovementType {
  return type === "INCOME" ? "EXPENSE" : "INCOME"
}

export type ReversalCheckResult =
  | { ok: true }
  | { ok: false; error: string }

export function canReverse(movement: {
  reversed_at?: string | null
  reverses_movement_id?: string | null
}): ReversalCheckResult {
  if (movement.reversed_at) {
    return { ok: false, error: "Este movimiento ya fue reversado" }
  }
  if (movement.reverses_movement_id) {
    return { ok: false, error: "No se puede reversar una reversión" }
  }
  return { ok: true }
}

export function buildReversalPayload<M extends {
  type: string
  amount: number
  currency: string
  financial_account_id: string | null
  agency_id?: string | null
  org_id?: string | null
  operation_id?: string | null
  user_id?: string | null
}>(original: M, reason: string, originalId: string, todayIso: string): Record<string, any> {
  return {
    type: oppositeMovementType(original.type as MovementType),
    amount: original.amount,
    currency: original.currency,
    financial_account_id: original.financial_account_id,
    agency_id: original.agency_id ?? null,
    org_id: original.org_id ?? null,
    operation_id: original.operation_id ?? null,
    user_id: original.user_id ?? null,
    category: "Contra-movimiento",
    notes: `Reversión de ${originalId}: ${reason}`,
    movement_date: todayIso,
    reverses_movement_id: originalId,
  }
}
```

Pure helpers — testeables sin DB. La cascada a ledger queda en el endpoint, no acá.

### Endpoints

- `POST /api/cash-movements/[id]/reverse` — body `{ reason: string }`. Atomic transaction (insert reversal + update original). Cascade a ledger_movements si existía vínculo.
- `POST /api/ledger-movements/[id]/reverse` — mismo patrón sin cascade (ledger es la base, no cascadea más abajo).

Ambos validan:
- User role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
- `canReverse(movement).ok === true`
- `reason` non-empty

### UI

**Tabla cash/movements y ledger**:
- Nueva columna o nuevo dropdown action por row: "↩ Reversar". Visible solo para roles permitidos. Disabled si row ya está reversado o es una reversión.
- Click → modal:
  - Texto: "Vas a generar un contra-movimiento. El movimiento original queda en historial. Esto NO se puede deshacer."
  - Textarea: "Motivo del contra-movimiento"
  - Botones Cancelar / Confirmar reversión.
- Rows reversados: badge gris "REVERSADO" + amount tachado.
- Rows que son reversiones: badge azul "↩ REVERSO" con tooltip "Reversa movimiento del [date] - $[amount]".

### Cascada cash → ledger

Cuando cash_movement X tiene `ledger_movement_id != NULL`, después de reversar X:
1. Buscar el ledger_movement Y vinculado.
2. Si Y aún no fue reversado, reversar Y también con mismo motivo + nota "Cascade desde reversión de cash_movement [X.id]".
3. Loggear si la cascada falla pero no romper el flow primary.

Esto evita inconsistencia donde cash queda reversado pero ledger no.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Doble reversión (race) | UPDATE WHERE reversed_at IS NULL. Solo el primero pasa. |
| Reversión sin cascade a ledger queda colgada | Cascade automático en el endpoint. Si falla loggea pero no rompe. |
| Rows con `affects_balance = false` no deberían reversarse (son notas) | Endpoint check: si `affects_balance` existe y es false → 400 con mensaje "Este movimiento no afecta el balance, no requiere reversión". |
| Operations contables que dependen de allocations/withholdings se rompen al reversar el cash | logSecurityEvent + warning visible al user en el modal. NO cascade automática a allocations (fuera de scope v1). |
| Contador "borra" un movimiento existente y se da cuenta tarde de que rompió la cuenta | Cambiamos UI para que la opción "borrar" desaparezca completamente para roles donde "reversar" aplica. Solo SUPER_ADMIN puede ver delete (y solo en casos extremos — el código sigue ahí pero con auth más estricto). |

## Testing

- Unit tests `lib/accounting/reversal.ts`: oppositeMovementType, canReverse (3 casos), buildReversalPayload (verifica todas las cols).
- Integration manual: crear cash_movement INCOME $1000 → reversar con motivo → verificar (a) se creó EXPENSE $1000, (b) original tiene reversed_at, (c) UI muestra ambos con badges, (d) si tenía ledger asociado, también se reversó.

## Smoke pendiente al deployear

1. Pasar migration en Supabase.
2. Como contador (Yamil): ir a `/cash/movements` → seleccionar un row → click "↩ Reversar" → motivo "test" → confirmar.
3. Verificar en la tabla: row original con badge REVERSADO + monto tachado, row nuevo con badge ↩ REVERSO debajo.
4. Refrescar — ambos persisten.
5. Verificar en `/accounting/ledger` que también se reversó el ledger asociado (si aplicaba).
6. Intentar reversar el row reversado → debe dar error "ya fue reversado".
7. Intentar reversar la reversión → debe dar error "no se puede reversar una reversión".
