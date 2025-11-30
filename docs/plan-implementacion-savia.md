# Plan de Implementación - Funcionalidades de Savia

**Fecha de inicio:** 28 de Noviembre de 2025  
**Objetivo:** Implementar todas las funcionalidades de Savia que faltan en ERP Lozada

---

## 📋 Orden de Implementación

### FASE 1: Fundamentos (Base para todo)
1. ✅ **Sistema de Cotizaciones Formal**
   - Base para convertir leads en operaciones
   - Flujo: Lead → Cotización → Aprobación → Operación
   - Sincroniza con: Leads, Operaciones, Pagos

2. ✅ **Módulo de Tarifarios y Cupos**
   - Base para cotizaciones precisas
   - Sincroniza con: Operadores, Operaciones, Cotizaciones

### FASE 2: Gestión Financiera Expandida
3. ✅ **Gestión de Múltiples Cajas**
   - Sincroniza con: Movimientos de Caja, Pagos, Ledger

4. ✅ **Cupones de Cobro**
   - Sincroniza con: Pagos, Caja, Clientes

5. ✅ **Transacciones con Tarjetas**
   - Sincroniza con: Caja, Pagos, Ledger

### FASE 3: Visualización y Organización
6. ✅ **Cronograma/Calendario de Salidas**
   - Vista visual de operaciones
   - Sincroniza con: Operaciones, Alertas

7. ✅ **Ingresos/Egresos No Turísticos**
   - Categorización de movimientos
   - Sincroniza con: Caja, Ledger

### FASE 4: Mejoras y Optimizaciones
8. ✅ **Mejoras en Dashboard**
   - Accesos directos
   - Recordatorios mejorados
   - Métricas adicionales

---

## 🔄 Matriz de Sincronización

| Módulo | Sincroniza con |
|--------|----------------|
| **Cotizaciones** | Leads, Operaciones, Pagos, Comisiones |
| **Tarifarios** | Operadores, Operaciones, Cotizaciones |
| **Múltiples Cajas** | Movimientos, Pagos, Ledger, Transferencias |
| **Cupones** | Pagos, Caja, Clientes, Operaciones |
| **Tarjetas** | Caja, Pagos, Ledger, Comisiones |
| **Cronograma** | Operaciones, Alertas, Clientes |
| **No Turísticos** | Caja, Ledger, Reportes |

---

## 📊 Estructura de Datos

### Tablas Nuevas a Crear:
1. `quotations` - Cotizaciones
2. `quotation_items` - Items de cotización
3. `tariffs` - Tarifarios
4. `tariff_items` - Items de tarifario
5. `quotas` - Cupos disponibles
6. `cash_boxes` - Cajas múltiples
7. `cash_transfers` - Transferencias entre cajas
8. `payment_coupons` - Cupones de cobro
9. `card_transactions` - Transacciones con tarjetas
10. `non_touristic_movements` - Movimientos no turísticos

---

## 🚀 Estado de Implementación

### ✅ COMPLETADO - Migraciones de Base de Datos

**FASE 1: Fundamentos**
- ✅ Migración 014: Sistema de Cotizaciones (`quotations`, `quotation_items`)
- ✅ Migración 015: Tarifarios y Cupos (`tariffs`, `tariff_items`, `quotas`, `quota_reservations`)

**FASE 2: Gestión Financiera**
- ✅ Migración 016: Múltiples Cajas (`cash_boxes`, `cash_transfers`)
- ✅ Migración 017: Cupones de Cobro (`payment_coupons`)
- ✅ Migración 018: Transacciones con Tarjetas (`card_transactions`)

**FASE 3: Categorización**
- ✅ Migración 019: Movimientos No Turísticos (extensión de `cash_movements`)

### 🔄 EN PROGRESO - APIs y UI

**Próximos pasos:**
1. Crear APIs para Cotizaciones
2. Crear APIs para Tarifarios y Cupos
3. Crear APIs para Múltiples Cajas
4. Crear APIs para Cupones
5. Crear APIs para Transacciones con Tarjetas
6. Crear componentes UI para cada módulo
7. Integrar todo con sincronización automática

---

## 🔗 Matriz de Sincronización Detallada

### Cotizaciones
- **Sincroniza con Leads:** `lead_id` → actualiza status del lead a 'QUOTED'
- **Sincroniza con Operaciones:** `operation_id` → cuando se convierte cotización
- **Sincroniza con Tarifarios:** `quotation_items.tariff_id` → usa precios de tarifarios
- **Sincroniza con Cupos:** `quota_reservations.quotation_id` → reserva cupos temporalmente
- **Sincroniza con Pagos:** cuando se convierte, crea pagos automáticamente

### Tarifarios
- **Sincroniza con Operadores:** `operator_id` → tarifarios por operador
- **Sincroniza con Cotizaciones:** `quotation_items.tariff_id` → precios en cotizaciones
- **Sincroniza con Operaciones:** cuando se crea operación desde cotización con tarifario
- **Sincroniza con Cupos:** `quotas.tariff_id` → cupos disponibles por tarifario

### Múltiples Cajas
- **Sincroniza con Movimientos:** `cash_movements.cash_box_id` → cada movimiento pertenece a una caja
- **Sincroniza con Pagos:** cuando se marca pago, se registra en caja correspondiente
- **Sincroniza con Transferencias:** `cash_transfers` → actualiza balances automáticamente
- **Sincroniza con Ledger:** movimientos de caja se reflejan en ledger

### Cupones de Cobro
- **Sincroniza con Operaciones:** `operation_id` → cupón asociado a operación
- **Sincroniza con Pagos:** `payment_id` → cuando se paga el cupón
- **Sincroniza con Clientes:** `customer_id` → cupón para cliente específico
- **Sincroniza con Caja:** cuando se paga, se registra movimiento en caja

### Transacciones con Tarjetas
- **Sincroniza con Operaciones:** `operation_id` → transacción de operación
- **Sincroniza con Pagos:** `payment_id` → pago con tarjeta
- **Sincroniza con Caja:** `cash_box_id` → se registra en caja correspondiente
- **Sincroniza con Ledger:** comisiones se registran en ledger

### Movimientos No Turísticos
- **Sincroniza con Caja:** `cash_movements.is_touristic = false`
- **Sincroniza con Ledger:** todos los movimientos pasan por ledger
- **Sincroniza con Reportes:** categorización para reportes contables

