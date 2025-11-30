# 📘 ANÁLISIS: MÓDULO CONTABLE - SISTEMA DE GESTIÓN PARA AGENCIAS

## 📋 RESUMEN EJECUTIVO

Este documento analiza el prompt contable proporcionado y compara con el estado actual del sistema, identificando qué tenemos, qué falta, y qué cambios son necesarios para implementar un sistema contable completo e integrado.

---

## 🔍 1. PRINCIPIO CONTABLE CORE

### Requerimiento del Prompt:
```
LEAD → OPERATION → LEDGER MOVEMENTS → IVA → BALANCES → REPORTING
```

**Estado Actual:**
- ✅ Tenemos: `leads` → `operations` (conversión básica)
- ❌ Falta: `ledger_movements` (tabla central contable)
- ❌ Falta: Módulo IVA
- ❌ Falta: Sistema de balances por cuenta financiera
- ⚠️ Parcial: Reporting básico existe pero no completo

**Cambios Necesarios:**
1. Crear tabla `ledger_movements` como corazón contable
2. Implementar flujo obligatorio: todo movimiento financiero debe pasar por ledger
3. Migrar lógica de `cash_movements` y `payments` para que generen `ledger_movements`

---

## 📊 2. LEDGER MOVEMENTS (CORAZÓN CONTABLE)

### Requerimiento del Prompt:
Tabla `ledger_movements` con campos:
- id, operation_id, lead_id, type, concept, currency, amount_original, exchange_rate, amount_ars_equivalent, method, account_id, seller_id, operator_id, receipt_number, notes, created_at, created_by

**Estado Actual:**
- ❌ NO EXISTE la tabla `ledger_movements`
- ✅ Tenemos `cash_movements` (pero no es un ledger completo)
- ✅ Tenemos `payments` (pero no genera ledger automáticamente)

**Cambios Necesarios:**
1. **Crear tabla `ledger_movements`** con todos los campos requeridos
2. **Migrar lógica existente:**
   - Cuando se marca un payment como PAID → crear `ledger_movement`
   - Cuando se crea un `cash_movement` → crear `ledger_movement`
   - Cuando se recibe un depósito de un lead → crear `ledger_movement` con `lead_id`
3. **Implementar transferencia automática:**
   - Cuando Lead → Operation: transferir todos los `ledger_movements` de `lead_id` a `operation_id`
4. **Implementar cálculo de FX:**
   - Si currency = USD, calcular `amount_ars_equivalent` usando `exchange_rate`
   - Generar `FX_GAIN` o `FX_LOSS` automáticamente cuando hay diferencias cambiarias

---

## 💰 3. FINANCIAL ACCOUNTS (CAJA, BANCOS, MERCADO PAGO)

### Requerimiento del Prompt:
Tabla `financial_accounts` con:
- id, name, type (CASH | BANK | MP | USD), currency, initial_balance, created_at, created_by

**Estado Actual:**
- ❌ NO EXISTE la tabla `financial_accounts`
- ⚠️ Tenemos módulo de caja pero sin cuentas separadas

**Cambios Necesarios:**
1. **Crear tabla `financial_accounts`**
2. **Crear vista o función para calcular balances:**
   - `balance = initial_balance + SUM(ledger_movements.amount_ars_equivalent WHERE account_id = X)`
3. **Actualizar UI de caja:**
   - Mostrar balances por cuenta
   - Filtrar movimientos por cuenta
   - Permitir seleccionar cuenta al crear movimiento

---

## 🏢 4. OPERATORS (PROVEEDORES)

### Requerimiento del Prompt:
Tabla `operators` con: id, name, contact_email, notes, created_at

**Estado Actual:**
- ✅ Tabla `operators` EXISTE con campos: id, name, contact_name, contact_email, contact_phone, credit_limit, created_at, updated_at
- ✅ Más completa que lo requerido (tiene contact_phone, credit_limit)

**Cambios Necesarios:**
- ✅ NINGUNO - La tabla actual es suficiente y más completa

---

## ✈️ 5. OPERATIONS (VENTAS REALES)

