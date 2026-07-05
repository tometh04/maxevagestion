# 📋 PLAN PASO A PASO - REESTRUCTURACIÓN DE CONTABILIDAD

**Fecha:** 2025-01-17  
**Estado:** 🟢 EN PROGRESO

---

## 🎯 RESUMEN EJECUTIVO

Este documento detalla el plan paso a paso para reestructurar completamente el módulo de Contabilidad, mejorando análisis financiero, gestión de pagos masivos, control de gastos y visualización de ganancias.

---

## 📊 ORDEN DE IMPLEMENTACIÓN

### ✅ COMPLETADO
1. **Deudas por Ventas** - Ya movido de Clientes → Contabilidad ✅

### 🟡 EN PROGRESO
2. **Pagos a Proveedores** - Sistema de carga masiva

### ⬜ PENDIENTE (en orden)
3. **Gastos Recurrentes** - Renombrar, categorías, filtros, gráficos
4. **Posición Contable Mensual** - Dolarización y análisis de ganancias
5. **Cuentas Socios** - Revisar problema de creación
6. **Cuentas Financieras** - Actualizar para mostrar saldos actuales

---

## 1️⃣ POSICIÓN CONTABLE MENSUAL

### 📌 Objetivo
Mostrar ganancia del mes, distribuirla en comisiones/gastos/participaciones, y dolarizar todos los saldos para análisis homogéneo.

### 🔍 Estado Actual
- ✅ Existe `/accounting/monthly-position`
- ✅ Muestra posición contable básica
- ❌ No muestra ganancia del mes claramente
- ❌ No dolariza saldos
- ❌ No permite configurar TC mensual

### 📝 Paso a Paso

#### Paso 1.1: Crear Tabla de Tipos de Cambio Mensual
**Archivo:** `supabase/migrations/084_create_monthly_exchange_rates.sql`
```sql
CREATE TABLE IF NOT EXISTS monthly_exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  usd_to_ars_rate NUMERIC(18,4) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(year, month)
);

CREATE INDEX idx_monthly_exchange_rates_year_month ON monthly_exchange_rates(year, month);
```

#### Paso 1.2: API para Gestionar TC Mensual
**Archivo:** `app/api/accounting/monthly-exchange-rates/route.ts`
- `GET` - Obtener TC de un mes específico
- `POST/PUT` - Crear/actualizar TC de un mes

#### Paso 1.3: Selector de TC en UI
**Archivo:** `components/accounting/monthly-exchange-rate-selector.tsx`
- Dropdown/input para seleccionar mes/año
- Input para ingresar TC manual
- Botón "Guardar TC"

#### Paso 1.4: Modificar API de Posición Mensual
**Archivo:** `app/api/accounting/monthly-position/route.ts`

**Cambios:**
1. Obtener TC del mes seleccionado
2. Convertir todos los saldos a USD usando TC del mes
3. Agregar sección "Resumen del Mes":
   - Ingresos totales (ARS + USD convertido)
   - Egresos totales (ARS + USD convertido)
   - **Ganancia del mes** = Ingresos - Egresos
   - Distribución de ganancia:
     - Comisiones (de `commissions`)
     - Gastos operativos (de `recurring_payments`)
     - Participaciones societarias (de `partner_withdrawals`)

**Respuesta API actualizada:**
```typescript
{
  balances: { ... },
  balancesUSD: { ... }, // Convertido usando TC del mes
  monthlySummary: {
    incomeARS: number,
    incomeUSD: number,
    expensesARS: number,
    expensesUSD: number,
    profitARS: number,
    profitUSD: number,
    distribution: {
      commissions: number,
      operatingExpenses: number,
      partnerShares: number
    }
  },
  exchangeRate: number
}
```

#### Paso 1.5: Actualizar UI de Posición Mensual
**Archivo:** `components/accounting/monthly-position-page-client.tsx`

**Cambios:**
1. Agregar selector de TC mensual arriba
2. Mostrar dos columnas: "ARS Original" | "USD (TC: X.XX)"
3. Agregar sección "Resumen del Mes" con:
   - Cards KPI: Ingresos, Egresos, Ganancia
   - Gráfico de distribución (pie chart)
   - Tabla de desglose por categoría

**Tiempo estimado:** 4-5 horas

---

## 2️⃣ DEUDAS POR VENTAS (COMPLETADO ✅)

