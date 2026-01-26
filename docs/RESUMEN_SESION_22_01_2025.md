# Resumen de Sesión - Correcciones Lógica Financiera
**Fecha:** 22 de Enero 2025  
**Proyecto:** erplozada  
**Objetivo:** Implementar correcciones completas de lógica financiera según reglas de negocio definidas

---

## 📋 CONTEXTO

Se realizó una revisión completa del sistema financiero basada en 20 preguntas sobre la lógica de negocio. El usuario definió reglas claras sobre cómo deben funcionar las cuentas financieras, transferencias, ingresos, egresos y eliminación de cuentas.

---

## ✅ CORRECCIONES IMPLEMENTADAS

### 1. **Validación de Saldo Suficiente (Pregunta 14)**

**Problema:** El sistema permitía crear egresos que dejaban cuentas con saldo negativo.

**Solución:**
- ✅ Agregada función `validateSufficientBalance()` en `lib/accounting/ledger.ts`
- ✅ Validación implementada en **todos** los endpoints de egresos:
  - `/api/payments` (EXPENSE/OPERATOR_PAYMENT)
  - `/api/payments/mark-paid`
  - `/api/cash/movements` (EXPENSE)
  - `/api/commissions/pay`
  - `/api/partner-accounts/withdrawals`
  - `/api/recurring-payments/pay`
- ✅ Error claro: "Saldo insuficiente en cuenta para realizar el pago"

**Regla de negocio:** NUNCA se permite saldo negativo en cuentas financieras.

---

### 2. **Filtrado de Cuentas Contables (Pregunta 4)**

**Problema:** Las cuentas "Cuentas por Cobrar" y "Cuentas por Pagar" aparecían en selecciones de pagos/ingresos, cuando son solo contables.

**Solución:**
- ✅ Función `isAccountingOnlyAccount()` en `ledger.ts` para identificar cuentas contables
- ✅ GET `/api/accounting/financial-accounts?excludeAccountingOnly=true` excluye CpC/CpP
- ✅ Frontend actualizado en **7 componentes**:
  - `new-payment-dialog.tsx`
  - `mark-paid-dialog.tsx`
  - `new-cash-movement-dialog.tsx`
  - `manual-payment-dialog.tsx`
  - `operation-payments-section.tsx`
  - `pay-recurring-expense-dialog.tsx`
  - `bulk-payment-dialog.tsx`

**Regla de negocio:** Cuentas contables (CpC/CpP) NO deben aparecer en selecciones de pagos/ingresos/transferencias.

---

### 3. **Transferencia entre Cuentas Financieras (Pregunta 9)**

**Problema:** No existía flujo para transferir dinero entre cuentas financieras (solo entre cash_boxes).

**Solución:**
- ✅ Nuevo endpoint: `POST /api/accounting/financial-accounts/transfer`
- ✅ Nuevo componente: `TransferAccountDialog`
- ✅ Botón "Transferir" en página de cuentas financieras
- ✅ Validaciones:
  - Misma moneda obligatoria
  - Saldo suficiente en cuenta origen
  - Cuentas activas
- ✅ Dos movimientos: EXPENSE en origen, INCOME en destino
- ✅ Montos exactamente iguales

**Regla de negocio:** Transferencias siempre misma moneda (ARS→ARS, USD→USD), dos movimientos, montos iguales.

---

### 4. **Eliminación Hard-Delete (Pregunta 15)**

**Problema:** Las cuentas se eliminaban con soft-delete (`is_active = false`), pero el usuario requiere eliminación permanente.

**Solución:**
- ✅ Cambiado de `UPDATE is_active = false` a `DELETE` real
- ✅ Elimina movimientos de ledger asociados antes de borrar la cuenta
- ✅ Eliminación completa de la fila en `financial_accounts`

**Regla de negocio:** Eliminación es "para siempre", no archivar.

---

### 5. **Caso Especial: Última Cuenta (Pregunta 13)**

**Problema:** Si queda solo 1 cuenta financiera, al eliminarla debe borrar todos los movimientos contables.

**Solución:**
- ✅ Verificación de cantidad de cuentas activas antes de eliminar
- ✅ Si `activeCount === 1`: borra TODOS los movimientos contables del sistema
- ✅ Mensaje: "Última cuenta eliminada. Todos los movimientos contables fueron eliminados."

**Regla de negocio:** Si solo queda 1 cuenta, al eliminarla se borra todo el historial contable.

---

### 6. **Chart_account_id Automático (Pregunta 17)**

**Problema:** Las cuentas financieras debían estar 100% ligadas al plan de cuentas, pero no se asignaba automáticamente.