### Requerimiento del Prompt:
Tabla `operations` con campos adicionales:
- file_code (string unique)
- product_type: "AEREO" | "HOTEL" | "PAQUETE" | "CRUCERO" | "OTRO"
- sale_currency ("ARS" | "USD")
- operator_cost_currency ("ARS" | "USD")
- checkin_date, checkout_date
- passengers JSON
- seller_primary, seller_secondary (nullable)

**Estado Actual:**
- ✅ Tabla `operations` EXISTE
- ✅ Tiene: id, agency_id, lead_id, seller_id, operator_id, type, origin, destination, departure_date, return_date, adults, children, infants, status, sale_amount_total, operator_cost, currency, margin_amount, margin_percentage
- ❌ FALTA: file_code, product_type (tenemos `type` pero con valores diferentes), checkin_date, checkout_date, passengers JSON, seller_secondary
- ⚠️ Parcial: `currency` existe pero no separado en `sale_currency` y `operator_cost_currency`

**Cambios Necesarios:**
1. **Agregar campos faltantes a `operations`:**
   - `file_code` (string unique)
   - `product_type` (renombrar o agregar campo adicional)
   - `checkin_date`, `checkout_date` (DATE nullable)
   - `passengers` (JSONB)
   - `seller_secondary` (FK users nullable)
   - `sale_currency` (separar de `currency`)
   - `operator_cost_currency` (nuevo campo)
2. **Actualizar lógica de creación:**
   - Auto-generar `file_code` único
   - Determinar `product_type` basado en `type` actual
   - Calcular fechas de checkin/checkout según product_type
3. **Actualizar UI:**
   - Formulario de creación/edición con nuevos campos
   - Mostrar `file_code` en listados
   - Permitir seleccionar `seller_secondary`

---

## 💳 6. OPERATOR PAYMENTS (CUENTAS A PAGAR)

### Requerimiento del Prompt:
Tabla `operator_payments` separada con:
- id, operation_id, operator_id, amount, currency, due_date, status (PENDING | PAID | OVERDUE), created_at

**Estado Actual:**
- ❌ NO EXISTE tabla `operator_payments` separada
- ✅ Tenemos tabla `payments` genérica que incluye pagos de operadores (payer_type = 'OPERATOR', direction = 'EXPENSE')
- ⚠️ La lógica actual funciona pero no está separada como requiere el prompt

**Cambios Necesarios:**
1. **Opción A (Recomendada):** Mantener `payments` pero crear vista `operator_payments` que filtre `payer_type = 'OPERATOR'`
2. **Opción B:** Crear tabla `operator_payments` separada y migrar datos
3. **Implementar lógica:**
   - Auto-crear `operator_payments` cuando se crea Operation
   - Fechas de vencimiento según product_type:
     - AEREO: due_date = purchase_date + 10 days
     - HOTEL: due_date = checkin_date - 30 days
   - Marcar como PAID cuando existe `ledger_movement` type EXPENSE con operator_id
   - Calcular OVERDUE automáticamente

---

## 👥 7. CLIENT PAYMENTS (CUENTAS A COBRAR)

### Requerimiento del Prompt:
No tabla separada. Client payments = `ledger_movements` where type = INCOME and operation_id matches.

**Estado Actual:**
- ✅ Tenemos `payments` con `payer_type = 'CUSTOMER'` y `direction = 'INCOME'`
- ❌ No está basado en `ledger_movements` (aún no existe)

**Cambios Necesarios:**
1. **Implementar cálculo basado en ledger:**
   - `client_total_paid = SUM(ledger_movements.amount_ars_equivalent WHERE type = INCOME AND operation_id = X)`
   - `client_total_due = operation.sale_amount_total - client_total_paid`
2. **Actualizar UI:**
   - Mostrar saldo pendiente en detalle de operación
   - Alertas automáticas para pagos vencidos

---

## 📑 8. IVA MODULE (TAX ENGINE)

### Requerimiento del Prompt:
Tablas `iva_sales` y `iva_purchases` con cálculo automático:
- IVA venta: net = sale_amount_total / 1.21, iva = sale_amount_total - net
- IVA compra: net = operator_cost_total / 1.21, iva = operator_cost_total - net
- IVA a pagar mensual: sum(iva_sales.iva) - sum(iva_purchases.iva)