### ✅ Estado
- Ya movido de `/customers/debtors` → `/accounting/debts-sales`
- Cálculos en USD corregidos
- Conversión ARS → USD usando TC histórico

### 📝 Mejoras Pendientes

#### Paso 2.1: Agregar Filtros
**Archivo:** `components/accounting/debts-sales-page-client.tsx`

**Filtros a agregar:**
1. **Por moneda:** Dropdown (ARS / USD / Todas)
2. **Por cliente:** Autocomplete con búsqueda
3. **Por fecha de viaje:** DateRangePicker (fecha desde - fecha hasta)

**Modificar API:** `app/api/accounting/debts-sales/route.ts`
- Agregar query params: `currency`, `customerId`, `dateFrom`, `dateTo`

#### Paso 2.2: Agregar Columnas de Saldo
**Cambios en tabla:**
- "Saldo ARS" (si la operación está en ARS)
- "Saldo USD" (convertido)
- Mostrar ambas columnas siempre

#### Paso 2.3: Exportar a Excel
**Archivo:** `components/accounting/debts-sales-export-button.tsx`
- Usar librería `xlsx` o `exceljs`
- Exportar todas las columnas
- Agrupar por cliente
- Totales por moneda al final

**Tiempo estimado:** 2-3 horas

---

## 3️⃣ PAGOS A PROVEEDORES/OPERADORES

### 📌 Objetivo
Permitir cargar múltiples pagos en una sola transacción, con pagos parciales y conversor de moneda.

### 🔍 Estado Actual
- ✅ Existe `/accounting/operator-payments`
- ✅ Muestra pagos pendientes
- ❌ Solo permite pago individual
- ❌ No permite pagos parciales
- ❌ No tiene conversor de moneda en pago masivo

### 📝 Paso a Paso

#### Paso 3.1: Agregar Campo `paid_amount` a Operator Payments
**Archivo:** `supabase/migrations/085_add_paid_amount_to_operator_payments.sql`
```sql
ALTER TABLE operator_payments
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(18,2) DEFAULT 0;

COMMENT ON COLUMN operator_payments.paid_amount IS 'Monto parcialmente pagado (para pagos parciales)';
```

#### Paso 3.2: Crear Dialog de Pago Masivo
**Archivo:** `components/accounting/bulk-payment-dialog.tsx`

**Funcionalidad:**
1. **Filtros previos:**
   - Selector de Operador (dropdown)
   - Selector de Moneda (ARS / USD)
   - Opcional: DateRangePicker (fecha de viaje)

2. **Lista de operaciones pendientes:**
   - Tabla con checkboxes
   - Columnas: Operación, Cliente, Monto Total, Pagado, Pendiente, Monto a Pagar
   - Input editable en "Monto a Pagar" para cada operación

3. **Resumen del pago:**
   - Total seleccionado
   - Cantidad de operaciones
   - Si hay mezcla ARS/USD: mostrar conversor de moneda

4. **Conversor de moneda (si aplica):**
   - Si pago es en ARS pero operación en USD (o viceversa)
   - Campo "Tipo de Cambio" (editable manual)
   - Mostrar equivalente en ambas monedas

5. **Información del pago:**
   - Selector de cuenta financiera origen
   - Input número de comprobante/transferencia
   - Input fecha de pago
   - Textarea notas

#### Paso 3.3: API para Pago Masivo
**Archivo:** `app/api/accounting/operator-payments/bulk/route.ts`

**Endpoint:** `POST /api/accounting/operator-payments/bulk`

**Body:**
```typescript
{
  payments: Array<{
    operator_payment_id: string,
    amount_to_pay: number, // Puede ser parcial
    operation_id: string
  }>,
  payment_account_id: string, // Cuenta financiera origen
  payment_method: "TRANSFER" | "CASH" | "CHECK",
  payment_currency: "ARS" | "USD", // Moneda del pago (puede diferir de la operación)
  exchange_rate?: number, // Si hay conversión de moneda
  receipt_number: string,
  payment_date: string,
  notes?: string
}
```

**Lógica:**
1. Para cada `operator_payment_id`:
   - Actualizar `paid_amount += amount_to_pay`
   - Si `paid_amount >= amount` → cambiar `status` a `PAID`
   - Crear `ledger_movement` en cuenta origen (EXPENSE)
   - Si hay conversión de moneda:
     - `ledger_movement.currency` = moneda del pago
     - `ledger_movement.amount_original` = monto en moneda de pago
     - `ledger_movement.exchange_rate` = TC usado
     - `ledger_movement.amount_ars_equivalent` = convertido

