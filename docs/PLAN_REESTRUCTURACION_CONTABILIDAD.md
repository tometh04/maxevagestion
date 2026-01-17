# 📊 PLAN DE REESTRUCTURACIÓN - MÓDULO DE CONTABILIDAD

**Fecha:** 2025-01-17  
**Estado:** 🟡 PLANIFICACIÓN - Pendiente de aprobación

---

## 🎯 OBJETIVO

Reestructurar completamente el módulo de Contabilidad para mejorar la gestión financiera, análisis de ganancias, pagos a proveedores, y control de gastos. La estructura partirá de Posición Contable Mensual como base para análisis de ganancias y distribución.

---

## 📋 ESTRUCTURA PROPUESTA DEL MÓDULO

1. **Posición Contable Mensual** (Base - a mejorar)
2. **Deudas por Ventas** (Mover desde Clientes → Contabilidad)
3. **Pagos a Proveedores/Operadores** (Mejorar sistema de carga masiva)
4. **Gastos Recurrentes** (Renombrar + categorías + filtros + gráficos)
5. **Cuentas Socios** (Corregir creación de socios)
6. **IVA** (Mantener como está)
7. **Libro Mayor** (Mantener como está)

---

## 1️⃣ POSICIÓN CONTABLE MENSUAL

### Estado Actual
- ✅ Existe `/accounting/monthly-position`
- ✅ Muestra posición contable por mes
- ⚠️ **FALTA:** Visualización de ganancia del mes, distribución en comisiones/gastos/participaciones, dolarización de saldos

### Mejoras Propuestas

#### 1.1. Visualización de Ganancia del Mes
- **Agregar sección de "Resumen del Mes"** que muestre:
  - Ingresos totales (ARS y USD)
  - Egresos totales (ARS y USD)
  - **Ganancia del mes** (diferencia)
  - Distribución de ganancia:
    - Comisiones
    - Gastos operativos
    - Participaciones societarias

#### 1.2. Dolarización de Saldos
- **Crear tabla de tipos de cambio mensual**
  - Nuevo modelo: `exchange_rates` o `monthly_exchange_rates`
  - Campos: `year`, `month`, `usd_to_ars_rate`, `created_at`, `updated_at`
- **Agregar selector de TC por mes** en la interfaz
- **Mostrar todos los saldos en USD** (convertir usando TC del mes)
- **Agregar columna comparativa** (ARS original / USD equivalente)

#### 1.3. Mejoras Visuales
- Gráficos de distribución de ganancias
- Comparativa mes a mes
- Exportar a Excel con ambos valores (ARS y USD)

### Archivos a Modificar/Crear
- `supabase/migrations/XXX_create_monthly_exchange_rates.sql` (NUEVO)
- `app/api/accounting/monthly-position/route.ts` (MODIFICAR)
- `components/accounting/monthly-position-page-client.tsx` (MODIFICAR)
- `lib/accounting/exchange-rates.ts` (NUEVO)
- `components/accounting/exchange-rate-selector.tsx` (NUEVO)

---

## 2️⃣ DEUDAS POR VENTAS

### Estado Actual
- ✅ Existe en `/customers/debtors` (módulo de Clientes)
- ✅ Muestra deudas por cliente
- ⚠️ **MOVER:** De Clientes → Contabilidad (es financiero)
- ⚠️ **FALTA:** Saldo en USD y pesos, filtros avanzados, descarga Excel

### Cambios Propuestos

#### 2.1. Reubicación
- **Mover** `/customers/debtors` → `/accounting/debts-sales`
- Actualizar navegación en sidebar
- Actualizar permisos (si es necesario)

#### 2.2. Mejoras de Funcionalidad
- **Agregar columna de saldo en USD** (convertir usando TC del mes de la operación)
- **Agregar columna de saldo en pesos** (original)
- **Filtros:**
  - Por moneda (ARS / USD / Ambas)
  - Por cliente (autocomplete)
  - Por fecha de viaje (rango de fechas)
- **Descarga a Excel:**
  - Incluir todas las columnas
  - Agrupar por cliente
  - Totales por moneda

#### 2.3. Visualización Mejorada
- Resumen de deudas totales (ARS y USD)
- Deudas vencidas destacadas
- Timeline de vencimientos

### Archivos a Modificar/Mover
- `app/(dashboard)/customers/debtors/page.tsx` → `app/(dashboard)/accounting/debts-sales/page.tsx` (MOVER)
- `components/customers/customers-debtors-page-client.tsx` → `components/accounting/debts-sales-page-client.tsx` (MOVER)
- `app/api/customers/debtors/route.ts` → `app/api/accounting/debts-sales/route.ts` (MOVER)
- `components/app-sidebar.tsx` (ACTUALIZAR navegación)
- `components/accounting/debts-sales-filters.tsx` (NUEVO)
- `components/accounting/debts-sales-export.tsx` (NUEVO)

---

## 3️⃣ PAGOS A PROVEEDORES/OPERADORES

