# 🗺️ MAPA DE ACCIONES DEL SISTEMA

Este documento detalla **qué hace cada acción** y **qué módulos afecta**. 
Es la guía para entender cómo están (o deberían estar) conectadas todas las partes del ERP.

---

## 📊 LEYENDA

| Símbolo | Significado |
|---------|-------------|
| ✅ | Implementado y funcionando |
| ⚠️ | Implementado parcialmente |
| ❌ | NO implementado (debería estarlo) |
| 🔄 | Reversible (tiene acción inversa) |

---

## 1️⃣ OPERACIONES

### 📥 CREAR OPERACIÓN

**Disparadores:** 
- Botón "Nueva Operación"
- Convertir Lead a Operación

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Crear registro | ✅ | `operations` | Datos básicos de la operación |
| Generar código único | ✅ | `operations.file_code` | Formato: AAMMDD-XXX |
| Crear IVA Ventas | ✅ | `iva_sales` | 21% sobre sale_amount_total |
| Crear IVA Compras | ✅ | `iva_purchases` | 21% sobre operator_cost |
| Crear cuenta a pagar operador | ✅ | `operator_payments` | Con fecha de vencimiento calculada |
| Crear/asociar cliente | ✅ | `customers`, `operation_customers` | Solo si viene de lead |
| Transferir movimientos de lead | ✅ | `ledger_movements` | Cambia lead_id → operation_id |
| Actualizar lead a WON | ✅ | `leads.status` | Solo si viene de lead |

**❌ FALTANTE al CREAR:**
- NO genera alertas de check-in/check-out automáticamente
- NO genera alertas de cumpleaños de pasajeros

---

### ✏️ EDITAR OPERACIÓN

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Actualizar datos | ✅ | `operations` | Recalcula margen |
| Generar alerta docs faltantes | ✅ | `alerts` | Si status = CONFIRMED/RESERVED |
| Calcular comisiones | ✅ | `commissions` | Si status = CONFIRMED/CLOSED |
| Actualizar IVA si cambian montos | ❌ | `iva_sales`, `iva_purchases` | **NO IMPLEMENTADO** |
| Actualizar operator_payment si cambia costo | ❌ | `operator_payments` | **NO IMPLEMENTADO** |

---

### 🗑️ ELIMINAR OPERACIÓN

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Eliminar operación | ❌ | `operations` | **NO HAY ENDPOINT DELETE** |
| Eliminar IVA asociado | ❌ | `iva_sales`, `iva_purchases` | CASCADE en DB |
| Eliminar pagos | ❌ | `payments` | CASCADE en DB |
| Eliminar operator_payment | ❌ | `operator_payments` | CASCADE en DB |
| Eliminar alertas | ❌ | `alerts` | CASCADE en DB |
| Revertir ledger_movements | ❌ | `ledger_movements` | **QUEDAN HUÉRFANOS** |
| Revertir lead a IN_PROGRESS | ❌ | `leads.status` | **NO SE HACE** |

**⚠️ PROBLEMA:** No existe forma de eliminar una operación desde la UI.

---

## 2️⃣ PAGOS

### 📥 CREAR PAGO (CORREGIDO ✅)

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Crear registro de pago | ✅ | `payments` | Con referencia a ledger |
| Crear movimiento libro mayor | ✅ 🔄 | `ledger_movements` | Tipo INCOME/EXPENSE/OPERATOR_PAYMENT |
| Crear movimiento de caja | ✅ 🔄 | `cash_movements` | Con referencia al pago |
| Marcar operator_payment como PAID | ✅ 🔄 | `operator_payments` | Si es pago a operador |
| Actualizar balance cuenta financiera | ✅ | `financial_accounts` | Via ledger_movement |

---

### 🗑️ ELIMINAR PAGO (IMPLEMENTADO ✅)

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Eliminar pago | ✅ | `payments` | |
| Eliminar ledger_movement | ✅ | `ledger_movements` | Revierte balance |
| Eliminar cash_movement | ✅ | `cash_movements` | |
| Revertir operator_payment a PENDING | ✅ | `operator_payments` | |

---

## 3️⃣ LEADS

### 📥 CREAR LEAD

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Crear registro | ✅ | `leads` | |
| Crear ledger_movement si tiene depósito | ✅ | `ledger_movements` | Tipo INCOME |
| Crear tarjeta en Trello | ✅ | Externa (Trello) | Si está configurado |

---

### ✏️ ACTUALIZAR LEAD

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Actualizar datos | ✅ | `leads` | |
| Actualizar/crear ledger si cambia depósito | ✅ | `ledger_movements` | |
| Sincronizar con Trello | ✅ | Externa (Trello) | |

---

### 🔄 CONVERTIR LEAD → OPERACIÓN

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Todo lo de CREAR OPERACIÓN | ✅ | Múltiples | Ver arriba |
| Cambiar status a WON | ✅ | `leads.status` | |
| Transferir ledger_movements | ✅ | `ledger_movements` | lead_id → operation_id |

---

### 🗑️ ELIMINAR LEAD

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Eliminar lead | ⚠️ | `leads` | Existe endpoint |
| Eliminar documentos asociados | ✅ | `documents` | CASCADE |
| Eliminar ledger_movements | ❌ | `ledger_movements` | **QUEDAN HUÉRFANOS** |
| Eliminar de Trello | ❌ | Externa | **NO SE HACE** |

---

## 4️⃣ CLIENTES

### 📥 CREAR CLIENTE

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Crear registro | ✅ | `customers` | |

