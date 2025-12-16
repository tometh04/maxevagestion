# Verificación Completa del Sistema - Operación PACKAGE desde Lead

Este documento detalla el proceso de verificación completa del sistema al crear una operación PACKAGE desde un lead.

## Fase 1: Preparación y Creación de Operación

### 1.1 Seleccionar/Crear Lead de Prueba

**Acción:**
- Ir a `/sales/leads` o `/sales/crm-manychat`
- Buscar un lead con status "IN_PROGRESS" o "QUOTED"
- O crear un nuevo lead con:
  - Nombre completo
  - Teléfono válido
  - Email válido
  - Destino: "Río de Janeiro" (Brasil - tiene requisitos de Fiebre Amarilla)
  - Fechas de viaje
  - Depósito (opcional pero recomendado)

**Verificar:**
- [ ] Lead creado correctamente
- [ ] Lead tiene documentos asociados (si es posible)
- [ ] Lead tiene movimientos contables (depósitos) si aplica

### 1.2 Convertir Lead a Operación PACKAGE

**Acción:**
- Click en "Convertir a Operación" en el lead
- Completar formulario:
  - Tipo: **PACKAGE**
  - Destino: "Río de Janeiro" (o un destino con requisitos configurados)
  - Fechas:
    - `departure_date`: 60 días en el futuro
    - `return_date`: 7 días después de departure
    - `checkin_date`: igual a departure_date
    - `checkout_date`: igual a return_date
  - Pasajeros:
    - `adults`: 2
    - `children`: 0
    - `infants`: 0
  - Montos:
    - `sale_amount_total`: 3000 USD
    - `operator_cost`: 2400 USD
    - `currency`: USD
  - Operador: Seleccionar un operador existente
  - Vendedor: Asignar vendedor
  - Comisión: 10%

**Verificar:**
- [ ] Operación creada correctamente
- [ ] File code generado automáticamente
- [ ] Lead actualizado a status "WON"

## Fase 2: Verificación de Impactos Inmediatos

### 2.1 Verificar Creación de Cliente

**Acción:**
- Ir a `/customers`
- Buscar el cliente por nombre o teléfono del lead

**Verificar:**
- [ ] Cliente creado/actualizado correctamente
- [ ] Cliente tiene la operación asociada en `/customers/[id]`
- [ ] Documentos del lead aparecen en:
  - Detalle del cliente (`/customers/[id]` - pestaña "Documentos")
  - Detalle de la operación (`/operations/[id]` - pestaña "Documentos")
- [ ] Mensajes del lead aparecen en el cliente (`/customers/[id]` - pestaña "Mensajes")

### 2.2 Verificar Registros Contables

**Acción:**
- Consultar base de datos o usar queries SQL

**Verificar:**

#### IVA Ventas
```sql
SELECT * FROM iva_sales WHERE operation_id = '[OPERATION_ID]';
```
- [ ] Registro creado en `iva_sales`
- [ ] `net_amount` = sale_amount_total / 1.21 (si aplica IVA)
- [ ] `iva_amount` = sale_amount_total - net_amount
- [ ] `currency` correcto

#### IVA Compras
```sql
SELECT * FROM iva_purchases WHERE operation_id = '[OPERATION_ID]';
```
- [ ] Registro creado en `iva_purchases` para el operador
- [ ] `net_amount` = operator_cost / 1.21 (si aplica IVA)
- [ ] `iva_amount` = operator_cost - net_amount
- [ ] `currency` correcto

#### Ledger Movements
```sql
SELECT * FROM ledger_movements WHERE operation_id = '[OPERATION_ID]';
```
- [ ] Movimiento de **Cuentas por Cobrar** (INCOME):
  - `type` = "INCOME"
  - `concept` contiene "Venta"
  - `amount_original` = sale_amount_total
  - `currency` = sale_currency
- [ ] Movimiento de **Cuentas por Pagar** (EXPENSE):
  - `type` = "EXPENSE"
  - `concept` contiene "Costo de Operadores"
  - `amount_original` = operator_cost
  - `currency` = operator_cost_currency

#### Operator Payments
```sql
SELECT * FROM operator_payments WHERE operation_id = '[OPERATION_ID]';
```
- [ ] Registro creado en `operator_payments`
- [ ] `amount` = operator_cost
- [ ] `currency` = operator_cost_currency
- [ ] `due_date` calculado correctamente según tipo de producto

#### Commission Records
```sql
SELECT * FROM commission_records WHERE operation_id = '[OPERATION_ID]';
```
- [ ] Registro creado si `commission_percentage > 0` y `margin_amount > 0`
- [ ] `amount` = (margin_amount * commission_percentage) / 100
- [ ] `percentage` = commission_percentage
- [ ] `status` = "PENDING"

### 2.3 Verificar Alertas Generadas