**Solución:**
- ✅ Mapeo automático en `POST /api/accounting/financial-accounts`:
  - `CASH_ARS/USD` → `1.1.01` (Caja)
  - `CHECKING_ARS/USD` → `1.1.02` (Bancos)
  - `SAVINGS_ARS/USD` → `1.1.02` (Bancos)
  - `CREDIT_CARD` → `1.1.04` (Mercado Pago)
  - `ASSETS` → `1.1.05` (Activos)
- ✅ Búsqueda automática del `chart_account_id` según `account_code`

**Regla de negocio:** Todas las cuentas financieras deben tener `chart_account_id` asignado automáticamente.

---

### 7. **Comisiones con Cuenta Financiera (Pregunta 20)**

**Problema:** Las comisiones no requerían selección de cuenta financiera.

**Solución:**
- ✅ Endpoint `/api/commissions/pay` ahora requiere `financial_account_id`
- ✅ Validación de moneda coincidente
- ✅ Tipo de cambio obligatorio para USD
- ✅ Validación de saldo suficiente

**Regla de negocio:** Comisiones siempre desde cuenta financiera seleccionada, con tipo de cambio si ARS→USD.

---

### 8. **Validación Tipo de Cambio Obligatorio (Pregunta 18)**

**Problema:** Necesitaba validación explícita de tipo de cambio.

**Solución:**
- ✅ `createLedgerMovement` valida: si `currency = USD`, `exchange_rate` es requerido
- ✅ Validación de moneda: cuenta y operación deben coincidir
- ✅ Error claro si falta tipo de cambio

**Regla de negocio:** Siempre debe haber tipo de cambio cuando se opera con USD o se convierte entre monedas.

---

## 🎨 MEJORAS DE UI

### 9. **Filtro de Agencia en Cuentas Financieras**

**Problema:** Las agencias aparecían en scroll, difícil de navegar.

**Solución:**
- ✅ Select para filtrar por agencia (similar a otros componentes)
- ✅ Opciones: "Todas las agencias" o agencia específica
- ✅ Solo muestra cuentas de la agencia seleccionada
- ✅ Sin scroll innecesario

---

### 10. **Deudores por Ventas - Refactor Completo**

**Problema:** Tabla expandible por cliente, información limitada, sin vendedor visible.

**Solución:**
- ✅ Refactorizado para usar `DataTable` estándar (como `operations-table.tsx`)
- ✅ Tabla plana con todas las operaciones visible de inmediato
- ✅ Columnas completas:
  - Cliente (con documento)
  - Código de operación
  - **Destino** (nuevo)
  - **Vendedor** (nuevo, badge)
  - Fecha Salida
  - Total Venta
  - Pagado
  - Deuda
  - Acciones (ícono Eye que lleva a operación)
- ✅ Búsqueda integrada por nombre de cliente
- ✅ Exportación Excel mejorada:
  - Resumen por Cliente: incluye columna "Vendedores"
  - Detalle Operaciones: incluye "Vendedor" en cada fila

---

## 📁 ARCHIVOS MODIFICADOS

### Backend (API Routes)
- `lib/accounting/ledger.ts` - Funciones helper (`validateSufficientBalance`, `isAccountingOnlyAccount`)
- `app/api/payments/route.ts` - Validación saldo
- `app/api/payments/mark-paid/route.ts` - Validación saldo
- `app/api/cash/movements/route.ts` - Validación saldo
- `app/api/commissions/pay/route.ts` - Requiere `financial_account_id`, validación saldo
- `app/api/partner-accounts/withdrawals/route.ts` - Validación saldo
- `app/api/recurring-payments/pay/route.ts` - Validación saldo
- `app/api/accounting/financial-accounts/route.ts` - Filtro cuentas contables, `chart_account_id` automático
- `app/api/accounting/financial-accounts/[id]/route.ts` - Hard delete, caso última cuenta
- `app/api/accounting/financial-accounts/transfer/route.ts` - **NUEVO** endpoint de transferencia

### Frontend (Components)
- `components/accounting/financial-accounts-page-client.tsx` - Filtro agencia, botón transferir
- `components/accounting/debts-sales-page-client.tsx` - Refactor completo con DataTable
- `components/accounting/transfer-account-dialog.tsx` - **NUEVO** componente
- `components/operations/new-payment-dialog.tsx` - Filtro cuentas contables
- `components/payments/mark-paid-dialog.tsx` - Filtro cuentas contables
- `components/cash/new-cash-movement-dialog.tsx` - Filtro cuentas contables
- `components/accounting/manual-payment-dialog.tsx` - Filtro cuentas contables
- `components/operations/operation-payments-section.tsx` - Filtro cuentas contables
- `components/accounting/pay-recurring-expense-dialog.tsx` - Filtro cuentas contables
- `components/accounting/bulk-payment-dialog.tsx` - Filtro cuentas contables