### Estado Actual
- ✅ Existe `/accounting/operator-payments`
- ✅ Muestra pagos pendientes
- ⚠️ **PROBLEMA:** Carga individual es engorrosa cuando se pagan muchos FILES en una transferencia
- ⚠️ **FALTA:** Carga masiva, pagos parciales, conversor de moneda, filtros

### Mejoras Propuestas

#### 3.1. Sistema de Carga Masiva de Pagos
- **Nueva funcionalidad:** "Cargar Pago Masivo"
  - Botón "Cargar Pago" que abre dialog modal
  - **Filtros previos:**
    - Por operador (autocomplete)
    - Por moneda (ARS / USD)
    - Opcional: fecha de viaje
  - **Lista de operaciones pendientes** (según filtros)
  - **Selección múltiple** de operaciones (checkboxes)
  - **Monto total del pago** (suma de operaciones seleccionadas)
  - **Permitir modificar monto individual** de cada operación (para pagos parciales)
  - **Seleccionar cuenta de origen** (de dónde se paga)
  - **Comprobante único** (número de transferencia/recibo que aplica a todas)

#### 3.2. Pagos Parciales
- **Modificar monto a pagar** en cada operación individual
- **Calcular diferencia** (deuda pendiente = total - pagado)
- **Estado:** 
  - Si `monto_pagado < monto_total` → Mantener `operator_payment.status = PENDING` pero con `amount_paid` actualizado
  - Si `monto_pagado >= monto_total` → Marcar `operator_payment.status = PAID`
- **Nuevo campo:** `operator_payments.paid_amount` (default 0)
- **Múltiples pagos** pueden sumarse hasta completar

#### 3.3. Conversor de Moneda en Pagos
- **Campo "Tipo de Cambio"** (manual, editable)
- **Ejemplo:** Pago a Universal Assistance
  - Operación está en USD ($300 USD)
  - Pago se hace desde cuenta en ARS
  - Usuario ingresa TC manual (ej: 1200)
  - Se carga salida de banco: ARS 360,000
  - Pero en la operación impacta como: USD $300 pagado
  - El `ledger_movement` refleja la salida en ARS pero el `operator_payment` se marca como USD pagado

#### 3.4. Filtros Adicionales
- Por operador
- Por moneda
- Por fecha de viaje
- Por estado (PENDIENTE / PAGADO / PARCIAL)

#### 3.5. Mejoras en Visualización
- Indicador de pagos parciales
- Agrupar por operador
- Totales por moneda

### Archivos a Modificar/Crear
- `supabase/migrations/XXX_add_paid_amount_to_operator_payments.sql` (NUEVO)
- `app/api/accounting/operator-payments/route.ts` (MODIFICAR)
- `app/api/accounting/operator-payments/bulk-payment/route.ts` (NUEVO)
- `components/accounting/operator-payments-page-client.tsx` (MODIFICAR)
- `components/accounting/bulk-payment-dialog.tsx` (NUEVO)
- `components/accounting/operator-payment-row.tsx` (NUEVO - para edición individual)
- `lib/accounting/currency-converter.ts` (NUEVO)

---

## 4️⃣ GASTOS RECURRENTES

### Estado Actual
- ✅ Existe como "Pagos Recurrentes" (`/accounting/recurring-payments`)
- ✅ Sistema de carga funcional
- ⚠️ **CAMBIOS:** Renombrar, agregar categorías, filtros de fecha, análisis gráfico

### Cambios Propuestos

#### 4.1. Renombrar
- **"Pagos Recurrentes"** → **"Gastos Recurrentes"**
- Actualizar en sidebar, títulos, rutas (opcional mantener ruta para no romper enlaces)

#### 4.2. Sistema de Categorías
- **Nueva tabla:** `recurring_payment_categories`
  - Campos: `id`, `name`, `description`, `color` (para gráficos), `is_active`
- **Relación:** `recurring_payments.category_id` (FK)
- **UI:** Selector de categoría al crear/editar gasto recurrente
- **Categorías sugeridas:** Servicios, Alquiler, Marketing, Salarios, Impuestos, Otros

#### 4.3. Asignación de Categoría en Pagos
- Al registrar pago de gasto recurrente, **asignar categoría**
- Puede ser diferente a la categoría del gasto recurrente (para flexibilidad)

#### 4.4. Filtros de Fecha
- **Filtro principal:** Seleccionar mes/año
- **Vista mensual:** Solo gastos pagados en ese mes
- **Comparativa mensual:** Ver evolución mes a mes

#### 4.5. Análisis Gráfico
- **Gráfico de barras:** Gastos por categoría (mensual)
- **Gráfico de líneas:** Evolución de gastos por categoría (varios meses)
- **Gráfico de torta:** Distribución porcentual de gastos por categoría
- **Filtro de categoría:** Para ver solo una categoría específica