**Acción:**
- Ir a `/alerts`
- Filtrar por operation_id o buscar alertas relacionadas

**Verificar:**

#### Alertas de Requisitos de Destino
```sql
SELECT * FROM alerts 
WHERE operation_id = '[OPERATION_ID]' 
AND type = 'DESTINATION_REQUIREMENT';
```
- [ ] Alertas creadas según `destination_requirements` para el destino
- [ ] Para "Río de Janeiro" (Brasil): debe haber alerta de "Fiebre Amarilla"
- [ ] `date_due` = departure_date - days_before_trip (30 días por defecto)

#### Alertas de Check-in
```sql
SELECT * FROM alerts 
WHERE operation_id = '[OPERATION_ID]' 
AND type = 'UPCOMING_TRIP' 
AND description LIKE '%Check-in%';
```
- [ ] Alerta creada 30 días antes de `checkin_date` o `departure_date`
- [ ] `date_due` = checkin_date - 30 días

#### Alertas de Check-out
```sql
SELECT * FROM alerts 
WHERE operation_id = '[OPERATION_ID]' 
AND type = 'UPCOMING_TRIP' 
AND description LIKE '%Check-out%';
```
- [ ] Alerta creada 1 día antes de `checkout_date` o `return_date`
- [ ] `date_due` = checkout_date - 1 día

#### Alertas de Pagos
```sql
SELECT * FROM alerts 
WHERE operation_id = '[OPERATION_ID]' 
AND (type = 'PAYMENT_DUE' OR type = 'OPERATOR_DUE');
```
- [ ] Alertas creadas a 30 días antes de cada pago pendiente
- [ ] Alerta de cobro de cliente (PAYMENT_DUE) si hay pagos de cliente
- [ ] Alerta de pago a operador (OPERATOR_DUE) si hay pagos a operador

### 2.4 Verificar Mensajes WhatsApp

**Acción:**
- Ir a `/messages`
- Filtrar por operation_id o customer_id

**Verificar:**
```sql
SELECT * FROM whatsapp_messages 
WHERE operation_id = '[OPERATION_ID]' 
OR customer_id = '[CUSTOMER_ID]';
```
- [ ] Mensajes generados desde las alertas creadas
- [ ] Cada mensaje tiene:
  - `template_id` (template activo para el trigger_type)
  - `customer_id` (cliente principal de la operación)
  - `phone` (teléfono del cliente)
  - `message` (mensaje personalizado con variables)
  - `whatsapp_link` (link de WhatsApp con mensaje)
  - `scheduled_for` (fecha programada = fecha de la alerta a las 9 AM)
  - `status` = "PENDING"
- [ ] Mensajes vinculados a la operación (`operation_id`)

## Fase 3: Verificación de Módulos del Sistema

### 3.1 Verificar Dashboard (`/dashboard`)

**Acción:**
- Ir a `/dashboard`
- Verificar KPIs y gráficos

**Verificar:**

#### KPIs
- [ ] **Total Ventas**: Incluye el `sale_amount_total` de la nueva operación
- [ ] **Total Operaciones**: Incrementado en 1
- [ ] **Margen Total**: Incluye el `margin_amount` de la nueva operación
- [ ] **Operaciones del Mes**: Incluye la nueva operación si es del mes actual

#### Gráficos
- [ ] **Ventas por Vendedor**: Aparece en el gráfico del vendedor asignado
- [ ] **Gráfico de Destinos**: Aparece "Río de Janeiro" (o el destino usado)
- [ ] **Gráfico de Regiones**: Aparece en la región correspondiente (BRASIL)
- [ ] **Gráfico de Cashflow**: No debe aparecer aún (los pagos se registran manualmente)

#### Cards
- [ ] **Próximos viajes**: Aparece la operación si `departure_date` es futura
- [ ] **Alertas pendientes**: Muestra las alertas generadas
- [ ] **Cumpleaños del día**: No aplica si no hay pasajeros con fecha de nacimiento

### 3.2 Verificar Caja (`/cash`)

**Acción:**
- Ir a `/cash`
- Verificar movimientos

**Verificar:**
```sql
SELECT * FROM cash_movements WHERE operation_id = '[OPERATION_ID]';
```
- [ ] **NO** se crearon movimientos automáticos (los pagos se registran manualmente)
- [ ] Cuando se registre un pago manualmente:
  - [ ] Se crea movimiento en `cash_movements`
  - [ ] Se crea movimiento en `ledger_movements`
  - [ ] Se actualiza el balance de la cuenta financiera

### 3.3 Verificar Contabilidad (`/accounting`)

**Acción:**
- Ir a `/accounting`
- Verificar libro mayor, IVA, cuentas por cobrar/pagar

**Verificar:**