**Estado Actual:**
- ❌ NO EXISTEN tablas `iva_sales` ni `iva_purchases`
- ❌ NO EXISTE cálculo automático de IVA

**Cambios Necesarios:**
1. **Crear tablas:**
   - `iva_sales` (id, operation_id, sale_amount_total, net_amount, iva_amount, currency, created_at)
   - `iva_purchases` (id, operation_id, operator_cost_total, net_amount, iva_amount, currency, created_at)
2. **Implementar triggers o lógica automática:**
   - Cuando se crea/actualiza Operation con `sale_amount_total` → crear registro en `iva_sales`
   - Cuando se crea/actualiza Operation con `operator_cost_total` → crear registro en `iva_purchases`
3. **Crear función/vista para IVA mensual:**
   - Calcular IVA a pagar por mes
   - Mostrar en dashboard y reportes

---

## 💵 9. COMMISSIONS MODULE

### Requerimiento del Prompt:
Tabla `commissions` con: id, operation_id, seller_id, percentage, commission_amount, status (PENDING | PAID), created_at

**Estado Actual:**
- ✅ Tabla `commission_records` EXISTE con: id, operation_id, seller_id, agency_id, amount, status (PENDING | PAID), date_calculated, date_paid
- ✅ Tabla `commission_rules` EXISTE
- ✅ Lógica de cálculo existe en `lib/commissions/calculate.ts`
- ⚠️ Falta: campo `percentage` en `commission_records`
- ⚠️ Falta: soporte para `seller_primary` y `seller_secondary` con split

**Cambios Necesarios:**
1. **Agregar campo `percentage` a `commission_records`**
2. **Actualizar lógica de cálculo:**
   - Soporte para `seller_primary` y `seller_secondary`
   - Split de comisión según configuración
3. **Actualizar lógica de pago:**
   - Commission se marca como PAID cuando existe `ledger_movement` type COMMISSION

---

## 🌍 10. MULTICURRENCY HANDLING (FX)

### Requerimiento del Prompt:
- Almacenar amount_original, exchange_rate, amount_ars_equivalent
- Calcular FX_GAIN cuando ARS pagado < ARS equivalente registrado en venta
- Calcular FX_LOSS cuando es lo contrario
- Crear `ledger_movements` automáticos para FX

**Estado Actual:**
- ⚠️ Tenemos campo `currency` en operations y payments
- ❌ NO EXISTE cálculo de exchange_rate
- ❌ NO EXISTE cálculo de amount_ars_equivalent
- ❌ NO EXISTE detección de FX_GAIN/FX_LOSS
- ❌ NO EXISTE creación automática de ledger_movements para FX

**Cambios Necesarios:**
1. **Agregar campos a `ledger_movements`:**
   - `amount_original` (monto en moneda original)
   - `exchange_rate` (tasa de cambio usada)
   - `amount_ars_equivalent` (monto equivalente en ARS)
2. **Implementar lógica de FX:**
   - Al crear ledger_movement con currency = USD, calcular ARS equivalent
   - Detectar cuando hay diferencia entre venta USD y pago ARS (o viceversa)
   - Crear `ledger_movement` type FX_GAIN o FX_LOSS automáticamente
3. **Crear tabla o configuración para exchange rates:**
   - Permitir ingresar tasas de cambio históricas
   - O usar API externa para obtener tasas

---

## ⚠️ 11. AUTOMATIC ALERT SYSTEM

### Requerimiento del Prompt:
Alertas para:
- Clientes con pagos vencidos
- Operadores con pagos vencidos
- IVA pendiente
- Saldos de caja por debajo del umbral
- Pérdidas FX por encima del umbral
- Operaciones con documentación incompleta

**Estado Actual:**
- ✅ Tabla `alerts` EXISTE
- ✅ Lógica básica de generación existe en `lib/alerts/generate.ts`
- ⚠️ Falta: alertas para IVA, saldos de caja, FX losses, documentación incompleta