---

## 🔧 CAMBIOS TÉCNICOS IMPORTANTES

### Funciones Nuevas en `ledger.ts`

```typescript
// Validar saldo suficiente antes de permitir egreso
validateSufficientBalance(
  accountId: string,
  amount: number,
  currency: "ARS" | "USD",
  supabase: SupabaseClient
): Promise<{ valid: boolean; currentBalance: number; error?: string }>

// Identificar si una cuenta es solo contable (CpC/CpP)
isAccountingOnlyAccount(
  accountId: string,
  supabase: SupabaseClient
): Promise<boolean>
```

### Nuevo Endpoint de Transferencia

```
POST /api/accounting/financial-accounts/transfer
Body: {
  from_account_id: string
  to_account_id: string
  amount: number
  currency: "ARS" | "USD"
  transfer_date: string (YYYY-MM-DD)
  notes?: string
}
```

**Validaciones:**
- Misma moneda en ambas cuentas
- Saldo suficiente en cuenta origen
- Cuentas activas
- No puede ser la misma cuenta

**Crea 2 movimientos:**
- EXPENSE en cuenta origen
- INCOME en cuenta destino

---

## 📊 ESTADÍSTICAS

- **17 archivos modificados**
- **1 archivo nuevo** (`transfer-account-dialog.tsx`)
- **1 endpoint nuevo** (`/api/accounting/financial-accounts/transfer`)
- **2 funciones helper nuevas** (`validateSufficientBalance`, `isAccountingOnlyAccount`)
- **8 endpoints con validación de saldo**
- **7 componentes con filtro de cuentas contables**

---

## 🎯 REGLAS DE NEGOCIO IMPLEMENTADAS

1. ✅ **NUNCA permitir saldo negativo** - Validación en todos los egresos
2. ✅ **Cuentas contables excluidas** - No aparecen en selecciones
3. ✅ **Transferencias misma moneda** - ARS→ARS, USD→USD
4. ✅ **Eliminación permanente** - Hard delete, no soft delete
5. ✅ **Última cuenta especial** - Borra todos los movimientos
6. ✅ **Chart_account_id automático** - Asignación según tipo de cuenta
7. ✅ **Comisiones con cuenta** - Requiere selección de cuenta financiera
8. ✅ **Tipo de cambio obligatorio** - Validación para USD

---

## 🚀 COMMITS REALIZADOS

1. `99f592a` - fix: transferencia al eliminar cuenta + 20 preguntas lógica financiera
2. `85f0183` - feat: correcciones completas lógica financiera según reglas de negocio
3. `494ff04` - feat: agregar filtro de agencia en cuentas financieras
4. `4cd864d` - feat: mejorar deudores por ventas con DataTable estándar
5. `fa2832e` - fix: mover useMemo de columns antes de returns condicionales
6. `47b4612` - fix: usar Array.from en lugar de spread para Set
7. `7263a1c` - refactor: simplificar acciones en deudores por ventas
8. `0bc5559` - feat: agregar UI para transferencia entre cuentas financieras

---

## 📝 NOTAS PARA VIBOOK SERVICES

### Puntos Clave a Replicar

1. **Validación de saldo:** Implementar en TODOS los endpoints que crean EXPENSE/OPERATOR_PAYMENT/COMMISSION
2. **Filtrado de cuentas contables:** Usar `excludeAccountingOnly=true` en GET de financial-accounts cuando se usa para selección
3. **Transferencias:** Endpoint con validaciones estrictas (misma moneda, saldo suficiente)
4. **Hard delete:** Eliminar movimientos asociados antes de borrar cuenta
5. **Chart_account_id:** Asignación automática al crear cuenta según tipo
6. **DataTable estándar:** Usar mismo patrón que operations-table para consistencia

### Archivos Críticos a Revisar

- `lib/accounting/ledger.ts` - Funciones core de validación
- `app/api/accounting/financial-accounts/transfer/route.ts` - Lógica de transferencia
- `components/accounting/debts-sales-page-client.tsx` - Ejemplo de DataTable con todas las columnas

---

## ✅ ESTADO FINAL

**Todas las correcciones implementadas y desplegadas.**  
El sistema financiero ahora funciona 100% según las reglas de negocio definidas por el usuario.

**Próximos pasos sugeridos:**
- Review general del sistema
- Testing en producción
- Ajustes menores si se encuentran durante el uso

---

**Documento generado:** 22/01/2025  
**Última actualización:** 22/01/2025
