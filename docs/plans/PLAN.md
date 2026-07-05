# Plan: Edición de Pagos dentro de Operaciones

## Resumen
Agregar funcionalidad de editar pagos existentes desde la tab "Pagos" de una operación. Solo roles ADMIN, SUPER_ADMIN y CONTABLE pueden editar. Al editar, se deben actualizar correctamente los movimientos contables (ledger_movements, cash_movements) para que las cuentas financieras reflejen los valores correctos.

## Archivos a modificar

### 1. `app/api/payments/route.ts` — Agregar método PATCH
- Nuevo endpoint `PATCH /api/payments` que recibe `paymentId` + campos editables
- **Campos editables**: `amount`, `currency`, `method`, `date_paid`, `exchange_rate`, `financial_account_id`, `notes`
- **NO editables**: `operation_id`, `payer_type`, `direction` (estos definen la naturaleza del pago)
- **Validación de rol**: Solo ADMIN, SUPER_ADMIN, CONTABLE
- **Lógica contable** (para pagos con status PAID):
  1. Eliminar el ledger_movement viejo (si existe)
  2. Eliminar el cash_movement viejo (si existe)
  3. Actualizar el registro del pago con los nuevos valores
  4. Crear nuevo ledger_movement con los valores actualizados
  5. Crear nuevo cash_movement si corresponde
  6. Vincular el nuevo `ledger_movement_id` al pago
- **Validaciones**: saldo suficiente en nueva cuenta (para EXPENSE), moneda cuenta = moneda pago, fecha no futura

### 2. `components/operations/operation-payments-section.tsx` — Agregar UI de edición
- Agregar botón de editar (icono lápiz) en la columna Acciones, visible solo para ADMIN/SUPER_ADMIN/CONTABLE
- Nuevo estado `editingPayment` para rastrear qué pago se está editando
- Reutilizar el mismo formulario que ya existe (paymentSchema) en un nuevo Dialog "Editar Pago"
- Pre-popular el formulario con los valores actuales del pago
- Al guardar, llamar a `PATCH /api/payments` con los cambios
- Cargar cuentas financieras al abrir el dialog de edición (mismo patrón que income/expense dialogs)

## Flujo de edición detallado (API)

```
1. Recibir PATCH con paymentId + campos nuevos
2. Validar rol del usuario (ADMIN | SUPER_ADMIN | CONTABLE)
3. Obtener pago actual de DB
4. Si el pago está PAID y tiene ledger_movement_id:
   a. Revertir operator_payment a PENDING si aplica
   b. Eliminar cash_movement vinculado al pago
   c. Eliminar ledger_movement viejo
5. Actualizar registro del pago con nuevos valores
6. Si el pago está PAID:
   a. Validar saldo suficiente (para EXPENSE)
   b. Crear nuevo ledger_movement
   c. Crear nuevo cash_movement
   d. Vincular ledger_movement_id al pago
   e. Marcar operator_payment como PAID si aplica
7. Invalidar caché del dashboard
8. Retornar pago actualizado
```

## Permisos
- Botón editar visible solo para: `ADMIN`, `SUPER_ADMIN`, `CONTABLE`
- API valida el rol antes de proceder
- SELLER y VIEWER no pueden editar pagos