---

### 🗑️ ELIMINAR CLIENTE

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Eliminar cliente | ⚠️ | `customers` | Puede fallar si tiene operaciones |
| Desasociar de operaciones | ❌ | `operation_customers` | **DEBERÍA PREGUNTAR** |

---

## 5️⃣ DOCUMENTOS

### 📥 SUBIR DOCUMENTO

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Subir a storage | ✅ | Supabase Storage | |
| Crear registro | ✅ | `documents` | |
| Ejecutar OCR | ✅ | `documents.scanned_data` | Si es pasaporte/DNI |
| Generar alerta vencimiento | ⚠️ | `alerts` | Solo con endpoint manual |

---

### 🗑️ ELIMINAR DOCUMENTO

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Eliminar de storage | ✅ | Supabase Storage | |
| Eliminar registro | ✅ | `documents` | |
| Eliminar alertas asociadas | ❌ | `alerts` | **NO SE HACE** |

---

## 6️⃣ COMISIONES

### 📥 PAGAR COMISIÓN

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Crear ledger_movement COMMISSION | ✅ | `ledger_movements` | |
| Marcar comisión como PAID | ✅ | `commissions.status` | Automático via trigger |

---

### 🗑️ REVERTIR PAGO COMISIÓN

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Eliminar ledger_movement | ❌ | `ledger_movements` | **NO IMPLEMENTADO** |
| Revertir comisión a PENDING | ❌ | `commissions.status` | **NO IMPLEMENTADO** |

---

## 7️⃣ MOVIMIENTOS DE CAJA

### 📥 CREAR MOVIMIENTO

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Crear cash_movement | ✅ | `cash_movements` | |
| Crear ledger_movement | ✅ | `ledger_movements` | |
| Actualizar balance cuenta | ✅ | `financial_accounts` | Via ledger |

---

### 🗑️ ELIMINAR MOVIMIENTO

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Eliminar cash_movement | ❌ | `cash_movements` | **NO IMPLEMENTADO** |
| Eliminar ledger_movement | ❌ | `ledger_movements` | **NO IMPLEMENTADO** |

---

## 8️⃣ ALERTAS

### 📥 CREAR ALERTA

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Crear registro | ✅ | `alerts` | Manual o via cron |

---

### ✏️ MARCAR COMO RESUELTA

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Actualizar status a RESOLVED | ✅ | `alerts.status` | |

---

### 🗑️ ELIMINAR ALERTA

| Acción | Estado | Tabla Afectada | Notas |
|--------|--------|----------------|-------|
| Eliminar registro | ✅ | `alerts` | Existe cleanup por operación |

---

## ✅ TODAS LAS ACCIONES CRÍTICAS IMPLEMENTADAS

### 1. ✅ **Eliminar Operación** - IMPLEMENTADO
- `DELETE /api/operations/[id]`
- Limpia: IVA, pagos, ledger, cash_movements, operator_payments, alertas, comisiones
- Revierte lead a IN_PROGRESS automáticamente
- Solo ADMIN y SUPER_ADMIN pueden eliminar

### 2. ✅ **Editar Operación → Actualizar IVA** - IMPLEMENTADO
- `PATCH /api/operations/[id]`
- Si cambia `sale_amount_total` → actualiza `iva_sales`
- Si cambia `operator_cost` → actualiza `iva_purchases` y `operator_payments`

### 3. ✅ **Eliminar Movimiento de Caja** - IMPLEMENTADO
- `DELETE /api/cash/movements?movementId=xxx`
- Elimina el cash_movement y su ledger_movement asociado
- Solo ADMIN, SUPER_ADMIN y CONTABLE pueden eliminar

### 4. ✅ **Revertir Comisión Pagada** - IMPLEMENTADO
- `POST /api/commissions/revert` con `{ commissionId }`
- Elimina el ledger_movement COMMISSION
- Cambia status de comisión a PENDING
- Solo ADMIN y SUPER_ADMIN pueden revertir

### 5. ⚠️ **Eliminar Lead con Depósito** - PENDIENTE (baja prioridad)
- El ledger_movement del depósito quedaría huérfano
- Impacto bajo: se puede limpiar manualmente si ocurre

---

## 📋 RESUMEN FINAL

| Acción | Estado | Endpoint |
|--------|--------|----------|
| Eliminar operación | ✅ | `DELETE /api/operations/[id]` |
| Actualizar IVA al editar | ✅ | `PATCH /api/operations/[id]` |
| Eliminar pago | ✅ | `DELETE /api/payments?paymentId=xxx` |
| Eliminar mov. caja | ✅ | `DELETE /api/cash/movements?movementId=xxx` |
| Revertir comisión | ✅ | `POST /api/commissions/revert` |

---

## 🤖 AI COPILOT - Contexto Actualizado

El AI Copilot ahora tiene acceso a:
- ✅ Movimientos de caja del mes
- ✅ Libro mayor (ledger) del mes
- ✅ IVA (ventas, compras, a pagar)
- ✅ Comisiones pendientes
- ✅ Pagos pendientes a operadores
- ✅ Schema de DB actualizado con todas las tablas contables

Preguntas ejemplo:
- "¿Cuánto IVA tenemos que pagar este mes?"
- "¿Cuánto le debemos a los operadores?"
- "¿Cómo está la caja este mes?"
- "¿Cuántas comisiones hay pendientes?"

---

*Documento actualizado: Diciembre 2024*
*Sistema contable integrado completamente*