**Cambios Necesarios:**
1. **Extender `lib/alerts/generate.ts`:**
   - Función para alertas de IVA pendiente
   - Función para alertas de saldo de caja bajo
   - Función para alertas de FX losses altos
   - Función para alertas de documentación faltante
2. **Crear triggers o jobs:**
   - Ejecutar generación de alertas periódicamente
   - O ejecutar cuando cambian datos relevantes

---

## 🎨 12. UI REQUIREMENTS

### Requerimiento del Prompt:
Páginas requeridas:
1. `/accounting/ledger` - Tabla completa con filtros
2. `/accounting/operations` - Lista con detalle completo
3. `/accounting/operator-payments`
4. `/accounting/iva`
5. `/accounting/financial-accounts`

**Estado Actual:**
- ✅ Tenemos `/cash` con KPIs y movimientos
- ✅ Tenemos `/cash/payments` y `/cash/movements`
- ✅ Tenemos `/operations` con detalle básico
- ❌ NO EXISTE `/accounting/ledger`
- ❌ NO EXISTE `/accounting/iva`
- ❌ NO EXISTE `/accounting/financial-accounts`
- ⚠️ Parcial: `/operations` existe pero no tiene toda la información requerida

**Cambios Necesarios:**
1. **Crear estructura de rutas:**
   - `/app/(dashboard)/accounting/ledger/page.tsx`
   - `/app/(dashboard)/accounting/operations/page.tsx` (mejorar existente)
   - `/app/(dashboard)/accounting/operator-payments/page.tsx`
   - `/app/(dashboard)/accounting/iva/page.tsx`
   - `/app/(dashboard)/accounting/financial-accounts/page.tsx`
2. **Crear componentes:**
   - `LedgerTable` con filtros avanzados
   - `OperationDetailSheet` con todas las secciones
   - `IVADashboard` con cálculo mensual
   - `FinancialAccountsTable` con balances
3. **Actualizar sidebar:**
   - Agregar sección "Accounting" con submenús

---

## 🔗 13. CONNECTION WITH LEADS

### Requerimiento del Prompt:
Leads debe tener campos:
- quoted_price
- has_deposit (boolean)
- deposit_amount
- deposit_currency
- deposit_method
- deposit_date

**Estado Actual:**
- ✅ Tabla `leads` EXISTE
- ❌ FALTAN todos los campos de depósito
- ❌ FALTA campo `quoted_price`

**Cambios Necesarios:**
1. **Agregar campos a `leads`:**
   - `quoted_price` (NUMERIC)
   - `has_deposit` (BOOLEAN)
   - `deposit_amount` (NUMERIC nullable)
   - `deposit_currency` (TEXT nullable, 'ARS' | 'USD')
   - `deposit_method` (TEXT nullable)
   - `deposit_date` (DATE nullable)
2. **Implementar lógica:**
   - Cuando se recibe depósito → crear `ledger_movement` con `lead_id`
   - Cuando Lead → Operation: transferir todos los `ledger_movements` de `lead_id` a `operation_id`
   - Preservar: destination, dates, passenger count, quoted price, seller
3. **Actualizar UI:**
   - Formulario de lead con campos de depósito
   - Mostrar depósito en detalle de lead
   - Botón para registrar depósito

---

## 🤖 14. AI ASSISTANT ACCESS

### Requerimiento del Prompt:
AI debe usar server actions en `/services/ai/queries.ts` para responder:
- "¿Cuánto vendimos este mes?"
- "¿Cuánto vendió X vendedor?"
- "¿Cuánto IVA debo pagar?"
- "¿Qué operaciones vencen mañana?"
- "¿Cuánta caja real tengo?"
- "¿Cuál es mi ganancia total del mes?"
- "¿Qué operador está más atrasado?"

**Estado Actual:**
- ✅ Tenemos `/app/api/ai/route.ts` con tool calling
- ✅ Tenemos `/lib/ai/tools.ts` con funciones básicas
- ⚠️ Falta: funciones para IVA, caja real, FX, operadores atrasados