2. Crear un `payment` record con todos los detalles

#### Paso 3.4: Actualizar UI Principal
**Archivo:** `components/accounting/operator-payments-page-client.tsx`

**Cambios:**
1. Agregar botón "Cargar Pago Masivo" (arriba a la derecha)
2. Mostrar indicador de pagos parciales (badge "Parcial" si `paid_amount > 0 && paid_amount < amount`)
3. Agregar filtros en la parte superior:
   - Operador
   - Moneda
   - Fecha de viaje

**Tiempo estimado:** 6-8 horas

---

## 4️⃣ GASTOS RECURRENTES

### 📌 Objetivo
Renombrar, agregar categorías, filtros mensuales y análisis gráfico.

### 🔍 Estado Actual
- ✅ Existe como "Pagos Recurrentes" (`/accounting/recurring-payments`)
- ✅ Sistema de carga funcional
- ❌ No tiene categorías
- ❌ No tiene filtros de fecha
- ❌ No tiene análisis gráfico

### 📝 Paso a Paso

#### Paso 4.1: Renombrar en UI
**Archivos a modificar:**
- `components/app-sidebar.tsx` - "Pagos Recurrentes" → "Gastos Recurrentes"
- `components/accounting/recurring-payments-page-client.tsx` - Títulos y labels
- `app/(dashboard)/accounting/recurring-payments/page.tsx` - Metadata title

**NOTA:** Mantener ruta `/accounting/recurring-payments` para no romper enlaces.

#### Paso 4.2: Crear Tabla de Categorías
**Archivo:** `supabase/migrations/086_create_recurring_payment_categories.sql`
```sql
CREATE TABLE IF NOT EXISTS recurring_payment_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#3b82f6', -- Color para gráficos
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Categorías iniciales
INSERT INTO recurring_payment_categories (name, description, color) VALUES
  ('Servicios', 'Servicios públicos, internet, teléfono', '#ef4444'),
  ('Alquiler', 'Alquiler de oficinas, locales', '#f59e0b'),
  ('Marketing', 'Publicidad, redes sociales, campañas', '#10b981'),
  ('Salarios', 'Sueldos y cargas sociales', '#3b82f6'),
  ('Impuestos', 'Impuestos y tasas', '#8b5cf6'),
  ('Otros', 'Otros gastos recurrentes', '#6b7280')
ON CONFLICT (name) DO NOTHING;

-- Agregar columna category_id a recurring_payments
ALTER TABLE recurring_payments
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES recurring_payment_categories(id);
```

#### Paso 4.3: Agregar Categoría al Formulario de Pago
**Archivo:** `components/accounting/recurring-payments-page-client.tsx`

**Cambios:**
1. Agregar selector de categoría en formulario de crear gasto recurrente
2. Agregar selector de categoría al registrar pago (puede ser diferente a la del gasto)

#### Paso 4.4: API de Categorías
**Archivo:** `app/api/accounting/recurring-payments/categories/route.ts`
- `GET` - Listar todas las categorías activas
- `POST` - Crear nueva categoría (solo ADMIN)
- `PUT` - Actualizar categoría
- `DELETE` - Desactivar categoría

#### Paso 4.5: Filtros de Fecha
**Archivo:** `components/accounting/recurring-payments-filters.tsx` (NUEVO)

**Filtros:**
1. Selector de Mes/Año (month/year picker)
2. Selector de Categoría (dropdown con todas las categorías)
3. Botón "Aplicar Filtros"

**Modificar API:** `app/api/accounting/recurring-payments/route.ts`
- Agregar query params: `year`, `month`, `categoryId`

#### Paso 4.6: Gráficos de Análisis
**Archivo:** `components/accounting/recurring-payments-charts.tsx` (NUEVO)

**Gráficos:**
1. **Gráfico de Barras:** Gastos por categoría (mensual)
   - Usar `recharts` o similar
   - Eje X: Categorías
   - Eje Y: Monto total

2. **Gráfico de Líneas:** Evolución de gastos por categoría (varios meses)
   - Eje X: Meses
   - Eje Y: Monto
   - Líneas por categoría

3. **Gráfico de Torta:** Distribución porcentual por categoría
   - Mostrar porcentaje de cada categoría

