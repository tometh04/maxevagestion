# Plan de Acción - Feedback Caja y Contabilidad
**Fecha:** 2025-01-19  
**Fuente:** Audio del cliente transcrito

---

## 📊 ANÁLISIS POR PUNTO

### 🟢 **CAJA - ESTRUCTURA GENERAL**

#### ✅ **YA IMPLEMENTADO:**
- ✅ División en 3 tabs: Resumen, Caja USD, Caja ARS
- ✅ Cada cuenta individual muestra ingresos, egresos, balance
- ✅ Movimientos centralizados por cuenta para reconciliación
- ✅ Desglose de cuentas individuales en tabs USD/ARS

#### ⚠️ **REQUIERE AJUSTE:**
1. **Resumen debe mostrar solo saldos de cuentas** (lo que hoy es "Cuentas Financieras")
   - ❌ Actualmente muestra KPIs agregados (Total ARS, Total USD, Efectivo ARS, Efectivo USD)
   - ❌ Muestra gráfico de evolución general
   - ❌ Cliente dice: "sigue figurando la posición de caja que no da información real, ingresos y egresos por separado"
   - ✅ **DEBE:** Mostrar solo lista de todas las cuentas con sus saldos (como "Cuentas Financieras")
   - ✅ **DEBE:** Eliminar ingresos/egresos generales del resumen

2. **Asociar movimientos a cuentas específicas, no a ingresos/egresos generales**
   - ✅ Ya está implementado: los movimientos se filtran por `accountId`
   - ⚠️ Verificar que no haya movimientos "sin cuenta" que aparezcan en resumen general

---

### 🔴 **DEUDORES POR VENTAS - CONVERSOR DE MONEDA**

#### ❌ **NO IMPLEMENTADO:**
**Problema:** Si cargo una cobranza en pesos para una operación en dólares, no me pide tipo de cambio.

**Estado actual:**
- `mark-paid-dialog.tsx` NO compara moneda del pago vs moneda de la operación
- Solo pide tipo de cambio si `payment.currency === "ARS"` (línea 832 de `operation-payments-section.tsx`)
- No valida si la operación está en USD y el pago en ARS

**Lo que falta:**
1. Obtener moneda de la operación al abrir `mark-paid-dialog`
2. Comparar moneda del pago con moneda de la operación
3. Si difieren, pedir tipo de cambio OBLIGATORIO
4. Mostrar conversión en tiempo real (equivalente en moneda de operación)

---

### 🟡 **PAGO A OPERADORES - CONVERSOR DE MONEDA**

#### ✅ **PARCIALMENTE IMPLEMENTADO:**
**Estado actual:**
- ✅ `bulk-payment-dialog.tsx` tiene conversor cuando cuenta difiere de deuda
- ✅ Detecta automáticamente cuando se necesita TC

#### ⚠️ **VERIFICAR:**
- ¿Funciona para pagos individuales? (no solo masivos)
- ¿Funciona desde otras pantallas de pago a operadores?

**Acción requerida:**
- Revisar si hay otros puntos de entrada para pagos a operadores
- Verificar que TODOS pidan TC cuando moneda difiere

---

### 🟡 **GASTOS RECURRENTES - CLARIFICACIÓN DE FLUJO**

#### ✅ **YA IMPLEMENTADO:**
- ✅ Dialog de pago (`PayRecurringExpenseDialog`) con:
  - Selección de cuenta financiera
  - Conversor de moneda
  - Actualización de `next_due_date`
- ✅ Creación de gasto recurrente separada del pago

#### ⚠️ **REQUIERE MEJORA:**
**Cliente dice:** "No entiendo bien la funcionalidad, por un lado se carga el gasto, por otro el pago"

**Acción requerida:**
1. Mejorar UX/UI para aclarar el flujo:
   - Crear gasto = definir gasto futuro recurrente
   - Pagar gasto = procesar un pago del gasto
2. Agregar tooltips o ayuda visual
3. Tal vez un botón "¿Cómo funciona?" con explicación

---

### 🔴 **CUENTAS SOCIOS - FUNCIONALIDADES FALTANTES**

#### ✅ **YA IMPLEMENTADO:**
- ✅ Crear socio
- ✅ Registrar retiro con conversor de moneda
- ✅ Retiro impacta en caja

#### ❌ **NO IMPLEMENTADO:**

1. **Distribución de ganancias desde Posición Mensual:**
   - ❌ NO existe funcionalidad para distribuir ganancias del mes anterior
   - ❌ NO existe integración entre Posición Mensual → Cuentas Socios
   - ❌ NO existe cálculo automático según porcentajes de socios

2. **Tracking de deuda de socio (si gasta más de lo que tiene):**
   - ❌ NO se calcula si socio gastó más que su asignación
   - ❌ NO se muestra como activo/deudor en Posición Mensual
   - ❌ NO aparece en "Deudores varios" o similar

**Lo que falta implementar:**
- Tabla de porcentajes de socios
- Endpoint para distribuir ganancias desde Posición Mensual
- Cálculo de deuda activa cuando socio gasta más de lo asignado
- Mostrar en Posición Mensual como "Cuentas por Cobrar - Socios" si hay deuda