**Cambios Necesarios:**
1. **Extender `/lib/ai/tools.ts`:**
   - `getIVAStatus()` - IVA pendiente
   - `getCashBalances()` - Saldos por cuenta financiera
   - `getFXStatus()` - Pérdidas/ganancias cambiarias
   - `getOverdueOperatorPayments()` - Operadores atrasados
   - `getOperationMargin()` - Margen de operación específica
2. **Actualizar `/app/api/ai/route.ts`:**
   - Agregar nuevas herramientas al sistema de tool calling
   - Mejorar respuestas con contexto de ledger

---

## 📊 COMPARATIVA: LO QUE TENEMOS vs LO QUE NECESITAMOS

### ✅ LO QUE YA TENEMOS (Y FUNCIONA)

1. **Estructura Base:**
   - ✅ Tabla `operations` (con campos básicos)
   - ✅ Tabla `payments` (genérica pero funcional)
   - ✅ Tabla `cash_movements` (básica)
   - ✅ Tabla `commission_rules` y `commission_records`
   - ✅ Tabla `leads` (con integración Trello)
   - ✅ Tabla `operators`
   - ✅ Sistema de alertas básico

2. **UI Existente:**
   - ✅ Módulo de caja (`/cash`)
   - ✅ Módulo de operaciones (`/operations`)
   - ✅ Módulo de leads (`/sales/leads`)
   - ✅ Dashboard con KPIs básicos

3. **Lógica Existente:**
   - ✅ Cálculo de comisiones
   - ✅ Generación de alertas básicas
   - ✅ Auto-generación de payments al crear operation
   - ✅ Integración con Trello

### ❌ LO QUE FALTA (CRÍTICO)

1. **Tablas Nuevas:**
   - ❌ `ledger_movements` (CORAZÓN CONTABLE)
   - ❌ `financial_accounts` (caja, bancos, MP)
   - ❌ `operator_payments` (o vista equivalente)
   - ❌ `iva_sales`
   - ❌ `iva_purchases`

2. **Campos Faltantes:**
   - ❌ En `leads`: quoted_price, has_deposit, deposit_amount, deposit_currency, deposit_method, deposit_date
   - ❌ En `operations`: file_code, product_type, checkin_date, checkout_date, passengers JSON, seller_secondary, sale_currency, operator_cost_currency

3. **Lógica Faltante:**
   - ❌ Flujo obligatorio: todo movimiento → ledger_movement
   - ❌ Transferencia automática: lead_id → operation_id en ledger
   - ❌ Cálculo automático de IVA
   - ❌ Cálculo automático de FX gains/losses
   - ❌ Balances por cuenta financiera
   - ❌ Alertas avanzadas (IVA, caja, FX, docs)

4. **UI Faltante:**
   - ❌ `/accounting/ledger`
   - ❌ `/accounting/iva`
   - ❌ `/accounting/financial-accounts`
   - ❌ Mejoras en `/accounting/operations` (detalle completo)

---

## 🗺️ ROADMAP DE IMPLEMENTACIÓN

### FASE 1: FUNDACIÓN CONTABLE (CRÍTICO) ⚠️

**Objetivo:** Crear el corazón contable (ledger_movements) y migrar lógica existente.

**Tareas:**
1. ✅ Crear migración SQL para `ledger_movements`
2. ✅ Crear migración SQL para `financial_accounts`
3. ✅ Crear funciones de migración de datos:
   - Migrar `cash_movements` existentes → `ledger_movements`
   - Migrar `payments` PAID → `ledger_movements`
4. ✅ Actualizar lógica de creación:
   - `POST /api/payments/mark-paid` → crear `ledger_movement`
   - `POST /api/cash/movements` → crear `ledger_movement`
5. ✅ Crear servicio `lib/accounting/ledger.ts`:
   - `createLedgerMovement()`
   - `transferLeadToOperation(leadId, operationId)`
   - `getAccountBalance(accountId)`

**Duración estimada:** 2-3 días

---

### FASE 2: EXTENSIÓN DE TABLAS Y CAMPOS

**Objetivo:** Agregar campos faltantes a leads y operations.