### Archivos a Modificar/Crear
- `supabase/migrations/XXX_add_categories_to_recurring_payments.sql` (NUEVO)
- `supabase/migrations/XXX_create_recurring_payment_categories.sql` (NUEVO)
- `app/api/accounting/recurring-payments/route.ts` (MODIFICAR)
- `app/api/accounting/recurring-payments/categories/route.ts` (NUEVO)
- `components/accounting/recurring-payments-page-client.tsx` (MODIFICAR)
- `components/accounting/recurring-payment-category-selector.tsx` (NUEVO)
- `components/accounting/recurring-payments-charts.tsx` (NUEVO)
- `components/accounting/recurring-payments-filters.tsx` (NUEVO)

---

## 5️⃣ CUENTAS SOCIOS

### Estado Actual
- ⚠️ **PROBLEMA:** No permite crear socio
- ⚠️ **PROBLEMA:** No se puede probar carga de retiro
- ✅ Existe `/accounting/partner-accounts`

### Correcciones Propuestas

#### 5.1. Permitir Creación de Socios
- **Revisar formulario** de creación de socio
- **Corregir validaciones** que puedan estar bloqueando
- **Verificar permisos** de creación
- **Agregar campos necesarios** si faltan

#### 5.2. Carga de Retiros
- **Revisar formulario** de retiro
- **Verificar que requiere cuenta financiera** (como está documentado)
- **Mejorar UX** si es necesario
- **Validar que se registra correctamente** en ledger

### Archivos a Modificar
- `components/accounting/partner-accounts-client.tsx` (REVISAR)
- `app/api/accounting/partner-accounts/route.ts` (REVISAR)
- `components/accounting/new-partner-dialog.tsx` (REVISAR - si existe)
- `components/accounting/partner-withdrawal-dialog.tsx` (REVISAR - si existe)

---

## 6️⃣ IVA

### Estado Actual
- ✅ Existe y funciona
- ✅ No requiere cambios según feedback

### Acción
- **MANTENER** como está
- Solo revisar si hay bugs menores

---

## 7️⃣ LIBRO MAYOR

### Estado Actual
- ✅ Existe y funciona
- ✅ No requiere cambios según feedback

### Acción
- **MANTENER** como está
- Solo revisar si hay bugs menores

---

## 📊 RESUMEN DE CAMBIOS

### Migraciones de Base de Datos Necesarias
1. ✅ `XXX_create_monthly_exchange_rates.sql` - Tipos de cambio mensuales
2. ✅ `XXX_add_paid_amount_to_operator_payments.sql` - Pagos parciales
3. ✅ `XXX_create_recurring_payment_categories.sql` - Categorías de gastos
4. ✅ `XXX_add_category_id_to_recurring_payments.sql` - Relación categoría-gasto

### Nuevos Componentes UI
- Exchange Rate Selector
- Bulk Payment Dialog
- Operator Payment Row (editable)
- Recurring Payment Category Selector
- Recurring Payments Charts
- Recurring Payments Filters
- Debts Sales Filters
- Debts Sales Export

### Componentes a Mover
- `customers-debtors-page-client.tsx` → `accounting/debts-sales-page-client.tsx`
- `app/(dashboard)/customers/debtors/page.tsx` → `app/(dashboard)/accounting/debts-sales/page.tsx`
- `app/api/customers/debtors/route.ts` → `app/api/accounting/debts-sales/route.ts`

### Componentes a Modificar Significativamente
- `monthly-position-page-client.tsx` - Agregar ganancias, dolarización
- `operator-payments-page-client.tsx` - Carga masiva, pagos parciales, TC
- `recurring-payments-page-client.tsx` - Categorías, filtros, gráficos
- `partner-accounts-client.tsx` - Correcciones creación socios

---

## 🚀 ORDEN DE IMPLEMENTACIÓN SUGERIDO

1. **Cuentas Socios** (Corrección rápida - bloqueante)
2. **Gastos Recurrentes** (Categorías y filtros - relativamente independiente)
3. **Deudas por Ventas** (Mover y mejorar - impacto medio)
4. **Pagos a Proveedores** (Carga masiva - complejo pero importante)
5. **Posición Contable Mensual** (Mejoras y dolarización - requiere TC)

---

## ⚠️ CONSIDERACIONES TÉCNICAS

### Tipos de Cambio
- Necesitamos tabla para TC histórico por mes
- TC puede ser manual o automático (empezar con manual)
- Usar TC del mes correspondiente para dolarización histórica

### Pagos Parciales
- Cambio en modelo de datos: agregar `paid_amount` a `operator_payments`
- Lógica: `debt = amount - paid_amount`
- Estado: `PENDING` si `paid_amount < amount`, `PAID` si `paid_amount >= amount`

### Conversión de Moneda en Pagos
- Campo `exchange_rate` ya existe en `payments` y `ledger_movements`
- Necesitamos permitir entrada manual
- Validar que la conversión sea correcta

---

## 📝 NOTAS ADICIONALES

- Mantener compatibilidad hacia atrás donde sea posible
- Agregar validaciones apropiadas en todos los formularios
- Documentar cambios en `DOCUMENTACION_MEJORAS_Y_CAMBIOS.md`
- Probar cada funcionalidad antes de pasar a la siguiente

---

**Próximo paso:** Revisar y aprobar este plan. Luego comenzar implementación paso a paso según orden sugerido.