#### Libro Mayor
- [ ] Movimientos visibles en `ledger_movements`:
  - Cuentas por Cobrar (INCOME)
  - Cuentas por Pagar (EXPENSE)

#### IVA
- [ ] Registros en `iva_sales` y `iva_purchases` visibles
- [ ] Cálculos correctos de IVA

#### Cuentas por Cobrar
- [ ] Aparece el monto pendiente (`sale_amount_total`)
- [ ] Se actualiza cuando se registra un pago

#### Cuentas por Pagar
- [ ] Aparece el monto a pagar al operador (`operator_cost`)
- [ ] Se actualiza cuando se registra un pago

### 3.4 Verificar Reportes (`/reports`)

**Acción:**
- Ir a `/reports`
- Verificar diferentes reportes

**Verificar:**

#### Reporte de Ventas
- [ ] Operación aparece con datos correctos:
  - Destino
  - Monto de venta
  - Fechas
  - Vendedor

#### Reporte de Márgenes
- [ ] Cálculo de margen correcto:
  - `margin_amount` = sale_amount_total - operator_cost
  - `margin_percentage` = (margin_amount / sale_amount_total) * 100

#### Reporte de Rentabilidad
- [ ] Aparece en el reporte por destino
- [ ] Datos de rentabilidad correctos

#### Reporte de Operadores
- [ ] Aparece el costo en el reporte del operador
- [ ] Monto y moneda correctos

### 3.5 Verificar AI Companion

**Acción:**
- Ir a `/emilia` o usar el AI Companion
- Hacer preguntas sobre la operación

**Verificar:**
- [ ] "¿Cuánto vendimos esta semana?" → Debe incluir la nueva operación
- [ ] "¿Qué operaciones hay para Río de Janeiro?" → Debe incluir esta operación
- [ ] "¿Qué pagos vencen próximamente?" → Debe incluir pagos de la operación
- [ ] "¿Qué viajes salen próximamente?" → Debe incluir esta operación

## Fase 4: Verificación de Flujos Secundarios

### 4.1 Registrar Pago de Cliente

**Acción:**
- Ir a `/operations/[id]` o `/payments`
- Crear un pago de cliente

**Verificar:**
- [ ] Estado del pago en `payments` actualizado
- [ ] Movimiento creado en `cash_movements`
- [ ] Movimiento creado en `ledger_movements`
- [ ] Balance de cuenta financiera actualizado
- [ ] Cuentas por Cobrar disminuye

### 4.2 Registrar Pago a Operador

**Acción:**
- Ir a `/operators/[id]` o `/payments`
- Crear un pago a operador

**Verificar:**
- [ ] Estado en `operator_payments` actualizado
- [ ] Movimiento creado en `cash_movements`
- [ ] Movimiento creado en `ledger_movements`
- [ ] Balance de cuenta financiera actualizado
- [ ] Cuentas por Pagar disminuye

### 4.3 Actualizar Estado de Operación

**Acción:**
- Ir a `/operations/[id]`
- Cambiar estado a "CONFIRMED" o "CLOSED"

**Verificar:**
- [ ] Estado actualizado correctamente
- [ ] Comisiones calculadas automáticamente (si aplica)
- [ ] Alertas adicionales generadas (si corresponde)

### 4.4 Verificar Documentos

**Acción:**
- Ir a `/operations/[id]`
- Subir un documento (pasaporte, DNI, voucher)

**Verificar:**
- [ ] Documento aparece en:
  - Detalle de operación (`/operations/[id]` - pestaña "Documentos")
  - Detalle de cliente (`/customers/[id]` - pestaña "Documentos")
- [ ] Si falta documento requerido, se genera alerta

## Resumen de Verificaciones

### Checklist Final

- [ ] Operación creada correctamente
- [ ] Cliente creado/asociado
- [ ] Documentos transferidos
- [ ] IVA Ventas creado
- [ ] IVA Compras creado
- [ ] Ledger movements creados (Cuentas por Cobrar y Pagar)
- [ ] Operator payment creado
- [ ] Commission record creado (si aplica)
- [ ] Alertas generadas (requisitos, check-in, check-out, pagos)
- [ ] Mensajes WhatsApp generados
- [ ] Dashboard actualizado (KPIs y gráficos)
- [ ] Reportes muestran la operación
- [ ] AI Companion puede consultar la operación
- [ ] Pagos se registran correctamente
- [ ] Movimientos contables se actualizan con pagos

## Notas

- Los mensajes de WhatsApp se generan automáticamente desde las alertas si hay templates activos configurados
- Los pagos NO se crean automáticamente - se registran manualmente cuando el cliente paga
- Las comisiones se calculan automáticamente si hay `commission_percentage > 0` y `margin_amount > 0`
- Las alertas de requisitos de destino dependen de la configuración en `destination_requirements`

