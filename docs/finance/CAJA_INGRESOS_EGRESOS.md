# Explicación: Ingresos y Egresos en Caja

## ¿Qué debería aparecer en INGRESOS?

Los **INGRESOS** muestran todo el dinero que **ENTRA** a la caja:

1. **Pagos de Clientes** (automático)
   - Cuando se marca un pago como pagado donde:
     - `direction = "INCOME"` (dinero que entra)
     - `payer_type = "CUSTOMER"` (pago del cliente)
   - Se crea automáticamente un `cash_movement` con:
     - `type = "INCOME"`
     - `category = "SALE"`
     - `operation_id` vinculado a la operación

2. **Otros Ingresos Manuales**
   - Ingresos creados manualmente desde "Nuevo Movimiento"
   - Categorías como "Otros Ingresos", "Cupones de Pago", etc.

## ¿Qué debería aparecer en EGRESOS?

Los **EGRESOS** muestran todo el dinero que **SALE** de la caja:

1. **Pagos a Operadores** (automático)
   - Cuando se marca un pago como pagado donde:
     - `direction = "EXPENSE"` (dinero que sale)
     - `payer_type = "OPERATOR"` (pago al operador)
   - Se crea automáticamente un `cash_movement` con:
     - `type = "EXPENSE"`
     - `category = "OPERATOR_PAYMENT"`
     - `operation_id` vinculado a la operación

2. **Otros Egresos Manuales**
   - Gastos administrativos
   - Sueldos
   - Alquiler
   - Servicios (luz, agua, gas, internet)
   - Marketing
   - Impuestos
   - Seguros
   - Mantenimiento
   - Otros gastos

## ⚠️ IMPORTANTE: ¿Por qué no veo movimientos?

**Los movimientos de caja SOLO se crean cuando:**
1. Se marca un pago como pagado (automático)
2. Se crea un movimiento manualmente

**Si no ves movimientos, puede ser porque:**
- Los pagos están en estado "PENDING" (no se han marcado como pagados)
- El rango de fechas seleccionado no incluye los movimientos
- Los filtros (agencia, moneda) están ocultando los movimientos

## Flujo de creación de movimientos

### Cuando se marca un pago como pagado:

1. **Pago de Cliente** (`direction="INCOME"`, `payer_type="CUSTOMER"`):
   ```
   Payment (status: PENDING) 
   → Marcar como pagado 
   → Cash Movement (type: INCOME, category: SALE)
   → Aparece en INGRESOS
   ```

2. **Pago a Operador** (`direction="EXPENSE"`, `payer_type="OPERATOR"`):
   ```
   Payment (status: PENDING) 
   → Marcar como pagado 
   → Cash Movement (type: EXPENSE, category: OPERATOR_PAYMENT)
   → Aparece en EGRESOS
   ```

## Relación con Operaciones

- Cada operación tiene pagos asociados (tabla `payments`)
- Cuando se marca un pago como pagado, se crea un `cash_movement`
- El `cash_movement` tiene `operation_id` que vincula con la operación
- Esto permite ver qué ingresos/egresos vienen de qué operación

## Categorías de Movimientos

### Ingresos:
- `SALE` - Venta (pago de cliente)
- `COUPON_PAYMENT` - Pago de cupón
- Otros ingresos manuales

### Egresos:
- `OPERATOR_PAYMENT` - Pago a operador
- `COMMISSION` - Comisión
- `ADMINISTRATIVE` - Gastos administrativos
- `SALARIES` - Sueldos
- `RENT` - Alquiler
- `UTILITIES` - Servicios
- `MARKETING` - Marketing
- `TAXES` - Impuestos
- `INSURANCE` - Seguros
- `MAINTENANCE` - Mantenimiento
- `OTHER` - Otros