**Tareas:**
1. ✅ Migración SQL para agregar campos a `leads`:
   - quoted_price, has_deposit, deposit_amount, deposit_currency, deposit_method, deposit_date
2. ✅ Migración SQL para agregar campos a `operations`:
   - file_code, product_type, checkin_date, checkout_date, passengers, seller_secondary, sale_currency, operator_cost_currency
3. ✅ Actualizar tipos TypeScript
4. ✅ Actualizar formularios de creación/edición
5. ✅ Implementar auto-generación de `file_code`

**Duración estimada:** 1-2 días

---

### FASE 3: MÓDULO IVA

**Objetivo:** Implementar cálculo y registro automático de IVA.

**Tareas:**
1. ✅ Crear migración SQL para `iva_sales` y `iva_purchases`
2. ✅ Crear triggers o funciones para cálculo automático:
   - Al crear/actualizar Operation → calcular y guardar IVA
3. ✅ Crear servicio `lib/accounting/iva.ts`:
   - `calculateIVASale(operation)`
   - `calculateIVAPurchase(operation)`
   - `getMonthlyIVA(month, year)`
4. ✅ Crear UI `/accounting/iva`:
   - Dashboard con IVA mensual
   - Tabla de ventas con IVA
   - Tabla de compras con IVA

**Duración estimada:** 1-2 días

---

### FASE 4: MULTICURRENCY Y FX

**Objetivo:** Implementar manejo de múltiples monedas y cálculo de FX.

**Tareas:**
1. ✅ Actualizar `ledger_movements` para soportar FX:
   - Verificar que campos existan (amount_original, exchange_rate, amount_ars_equivalent)
2. ✅ Crear servicio `lib/accounting/fx.ts`:
   - `calculateARSEquivalent(amount, currency, exchangeRate)`
   - `detectFXGainLoss(operation)`
   - `createFXMovement(operation, gainOrLoss)`
3. ✅ Crear tabla o configuración para exchange rates:
   - `exchange_rates` (date, currency, rate, source)
4. ✅ Actualizar lógica de creación de operations:
   - Si currency = USD, calcular ARS equivalent
   - Detectar diferencias y crear FX movements
5. ✅ Actualizar UI para mostrar FX gains/losses

**Duración estimada:** 2-3 días

---

### FASE 5: OPERATOR PAYMENTS Y CLIENT PAYMENTS

**Objetivo:** Separar y mejorar gestión de pagos de operadores y clientes.

**Tareas:**
1. ✅ Decidir estrategia:
   - Opción A: Crear vista `operator_payments` que filtre `payments`
   - Opción B: Crear tabla separada y migrar
2. ✅ Implementar lógica de fechas de vencimiento:
   - AEREO: purchase_date + 10 days
   - HOTEL: checkin_date - 30 days
3. ✅ Actualizar lógica de pago:
   - Cuando se marca operator payment como PAID → crear ledger_movement
4. ✅ Crear UI `/accounting/operator-payments`:
   - Tabla con filtros
   - Acciones para marcar como pagado
5. ✅ Mejorar cálculo de client payments:
   - Basado en ledger_movements
   - Mostrar en detalle de operation

**Duración estimada:** 1-2 días

---

### FASE 6: UI COMPLETA DE ACCOUNTING

**Objetivo:** Crear todas las páginas y componentes de accounting.

**Tareas:**
1. ✅ Crear `/accounting/ledger`:
   - Tabla completa con filtros (seller, operator, currency, date, account)
   - Sheet con detalles al hacer click
   - Export a CSV
2. ✅ Mejorar `/accounting/operations`:
   - Detalle completo con tabs:
     - Información básica
     - Pagos de cliente (con cálculo basado en ledger)
     - Pagos a operador
     - IVA
     - Comisiones
     - Margen y FX
     - Documentos
3. ✅ Crear `/accounting/financial-accounts`:
   - Lista de cuentas con balances
   - Detalle de cuenta con movimientos
   - Crear/editar cuentas
4. ✅ Actualizar sidebar con sección Accounting

**Duración estimada:** 2-3 días

---

### FASE 7: ALERTAS AVANZADAS