**API para datos de gráficos:**
`GET /api/accounting/recurring-payments/analytics?year=2025&month=1&categoryId=...`

**Tiempo estimado:** 5-6 horas

---

## 5️⃣ CUENTAS SOCIOS

### 📌 Objetivo
Revisar y corregir problema de creación de socios.

### 🔍 Estado Actual
- ✅ Existe `/accounting/partner-accounts`
- ❌ Usuario reporta que no puede crear socio

### 📝 Paso a Paso

#### Paso 5.1: Debug y Diagnóstico
**Verificar:**
1. ¿El usuario tiene rol `SUPER_ADMIN`? (solo ellos pueden crear)
2. ¿Hay errores en consola del navegador?
3. ¿Hay errores en logs de API?

#### Paso 5.2: Revisar Validaciones
**Archivo:** `app/api/partner-accounts/route.ts`
- Verificar validación de `name` (trim, no vacío)
- Verificar permisos de usuario
- Agregar logs detallados

#### Paso 5.3: Test de Creación
- Crear socio de prueba
- Verificar que se guarda en BD
- Verificar que aparece en lista

**Tiempo estimado:** 1 hora (debug)

---

## 6️⃣ CUENTAS FINANCIERAS (Registro de Pago en Finanzas)

### 📌 Objetivo
Actualizar "Cuentas Financieras" para mostrar saldos actuales de todas las cuentas (bancarias, cajas, cuentas por cobrar/pagar) en USD y ARS.

### 🔍 Estado Actual
- ✅ Existe `/accounting/financial-accounts`
- ⚠️ Puede no estar mostrando saldos actuales correctamente

### 📝 Paso a Paso

#### Paso 6.1: Verificar Cálculo de Saldos
**Archivo:** `app/api/accounting/financial-accounts/route.ts`

**Verificar:**
1. Usa `getAccountBalance()` correctamente
2. Muestra saldos en ARS y USD
3. Agrupa por tipo de cuenta

#### Paso 6.2: Agregar Saldos de Cuentas por Cobrar/Pagar
**Cambios en API:**
- Agregar cálculo de "Cuentas por Cobrar" (de `operations` con pagos pendientes)
- Agregar cálculo de "Cuentas por Pagar" (de `operator_payments` pendientes)
- Mostrar en tabla separada

#### Paso 6.3: Mejorar Visualización
**Archivo:** `components/accounting/financial-accounts-page-client.tsx`

**Cambios:**
1. Agrupar por tipo: Cajas, Bancos, Por Cobrar, Por Pagar
2. Mostrar dos columnas: "ARS" | "USD"
3. Total general en ambas monedas
4. Cards KPI con resumen

**Tiempo estimado:** 2-3 horas

---

## 📋 CHECKLIST DE IMPLEMENTACIÓN

### Fase 1: Fundamentos (Completado ✅)
- [x] Mover Deudas por Ventas a Contabilidad
- [x] Corregir conversiones ARS/USD en todo el sistema

### Fase 2: Pagos Masivos (Prioridad Alta)
- [ ] Agregar `paid_amount` a `operator_payments`
- [ ] Crear dialog de pago masivo
- [ ] API de pago masivo con conversión de moneda
- [ ] Actualizar UI principal

### Fase 3: Gastos Recurrentes
- [ ] Renombrar en UI
- [ ] Crear tabla de categorías
- [ ] Agregar categorías a formularios
- [ ] Filtros de fecha
- [ ] Gráficos de análisis

### Fase 4: Posición Mensual
- [ ] Tabla de TC mensual
- [ ] Selector de TC en UI
- [ ] Dolarizar saldos en API
- [ ] Mostrar ganancia del mes
- [ ] Distribución de ganancias

### Fase 5: Cuentas Socios
- [ ] Debug creación de socios
- [ ] Corregir si hay problema

### Fase 6: Cuentas Financieras
- [ ] Verificar cálculo de saldos
- [ ] Agregar cuentas por cobrar/pagar
- [ ] Mejorar visualización

---

## 🎯 PRÓXIMOS PASOS INMEDIATOS

1. **Comenzar con Paso 3.1** - Agregar `paid_amount` a operator_payments
2. Continuar con el sistema de pago masivo (Paso 3.2, 3.3, 3.4)
3. Después pasar a Gastos Recurrentes (Paso 4)

---

**Última actualización:** 2025-01-17