---

## 📋 PLAN DE ACCIÓN PRIORIZADO

### **PRIORIDAD ALTA (Crítico - Bloquea funcionalidad)**

#### **1. Conversor de moneda en Deudores por Ventas** 🔴
**Estado:** ❌ No implementado  
**Archivos a modificar:**
- `components/payments/mark-paid-dialog.tsx`
- `app/api/payments/mark-paid/route.ts`

**Cambios:**
- Obtener `operation.currency` al abrir dialog
- Comparar `payment.currency` vs `operation.currency`
- Si difieren, mostrar campo de TC obligatorio
- Calcular y mostrar equivalente en moneda de operación

---

#### **2. Ajustar Resumen de Caja** 🟡
**Estado:** ⚠️ Parcialmente implementado (muestra cosas que no debería)  
**Archivos a modificar:**
- `components/cash/cash-summary-client.tsx`

**Cambios:**
- **Eliminar del Resumen:**
  - KPIs agregados (Total ARS, Total USD, Efectivo ARS, Efectivo USD)
  - Gráfico de evolución general
  - Ingresos/egresos generales
- **Mantener en Resumen:**
  - Lista de todas las cuentas con saldos (como "Cuentas Financieras")
  - Solo mostrar: Nombre cuenta, Tipo, Saldo actual
- **Mover a tabs individuales:**
  - Gráficos de evolución (solo en tabs USD/ARS)
  - Ingresos/egresos detallados (solo en tabs USD/ARS)

---

### **PRIORIDAD MEDIA (Importante - Mejora UX)**

#### **3. Verificar conversor en todos los pagos a operadores** 🟡
**Estado:** ⚠️ Verificar cobertura completa  
**Acción:**
- Revisar TODOS los puntos donde se puede pagar a operadores
- Asegurar que todos pidan TC cuando moneda difiere

---

#### **4. Mejorar claridad de flujo en Gastos Recurrentes** 🟡
**Estado:** ✅ Funcional pero confuso  
**Cambios:**
- Agregar tooltips/explicaciones
- Mejorar textos descriptivos
- Tal vez un modal de ayuda "¿Cómo funciona?"

---

### **PRIORIDAD BAJA (Funcionalidad nueva - Requiere diseño)**

#### **5. Distribución de ganancias a socios desde Posición Mensual** 🔴
**Estado:** ❌ No implementado (nueva funcionalidad)  
**Requisitos:**
- Tabla de porcentajes de socios (¿en configuración? ¿en cada socio?)
- Botón/acción en Posición Mensual para "Distribuir ganancias"
- Calcular según porcentajes y crear "asignaciones" a cada socio
- Impactar en "Cuenta Socio" de cada uno

**Archivos nuevos:**
- `components/accounting/distribute-profits-dialog.tsx`
- `app/api/partner-accounts/distribute-profits/route.ts`
- Migración para agregar `profit_allocation` table

---

#### **6. Tracking de deuda de socios** 🔴
**Estado:** ❌ No implementado (nueva funcionalidad)  
**Requisitos:**
- Calcular si `total_withdrawn > total_allocated`
- Mostrar diferencia como deuda activa
- Integrar en Posición Mensual como "Cuentas por Cobrar - Socios"
- O agregar en "Deudores varios"

**Archivos a modificar:**
- `app/api/accounting/monthly-position/route.ts`
- `components/accounting/partner-accounts-client.tsx`
- `app/api/partner-accounts/route.ts` (agregar cálculo de deuda)

---

## 🎯 RESUMEN DE ESTADO

### ✅ **COMPLETADO:**
1. ✅ División de Caja en 3 secciones
2. ✅ Desglose de cuentas individuales USD/ARS
3. ✅ Movimientos centralizados por cuenta
4. ✅ Conversor en Pago Masivo a Operadores
5. ✅ Conversor en Retiros de Socios
6. ✅ Flujo de pago en Gastos Recurrentes

### ⚠️ **REQUIERE AJUSTE:**
1. ⚠️ Resumen de Caja (eliminar ingresos/egresos generales)
2. ⚠️ Verificar cobertura completa de conversor en pagos a operadores
3. ⚠️ Mejorar claridad en Gastos Recurrentes

### ❌ **PENDIENTE (Nuevo):**
1. ❌ Conversor de moneda en Deudores por Ventas (marcar como pagado)
2. ❌ Distribución de ganancias a socios desde Posición Mensual
3. ❌ Tracking de deuda de socios (gastó más de lo asignado)

---

## 📝 NOTAS ADICIONALES

- El cliente menciona que "si vemos que esto se complica, armamos un meet"
- Sugiere revisar cómo impactan las cosas en las cuentas
- Enfoque: control y conciliación son prioridad
- Todo debe estar asociado a cuentas específicas, no a agregados generales

---

**Próximo paso:** Ejecutar prioridad alta primero, luego media, luego baja (o meet si se complica)