**Objetivo:** Extender sistema de alertas con nuevas funcionalidades.

**Tareas:**
1. ✅ Extender `lib/alerts/generate.ts`:
   - `generateIVAAlerts()`
   - `generateCashBalanceAlerts(threshold)`
   - `generateFXLossAlerts(threshold)`
   - `generateMissingDocsAlerts()`
2. ✅ Crear job o trigger para ejecutar generación periódicamente
3. ✅ Actualizar UI de alertas para mostrar nuevos tipos

**Duración estimada:** 1 día

---

### FASE 8: INTEGRACIÓN CON LEADS

**Objetivo:** Completar integración de depósitos en leads.

**Tareas:**
1. ✅ Actualizar formulario de lead con campos de depósito
2. ✅ Crear endpoint para registrar depósito:
   - `POST /api/leads/[id]/deposit`
   - Crear `ledger_movement` con `lead_id`
3. ✅ Implementar transferencia automática:
   - Cuando Lead → Operation: transferir ledger_movements
4. ✅ Actualizar UI de detalle de lead:
   - Mostrar depósito recibido
   - Mostrar movimientos relacionados

**Duración estimada:** 1 día

---

### FASE 9: AI ASSISTANT EXTENDED

**Objetivo:** Extender AI Copilot con nuevas herramientas contables.

**Tareas:**
1. ✅ Extender `lib/ai/tools.ts`:
   - `getIVAStatus()`
   - `getCashBalances()`
   - `getFXStatus()`
   - `getOverdueOperatorPayments()`
   - `getOperationMargin(operationId)`
2. ✅ Actualizar `/app/api/ai/route.ts`:
   - Agregar nuevas herramientas
   - Mejorar contexto con información de ledger

**Duración estimada:** 1 día

---

### FASE 10: TESTING Y AJUSTES FINALES

**Objetivo:** Probar todo el flujo contable y ajustar.

**Tareas:**
1. ✅ Testing end-to-end:
   - Lead con depósito → Operation → Ledger movements → IVA → Balances
2. ✅ Verificar cálculos:
   - IVA correcto
   - FX gains/losses correctos
   - Balances de cuentas correctos
3. ✅ Ajustar UI/UX según feedback
4. ✅ Documentación final

**Duración estimada:** 1-2 días

---

## 📈 RESUMEN DE ESFUERZO

**Total estimado:** 13-19 días de desarrollo

**Prioridad:**
- 🔴 **CRÍTICO:** Fase 1 (Fundación Contable) - Sin esto, nada funciona
- 🟠 **ALTO:** Fase 2, 3, 4 (Extensiones y IVA/FX)
- 🟡 **MEDIO:** Fase 5, 6, 7 (UI y Alertas)
- 🟢 **BAJO:** Fase 8, 9, 10 (Integraciones y Testing)

---

## ⚠️ CONSIDERACIONES IMPORTANTES

1. **Migración de Datos:**
   - Necesitamos migrar `cash_movements` y `payments` existentes a `ledger_movements`
   - Esto debe hacerse con cuidado para no perder información

2. **Compatibilidad Hacia Atrás:**
   - Mantener endpoints existentes funcionando durante la transición
   - Crear wrappers si es necesario

3. **Performance:**
   - `ledger_movements` será una tabla muy grande
   - Necesitamos índices apropiados
   - Considerar particionamiento por fecha si crece mucho

4. **Validaciones:**
   - Asegurar que TODO movimiento financiero pase por ledger
   - Validar que no se puedan crear movimientos fuera del flujo

5. **Testing:**
   - Probar especialmente el flujo completo: Lead → Operation → Ledger → IVA → Balances
   - Probar casos edge: múltiples monedas, FX, cancelaciones

---

## 🎯 CONCLUSIÓN

El sistema actual tiene una buena base, pero necesita una transformación significativa para cumplir con los requisitos contables completos. El cambio más crítico es la creación del `ledger_movements` como corazón contable, y la migración de toda la lógica existente para que pase por este ledger.

La implementación debe ser gradual, empezando por la fundación contable (Fase 1) y luego extendiendo funcionalidad por fases.

