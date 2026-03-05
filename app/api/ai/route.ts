import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import OpenAI from "openai"
import { createServerClient } from "@/lib/supabase/server"

// Esquema COMPLETO de la base de datos - ACTUALIZADO 2026-02-26
const DATABASE_SCHEMA = `
## ESQUEMA COMPLETO DE BASE DE DATOS - MAXEVA GESTION

### 📊 TABLAS PRINCIPALES

#### users (Usuarios)
- id, name, email, role ('SUPER_ADMIN','ADMIN','SELLER','VIEWER','CONTABLE'), is_active
- auth_id, created_at, updated_at

#### agencies (Agencias)
- id, name, city, timezone, created_at, updated_at

#### user_agencies (Relación Usuarios-Agencias)
- id, user_id, agency_id, created_at

#### operators (Operadores/Proveedores)
- id, name, contact_name, contact_email, contact_phone, credit_limit
- created_at, updated_at

#### customers (Clientes)
- id, first_name, last_name, phone, email, document_type, document_number
- date_of_birth, nationality, procedure_number, instagram_handle
- created_at, updated_at

#### leads (Consultas)
- id, agency_id, source ('Instagram','WhatsApp','Meta Ads','Other')
- status ('NEW','IN_PROGRESS','QUOTED','WON','LOST')
- region ('ARGENTINA','CARIBE','BRASIL','EUROPA','EEUU','OTROS','CRUCEROS')
- destination, contact_name, contact_phone, contact_email, contact_instagram
- assigned_seller_id, external_id, trello_url, notes
- created_at, updated_at

#### operations (Operaciones/Ventas) ⭐ TABLA PRINCIPAL
- id, file_code, agency_id, seller_id, seller_secondary_id (vendedor secundario, nullable), operator_id, lead_id
- commission_split (NUMERIC 0-100, default 50: % de comisión para el vendedor principal cuando hay vendedor secundario. El secundario recibe 100-commission_split%)
- type ('FLIGHT','HOTEL','PACKAGE','CRUISE','TRANSFER','MIXED','ASSISTANCE')
- origin, destination, departure_date, return_date
- operation_date (fecha en que se vendió/creó la operación, ej: '2025-09-01' = venta de septiembre 2025)
- adults, children, infants
- status ('RESERVED','CONFIRMED','CANCELLED','TRAVELLING','TRAVELLED')
- sale_amount_total (venta total), sale_currency ('ARS','USD')
- operator_cost (costo total), operator_cost_currency ('ARS','USD')
- margin_amount (ganancia), margin_percentage (margen %)
- reservation_code_air, reservation_code_hotel (códigos de reserva)
- created_at, updated_at
- NOTA: Para "ventas de un mes" usar operation_date (fecha de venta), NO departure_date (fecha del viaje) ni created_at (fecha de carga en sistema)
- NOTA: Si seller_secondary_id != NULL, la comisión se reparte según commission_split (ej: 50 = 50%/50%, 70 = 70% principal / 30% secundario)

#### operation_customers (Relación Operaciones-Clientes)
- id, operation_id, customer_id, role ('MAIN','COMPANION')

#### operation_operators (Relación Operaciones-Operadores) - Múltiples operadores por operación
- id, operation_id, operator_id, cost, cost_currency ('ARS','USD'), notes
- created_at, updated_at
- UNIQUE(operation_id, operator_id)

#### payments (Pagos) - Pagos de clientes y a operadores
- id, operation_id, payer_type ('CUSTOMER','OPERATOR')
- direction ('INCOME'=cobranza, 'EXPENSE'=pago), method ('CASH','BANK','MP','USD','OTHER')
- amount (monto original), currency ('ARS','USD')
- exchange_rate (tipo de cambio usado), amount_usd (equivalente en USD)
- date_due (fecha vencimiento), date_paid (fecha pago)
- status ('PENDING','PAID','OVERDUE'), reference, financial_account_id
- created_at, updated_at

#### financial_accounts (Cuentas Financieras) - Caja, Bancos, Socios
- id, name, type, currency ('ARS','USD')
- TIPOS: 'CASH_ARS' (caja efectivo pesos), 'CASH_USD' (caja efectivo dólares), 'SAVINGS_ARS' (caja de ahorro ARS), 'SAVINGS_USD' (caja de ahorro USD), 'CHECKING_ARS' (cuenta corriente ARS), 'CHECKING_USD' (cuenta corriente USD), 'CREDIT_CARD' (tarjeta de crédito), 'ASSETS' (activos/vouchers), 'PARTNER' (cuenta de socio para retiros)
- initial_balance (saldo inicial), current_balance (saldo actual calculado)
- chart_account_id (relación con plan de cuentas), is_active
- agency_id (puede estar NULL para cuentas globales)
- created_at, created_by, notes
- NOTA: Las cuentas PARTNER se usan para registrar retiros de socios. Las transferencias entre cuentas de distinta moneda (ej: ARS→USD) se hacen con tipo de cambio (compra/venta de dólares)

#### ledger_movements (Movimientos Contables) - CORAZÓN CONTABLE ⭐
- id, operation_id, lead_id, type ('INCOME','EXPENSE','FX_GAIN','FX_LOSS','COMMISSION','OPERATOR_PAYMENT')
- concept (formato: "Nombre Pasajero (OP-XXXXXX)" o "Pago a operador - Nombre Pasajero (OP-XXXXXX)" - muestra nombre del pasajero principal, no solo código)
- notes, currency ('ARS','USD')
- amount_original (monto en moneda original)
- exchange_rate (tasa usada), amount_ars_equivalent (siempre en ARS)
- method ('CASH','BANK','MP','USD','OTHER')
- account_id (FK a financial_accounts), chart_account_id (FK a chart_of_accounts)
- seller_id, operator_id, receipt_number
- created_at, created_by
- NOTA: El campo 'concept' ahora muestra el nombre completo del pasajero principal de la operación, con el código entre paréntesis

#### operator_payments (Pagos a Operadores) - Cuentas por Pagar
- id, operation_id, operator_id, amount, currency ('ARS','USD')
- due_date (fecha vencimiento), paid_amount (monto pagado parcialmente)
- status ('PENDING','PAID','OVERDUE')
- ledger_movement_id (FK a ledger_movements cuando se paga)
- notes, created_at, updated_at

#### recurring_payments (Gastos Recurrentes)
- id, operator_id, amount, currency ('ARS','USD')
- frequency ('WEEKLY','BIWEEKLY','MONTHLY','QUARTERLY','YEARLY')
- start_date, end_date (opcional), next_due_date, last_generated_date
- category_id (FK a recurring_payment_categories), is_active
- description, notes, created_at, updated_at, created_by

#### recurring_payment_categories (Categorías de Gastos Recurrentes)
- id, name, description, color, is_active, created_at, updated_at

#### chart_of_accounts (Plan de Cuentas Contable)
- id, account_code (ej: '1.1.01'), account_name
- category ('ACTIVO','PASIVO','PATRIMONIO_NETO','RESULTADO')
- subcategory ('CORRIENTE','NO_CORRIENTE','INGRESOS','COSTOS','GASTOS')
- account_type ('CAJA','BANCO','CUENTAS_POR_COBRAR','VENTAS', etc.)
- level, parent_id, is_movement_account, is_active, display_order
- description, created_at, updated_at, created_by

#### exchange_rates (Tasas de Cambio Históricas)
- id, rate_date, from_currency ('USD'), to_currency ('ARS')
- rate (cuántos ARS por 1 USD), source, notes
- created_at, created_by, updated_at
- UNIQUE(rate_date, from_currency, to_currency)

#### monthly_exchange_rates (Tipos de Cambio Mensuales)
- id, year, month (1-12), usd_to_ars_rate
- created_at, updated_at
- UNIQUE(year, month)

#### invoices (Facturas AFIP)
- id, agency_id, operation_id, customer_id
- cbte_tipo (1=Fact A, 6=Fact B, 11=Fact C), pto_vta, cbte_nro
- cae, cae_fch_vto
- receptor_doc_tipo, receptor_doc_nro, receptor_nombre, receptor_domicilio, receptor_condicion_iva
- imp_neto, imp_iva, imp_total, imp_tot_conc, imp_op_ex, imp_trib
- moneda ('PES','DOL'), cotizacion
- concepto (1=Productos, 2=Servicios, 3=Ambos)
- fch_serv_desde, fch_serv_hasta, fecha_emision, fecha_vto_pago
- status ('draft','pending','sent','authorized','rejected','cancelled')
- afip_response (JSONB), pdf_url, notes
- created_at, updated_at, created_by

#### invoice_items (Items de Factura)
- id, invoice_id, descripcion, cantidad, precio_unitario, subtotal
- iva_id, iva_porcentaje, iva_importe, total, orden
- created_at

#### iva_sales (IVA de Ventas)
- id, operation_id, sale_amount_total, net_amount, iva_amount
- currency ('ARS','USD'), sale_date
- created_at, updated_at

#### iva_purchases (IVA de Compras)
- id, operation_id, operator_id, operator_cost_total, net_amount, iva_amount
- currency ('ARS','USD'), purchase_date
- created_at, updated_at

#### partner_accounts (Cuentas de Socios)
- id, partner_name, user_id, profit_percentage (0-100%), is_active
- notes, created_at, updated_at

#### partner_withdrawals (Retiros de Socios)
- id, partner_id, amount, currency ('ARS','USD'), withdrawal_date
- account_id (FK a financial_accounts), exchange_rate
- ledger_movement_id, description, created_by, created_at

#### partner_profit_allocations (Asignaciones de Ganancias a Socios)
- id, partner_id, year, month, profit_amount, currency ('ARS','USD')
- exchange_rate, status ('ALLOCATED','WITHDRAWN'), monthly_position_id
- created_by, created_at, updated_at
- UNIQUE(partner_id, year, month)

#### commission_records (Registros de Comisiones)
- id, operation_id, seller_id, agency_id
- amount, status ('PENDING','PAID'), date_calculated, date_paid
- created_at, updated_at

#### alerts (Alertas)
- id, operation_id, customer_id, user_id
- type ('PAYMENT_DUE','OPERATOR_DUE','UPCOMING_TRIP','MISSING_DOC','GENERIC')
- description, date_due, status ('PENDING','DONE','IGNORED')
- created_at, updated_at

#### documents (Documentos)
- id, operation_id, customer_id, type ('PASSPORT','DNI','VOUCHER','INVOICE','PAYMENT_PROOF','OTHER')
- file_url, uploaded_by_user_id, uploaded_at

### 📊 RELACIONES IMPORTANTES

1. **operations** -> operation_customers -> customers (una operación puede tener múltiples clientes)
2. **operations** -> operation_operators -> operators (una operación puede tener múltiples operadores)
3. **operations** -> payments (pagos de clientes y a operadores)
4. **operations** -> operator_payments (pagos pendientes a operadores)
5. **operations** -> ledger_movements (todos los movimientos contables)
6. **financial_accounts** -> ledger_movements (movimientos por cuenta)
7. **partner_accounts** -> partner_withdrawals -> ledger_movements (retiros de socios)
8. **recurring_payments** -> recurring_payment_categories (categorización)

### 💰 CÁLCULOS Y MÉTRICAS CLAVE

#### Balance de Cuentas Financieras:
IMPORTANTE: Para cuentas USD usar amount_original (que está en USD). Para cuentas ARS usar amount_ars_equivalent (que está en ARS). NUNCA usar amount_ars_equivalent para cuentas USD porque infla el balance por el tipo de cambio.
\`\`\`sql
SELECT fa.id, fa.name, fa.type, fa.currency, fa.initial_balance,
  COALESCE(SUM(CASE WHEN lm.type = 'INCOME' THEN (CASE WHEN fa.currency = 'USD' THEN lm.amount_original ELSE lm.amount_ars_equivalent END) ELSE 0 END), 0) as ingresos,
  COALESCE(SUM(CASE WHEN lm.type = 'EXPENSE' THEN (CASE WHEN fa.currency = 'USD' THEN lm.amount_original ELSE lm.amount_ars_equivalent END) ELSE 0 END), 0) as egresos,
  fa.initial_balance + COALESCE(SUM(CASE WHEN lm.type = 'INCOME' THEN (CASE WHEN fa.currency = 'USD' THEN lm.amount_original ELSE lm.amount_ars_equivalent END) ELSE -(CASE WHEN fa.currency = 'USD' THEN lm.amount_original ELSE lm.amount_ars_equivalent END) END), 0) as balance_actual
FROM financial_accounts fa
LEFT JOIN ledger_movements lm ON lm.account_id = fa.id
WHERE fa.is_active = true
GROUP BY fa.id, fa.name, fa.type, fa.currency, fa.initial_balance
\`\`\`

#### Deudores por Ventas (Cuentas por Cobrar):
NOTA: Si sale_currency = 'USD', la venta ya está en USD (no convertir). Si sale_currency = 'ARS', dividir por TC. Si exchange_rates está vacía, usar monthly_exchange_rates como fallback.
\`\`\`sql
SELECT o.id, o.file_code, o.destination, o.sale_amount_total, o.sale_currency,
  COALESCE(SUM(CASE WHEN p.direction = 'INCOME' AND p.payer_type = 'CUSTOMER' AND p.status = 'PAID' THEN p.amount ELSE 0 END), 0) as pagado,
  o.sale_amount_total - COALESCE(SUM(CASE WHEN p.direction = 'INCOME' AND p.payer_type = 'CUSTOMER' AND p.status = 'PAID' THEN p.amount ELSE 0 END), 0) as deuda
FROM operations o
LEFT JOIN payments p ON p.operation_id = o.id AND p.currency = o.sale_currency
WHERE o.status NOT IN ('CANCELLED')
GROUP BY o.id, o.file_code, o.destination, o.sale_amount_total, o.sale_currency
HAVING o.sale_amount_total - COALESCE(SUM(CASE WHEN p.direction = 'INCOME' AND p.payer_type = 'CUSTOMER' AND p.status = 'PAID' THEN p.amount ELSE 0 END), 0) > 0
\`\`\`

#### Deuda a Operadores (Cuentas por Pagar):
\`\`\`sql
SELECT op.id, op.operation_id, op.operator_id, op.amount, op.currency, op.due_date,
  op.paid_amount, (op.amount - op.paid_amount) as pendiente, op.status
FROM operator_payments op
WHERE op.status IN ('PENDING', 'OVERDUE')
AND (op.amount - op.paid_amount) > 0
ORDER BY op.due_date ASC
\`\`\`

#### Ventas del Mes (en USD):
\`\`\`sql
SELECT
  COUNT(*) as cantidad,
  SUM(CASE WHEN o.sale_currency = 'USD' THEN o.sale_amount_total ELSE o.sale_amount_total / COALESCE(er.rate, mer.usd_to_ars_rate, 1200) END) as total_usd,
  SUM(CASE WHEN o.sale_currency = 'USD' THEN o.margin_amount ELSE o.margin_amount / COALESCE(er.rate, mer.usd_to_ars_rate, 1200) END) as margen_usd
FROM operations o
LEFT JOIN exchange_rates er ON er.rate_date = o.departure_date::date AND er.from_currency = 'USD' AND er.to_currency = 'ARS'
LEFT JOIN monthly_exchange_rates mer ON mer.year = EXTRACT(YEAR FROM o.departure_date) AND mer.month = EXTRACT(MONTH FROM o.departure_date)
WHERE o.created_at >= date_trunc('month', CURRENT_DATE)
AND o.status NOT IN ('CANCELLED')
\`\`\`

#### Posición Financiera (¿Estoy positivo o negativo?):
IMPORTANTE: NO usar chart_of_accounts para esto (chart_account_id puede estar NULL). Usar este enfoque práctico:
\`\`\`sql
-- PASO 1: Balance de todas las cuentas financieras (lo que TENGO en caja/banco/MP)
SELECT fa.name, fa.currency,
  fa.initial_balance + COALESCE(SUM(CASE
    WHEN lm.type = 'INCOME' THEN (CASE WHEN fa.currency = 'USD' THEN lm.amount_original ELSE lm.amount_ars_equivalent END)
    ELSE -(CASE WHEN fa.currency = 'USD' THEN lm.amount_original ELSE lm.amount_ars_equivalent END)
  END), 0) as balance
FROM financial_accounts fa
LEFT JOIN ledger_movements lm ON lm.account_id = fa.id
WHERE fa.is_active = true
GROUP BY fa.id, fa.name, fa.currency, fa.initial_balance

-- PASO 2: Lo que me DEBEN los clientes (cuentas por cobrar)
SELECT o.sale_currency as currency,
  SUM(o.sale_amount_total - COALESCE(pagado.total, 0)) as total_por_cobrar
FROM operations o
LEFT JOIN (
  SELECT p.operation_id, SUM(p.amount) as total
  FROM payments p WHERE p.direction = 'INCOME' AND p.payer_type = 'CUSTOMER' AND p.status = 'PAID'
  GROUP BY p.operation_id
) pagado ON pagado.operation_id = o.id
WHERE o.status NOT IN ('CANCELLED')
AND o.sale_amount_total - COALESCE(pagado.total, 0) > 0
GROUP BY o.sale_currency

-- PASO 3: Lo que DEBO a operadores (cuentas por pagar)
SELECT op.currency, SUM(op.amount - op.paid_amount) as total_por_pagar
FROM operator_payments op
WHERE op.status IN ('PENDING', 'OVERDUE') AND (op.amount - op.paid_amount) > 0
GROUP BY op.currency

-- RESUMEN: ACTIVO = balances cuentas + por cobrar. PASIVO = por pagar. RESULTADO = ACTIVO - PASIVO
\`\`\`

#### Resultado del Mes (Ingresos vs Egresos del mes actual):
\`\`\`sql
-- Ingresos del mes (cobros recibidos)
SELECT SUM(CASE WHEN fa.currency = 'USD' THEN lm.amount_original ELSE lm.amount_ars_equivalent END) as ingresos,
  fa.currency
FROM ledger_movements lm
JOIN financial_accounts fa ON fa.id = lm.account_id
WHERE lm.type = 'INCOME'
AND lm.created_at >= date_trunc('month', CURRENT_DATE)
GROUP BY fa.currency

-- Egresos del mes (pagos realizados)
SELECT SUM(CASE WHEN fa.currency = 'USD' THEN lm.amount_original ELSE lm.amount_ars_equivalent END) as egresos,
  fa.currency
FROM ledger_movements lm
JOIN financial_accounts fa ON fa.id = lm.account_id
WHERE lm.type = 'EXPENSE'
AND lm.created_at >= date_trunc('month', CURRENT_DATE)
GROUP BY fa.currency
\`\`\`

### ⚠️ NOTAS CRÍTICAS

1. **Monedas:** Si operation.sale_currency = 'USD', usar directamente sale_amount_total. Si es 'ARS' y se necesita en USD, dividir por exchange_rate. IMPORTANTE: en ledger_movements, amount_original está en la moneda original (puede ser USD o ARS), y amount_ars_equivalent SIEMPRE está en ARS. Para balances de cuentas USD, usar amount_original. Para balances de cuentas ARS, usar amount_ars_equivalent.
2. **Fechas:** Usar CURRENT_DATE, date_trunc('month', CURRENT_DATE), etc. IMPORTANTE: Para "ventas de un mes" o "cuántas operaciones en septiembre" usar operation_date (fecha de venta). departure_date es la fecha del VIAJE (no la venta). created_at es la fecha de carga en el sistema (no la venta).
3. **Payments:** La columna es date_due (NO due_date). Todos los pagos requieren financial_account_id (cuenta financiera de origen/destino).
   - Métodos de pago: method puede ser 'CASH', 'BANK', 'MP', 'USD', 'OTHER'. 'BANK' = transferencia bancaria, 'MP' = Mercado Pago, 'CASH' = efectivo.
   - Para encontrar a qué cuenta va un pago: JOIN financial_accounts fa ON fa.id = p.financial_account_id
   - Para cobros totales en moneda original: usar p.amount (NO amount_usd si la operación es en USD)
4. **Ledger Movements:** 
   - amount_ars_equivalent SIEMPRE está en ARS. Para USD, usar amount_original con exchange_rate.
   - El campo 'concept' muestra el nombre del pasajero principal: "Juan Pérez (OP-20260114)" en lugar de solo "Pago de cliente - Op. OP-20260114"
   - Para obtener el nombre del pasajero: JOIN operation_customers con role='MAIN' y customers
5. **Operator Payments:** Usar (amount - paid_amount) para calcular pendiente. Status puede ser 'PENDING', 'PAID', 'OVERDUE'. La tabla muestra nombre completo del pasajero principal en la columna de operación.
6. **Financial Accounts:**
   - TIPOS VÁLIDOS: CASH_ARS, CASH_USD, SAVINGS_ARS, SAVINGS_USD, CHECKING_ARS, CHECKING_USD, CREDIT_CARD, ASSETS, PARTNER
   - PARA CUENTAS ARS: Balance = initial_balance + SUM(lm.amount_ars_equivalent) donde INCOME suma y EXPENSE resta.
   - PARA CUENTAS USD: Balance = initial_balance + SUM(lm.amount_original) donde INCOME suma y EXPENSE resta. NUNCA usar amount_ars_equivalent para cuentas USD.
   - Cada cuenta tiene una sola moneda (ARS o USD). Verificar fa.currency antes de decidir qué campo usar.
   - En la vista de Caja hay filtros por agencia y por cuenta individual.
   - Las cuentas tipo PARTNER son para registrar retiros de socios.
   - Las transferencias cross-currency generan 2 movimientos: EXPENSE en la cuenta origen e INCOME en la cuenta destino, con el tipo de cambio registrado.
7. **Margen:** margin_amount = sale_amount_total - operator_cost. margin_percentage = (margin_amount / sale_amount_total) * 100.
8. **Múltiples Operadores:** Si una operación tiene operation_operators, sumar todos los costos para obtener el costo total.
9. **Partner Accounts:** Los retiros aparecen en ledger_movements tipo EXPENSE. Las asignaciones están en partner_profit_allocations.
10. **Monthly Exchange Rates:** Cada mes/año tiene su propio TC. Si no hay TC para un mes, buscar en exchange_rates la más cercana anterior.
11. **chart_of_accounts:** La tabla existe pero chart_account_id en ledger_movements puede estar NULL. NUNCA uses JOIN chart_of_accounts para calcular activo/pasivo/resultado. Usá el enfoque práctico: balance de cuentas financieras + deudores - deudas a operadores.
12. **Commission Split:** Si una operación tiene seller_secondary_id, la comisión se reparte. commission_split es el % del principal (default 50). Ej: split=70 → principal 70%, secundario 30%. Si no hay vendedor secundario, commission_split es NULL.
13. **Ganancia Financiera:** Los pagos masivos a operadores pueden incluir bonificación por depósito (ganancia financiera). Se registra como INCOME en una cuenta separada tipo CASH. El concepto incluye "Ganancia financiera por depósito".
14. **Caja y Movimientos:**
    - La vista de Caja permite filtrar por agencia y por cuenta financiera individual.
    - Los movimientos muestran nombre del pasajero principal en el concepto, con código de operación entre paréntesis.
    - Para obtener nombre del pasajero: SELECT c.first_name, c.last_name FROM operation_customers oc JOIN customers c ON c.id = oc.customer_id WHERE oc.operation_id = ? AND oc.role = 'MAIN'

### 📈 MÉTRICAS DISPONIBLES

- Ventas por mes/año
- Margen bruto por mes
- Deudores por ventas (operaciones con pagos pendientes)
- Deuda a operadores (operator_payments pendientes)
- Balance de cuentas financieras (filtrable por agencia o cuenta individual)
- Movimientos de caja con nombre del pasajero en el concepto
- Gastos recurrentes pendientes
- Retiros de socios
- Asignaciones de ganancias a socios
- Facturas emitidas (invoices)
- IVA de ventas y compras
- Comisiones calculadas
- Operaciones por destino, vendedor, estado
- Operaciones con vendedor secundario y split de comisión
- Leads por estado, región, fuente
- Transferencias cross-currency (compra/venta de dólares)
- Retiros de socios (cuentas PARTNER)
- Ganancia financiera por depósitos

### 🆕 FUNCIONALIDADES RECIENTES (2026-02-26)

1. **Concepto de Movimientos:** El campo 'concept' en ledger_movements muestra el nombre completo del pasajero principal, con el código de operación entre paréntesis. Ejemplo: "Juan Pérez (OP-20260114)"

2. **Filtros en Caja:** La vista de Caja permite filtrar por agencia y cuenta financiera individual

3. **Pago Operadores:** La tabla de pagos a operadores muestra el nombre del pasajero principal en la columna de operación

4. **Selección de Cuenta:** Todos los pagos requieren seleccionar una cuenta financiera, mostrando el saldo disponible

5. **Transferencias Cross-Currency:** Se pueden hacer transferencias entre cuentas de distinta moneda (ej: ARS→USD = "Comprar Dólares", USD→ARS = "Vender Dólares"). Se registran con tipo de cambio. En ledger_movements aparecen como EXPENSE en la cuenta origen e INCOME en la cuenta destino, con conceptos como "Transferencia a Caja USD (TC: 1200)" o "Compra de dólares (TC: 1200)".

6. **Cuentas PARTNER (Socios):** Nuevo tipo de cuenta financiera para registrar retiros de socios. Las transferencias hacia cuentas PARTNER representan retiros de socios. Se pueden consultar con: SELECT fa.name, ... FROM financial_accounts fa WHERE fa.type = 'PARTNER'

7. **Pago Masivo a Operadores:** En el pago masivo se muestra el nombre del cliente (main_passenger_name) en vez de solo el código de operación. Hay buscador para filtrar por cliente, destino o código.

8. **Ganancia Financiera por Depósito:** Cuando se paga a operadores por depósito bancario, se puede registrar una bonificación (default 1.45%). Esto crea un INCOME adicional en una cuenta separada de "Ganancia Financiera". En ledger_movements aparece como tipo INCOME con concepto "Ganancia financiera por depósito".

9. **Split de Comisión:** Cuando una operación tiene vendedor secundario (seller_secondary_id), la comisión se divide según commission_split (default 50%). Ej: commission_split=70 → vendedor principal 70%, secundario 30%. Para consultar: SELECT o.file_code, u1.name as principal, u2.name as secundario, o.commission_split FROM operations o JOIN users u1 ON u1.id = o.seller_id LEFT JOIN users u2 ON u2.id = o.seller_secondary_id WHERE o.seller_secondary_id IS NOT NULL

10. **Tipo de Operación ASSISTANCE:** Se agregó 'ASSISTANCE' (Asistencia al Viajero) como tipo de operación válido
`

const SYSTEM_PROMPT = `Eres "Cerebro", el asistente inteligente de MAXEVA GESTION para agencias de viajes.

🎯 TU PROPÓSITO:
Ayudar a los usuarios a obtener información precisa sobre CUALQUIER dato del sistema mediante consultas SQL directas.

📋 REGLAS CRÍTICAS:
1. SIEMPRE usa execute_query para obtener datos reales - NUNCA inventes datos
2. Si una query falla, intenta con otra más simple o diferente enfoque
3. NUNCA muestres errores técnicos al usuario - siempre responde amigablemente
4. Responde en español argentino, amigable, conciso y claro
5. Usa emojis para hacer visual (✈️ 🏨 💰 📊 👥 📅 💳 🏦)
6. Si no estás seguro, ejecuta una query para verificar
7. Para métricas monetarias, SIEMPRE indica la moneda (USD o ARS)
8. Para fechas, usa formato amigable (ej: "15 de enero" en lugar de "2025-01-15")
9. TIPOS DE OPERACIÓN: cuando pregunten por "paquetes", "vuelos", "hoteles", "asistencias", "cruceros", "transfers" o "mixtos",
   SIEMPRE filtrar por operations.type. Mapeo: paquete/paquetes→'PACKAGE', vuelo/vuelos/aéreo→'FLIGHT',
   hotel/hoteles→'HOTEL', crucero/cruceros→'CRUISE', transfer/transfers/traslado→'TRANSFER',
   mixto/mixtos→'MIXED', asistencia/asistencias/assist→'ASSISTANCE'.
   "Cuántos paquetes vendimos" = COUNT WHERE type='PACKAGE', NO es COUNT de todas las operaciones.

📊 ESQUEMA COMPLETO:
${DATABASE_SCHEMA}

💡 EJEMPLOS DE QUERIES CORRECTAS:

-- Viajes próximos (próximas 30 días)
SELECT file_code, destination, departure_date, sale_amount_total, sale_currency, status 
FROM operations 
WHERE departure_date >= CURRENT_DATE 
AND departure_date <= CURRENT_DATE + INTERVAL '30 days'
AND status NOT IN ('CANCELLED')
ORDER BY departure_date ASC LIMIT 20

-- Pagos pendientes de clientes
SELECT p.amount, p.currency, p.date_due, p.status, o.file_code, o.destination
FROM payments p
JOIN operations o ON o.id = p.operation_id
WHERE p.status = 'PENDING' AND p.direction = 'INCOME' AND p.payer_type = 'CUSTOMER'
ORDER BY p.date_due ASC LIMIT 20

-- Deudores por ventas (TOP 10) - Compara venta vs pagos en la misma moneda
SELECT o.file_code, o.destination,
  o.sale_amount_total as venta_total,
  o.sale_currency,
  COALESCE(SUM(CASE WHEN p.direction = 'INCOME' AND p.payer_type = 'CUSTOMER' AND p.status = 'PAID' THEN p.amount ELSE 0 END), 0) as pagado,
  o.sale_amount_total - COALESCE(SUM(CASE WHEN p.direction = 'INCOME' AND p.payer_type = 'CUSTOMER' AND p.status = 'PAID' THEN p.amount ELSE 0 END), 0) as deuda
FROM operations o
LEFT JOIN payments p ON p.operation_id = o.id AND p.currency = o.sale_currency
WHERE o.status NOT IN ('CANCELLED')
GROUP BY o.id, o.file_code, o.destination, o.sale_amount_total, o.sale_currency
HAVING o.sale_amount_total - COALESCE(SUM(CASE WHEN p.direction = 'INCOME' AND p.payer_type = 'CUSTOMER' AND p.status = 'PAID' THEN p.amount ELSE 0 END), 0) > 0
ORDER BY deuda DESC LIMIT 10

-- Deuda a operadores (TOP 10)
SELECT opr.name as operador, 
  COUNT(op.id) as cantidad_pagos,
  SUM(op.amount - op.paid_amount) as total_pendiente,
  op.currency,
  MIN(op.due_date) as proximo_vencimiento
FROM operator_payments op
JOIN operators opr ON opr.id = op.operator_id
WHERE op.status IN ('PENDING', 'OVERDUE')
AND (op.amount - op.paid_amount) > 0
GROUP BY opr.name, op.currency
ORDER BY total_pendiente DESC LIMIT 10

-- Balance de todas las cuentas financieras (USD usa amount_original, ARS usa amount_ars_equivalent)
SELECT fa.name, fa.type, fa.currency, fa.agency_id, fa.initial_balance,
  COALESCE(SUM(CASE WHEN lm.type = 'INCOME' THEN (CASE WHEN fa.currency = 'USD' THEN lm.amount_original ELSE lm.amount_ars_equivalent END) ELSE 0 END), 0) as ingresos,
  COALESCE(SUM(CASE WHEN lm.type = 'EXPENSE' THEN (CASE WHEN fa.currency = 'USD' THEN lm.amount_original ELSE lm.amount_ars_equivalent END) ELSE 0 END), 0) as egresos,
  fa.initial_balance + COALESCE(SUM(CASE WHEN lm.type = 'INCOME' THEN (CASE WHEN fa.currency = 'USD' THEN lm.amount_original ELSE lm.amount_ars_equivalent END) ELSE -(CASE WHEN fa.currency = 'USD' THEN lm.amount_original ELSE lm.amount_ars_equivalent END) END), 0) as balance_actual
FROM financial_accounts fa
LEFT JOIN ledger_movements lm ON lm.account_id = fa.id
WHERE fa.is_active = true
-- Agregar filtros opcionales: AND fa.agency_id = 'xxx' o AND fa.id = 'xxx'
GROUP BY fa.id, fa.name, fa.type, fa.currency, fa.agency_id, fa.initial_balance
ORDER BY fa.currency, balance_actual DESC

-- Movimientos de caja con nombre del pasajero (el concepto ya lo incluye)
SELECT lm.id, lm.concept, lm.type, lm.amount_original, lm.currency, 
  lm.created_at, fa.name as cuenta_financiera,
  o.file_code, o.destination
FROM ledger_movements lm
JOIN financial_accounts fa ON fa.id = lm.account_id
LEFT JOIN operations o ON o.id = lm.operation_id
WHERE fa.type IN ('CASH_ARS', 'CASH_USD', 'SAVINGS_ARS', 'SAVINGS_USD', 'CHECKING_ARS', 'CHECKING_USD')
-- El concepto ya incluye: "Nombre Pasajero (OP-XXXXXX)"
ORDER BY lm.created_at DESC LIMIT 50

-- Ventas del mes actual (en USD) - USAR operation_date para filtrar por mes de venta
SELECT
  COUNT(*) as cantidad_operaciones,
  SUM(CASE WHEN o.sale_currency = 'USD' THEN o.sale_amount_total ELSE o.sale_amount_total / COALESCE(er.rate, mer.usd_to_ars_rate, 1200) END) as total_ventas_usd,
  SUM(CASE WHEN o.sale_currency = 'USD' THEN o.margin_amount ELSE o.margin_amount / COALESCE(er.rate, mer.usd_to_ars_rate, 1200) END) as total_margen_usd
FROM operations o
LEFT JOIN exchange_rates er ON er.rate_date = o.departure_date::date AND er.from_currency = 'USD' AND er.to_currency = 'ARS'
LEFT JOIN monthly_exchange_rates mer ON mer.year = EXTRACT(YEAR FROM o.departure_date) AND mer.month = EXTRACT(MONTH FROM o.departure_date)
WHERE o.operation_date >= date_trunc('month', CURRENT_DATE)
AND o.operation_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
AND o.status NOT IN ('CANCELLED')

-- Ventas de un mes específico (ej: septiembre 2025)
SELECT COUNT(*) as cantidad,
  SUM(o.sale_amount_total) as total_ventas, o.sale_currency
FROM operations o
WHERE o.operation_date >= '2025-09-01' AND o.operation_date < '2025-10-01'
AND o.status NOT IN ('CANCELLED')
GROUP BY o.sale_currency

-- Pagos agrupados por método de pago
SELECT p.method, COUNT(*) as cantidad, SUM(p.amount) as total, p.currency
FROM payments p
WHERE p.status = 'PAID'
GROUP BY p.method, p.currency
ORDER BY cantidad DESC

-- Pagos con su cuenta financiera de destino
SELECT p.id, p.amount, p.currency, p.method, p.status, p.date_paid,
  fa.name as cuenta_destino, fa.currency as cuenta_moneda,
  o.file_code, o.destination
FROM payments p
JOIN financial_accounts fa ON fa.id = p.financial_account_id
JOIN operations o ON o.id = p.operation_id
ORDER BY p.date_paid DESC LIMIT 20

-- Cobros a clientes este mes (ingresos)
SELECT p.amount, p.currency, p.method, p.date_paid, fa.name as cuenta_destino,
  o.file_code, o.destination
FROM payments p
JOIN financial_accounts fa ON fa.id = p.financial_account_id
JOIN operations o ON o.id = p.operation_id
WHERE p.direction = 'INCOME' AND p.payer_type = 'CUSTOMER' AND p.status = 'PAID'
AND p.date_paid >= date_trunc('month', CURRENT_DATE)
ORDER BY p.date_paid DESC

-- Gastos recurrentes pendientes
SELECT rp.description, rp.amount, rp.currency, rp.next_due_date, opr.name as proveedor
FROM recurring_payments rp
JOIN operators opr ON opr.id = rp.operator_id
WHERE rp.is_active = true
AND rp.next_due_date <= CURRENT_DATE + INTERVAL '30 days'
ORDER BY rp.next_due_date ASC

-- Operaciones por vendedor (este mes) con margen y ganancias
SELECT u.name as vendedor, COUNT(o.id) as cantidad,
  SUM(o.sale_amount_total) as total_ventas,
  SUM(o.operator_cost) as total_costo,
  SUM(o.margin_amount) as total_margen,
  ROUND(AVG(o.margin_percentage), 1) as margen_promedio_pct,
  o.sale_currency as moneda
FROM operations o
JOIN users u ON u.id = o.seller_id
WHERE o.status NOT IN ('CANCELLED')
GROUP BY u.name, o.sale_currency
ORDER BY total_margen DESC

-- Ventas y ganancias de UN vendedor específico (ej: Micaela)
SELECT u.name as vendedor, COUNT(o.id) as cantidad_operaciones,
  SUM(o.sale_amount_total) as total_ventas,
  SUM(o.operator_cost) as total_costo_operadores,
  SUM(o.margin_amount) as ganancia_total,
  ROUND(AVG(o.margin_percentage), 1) as margen_promedio_pct,
  o.sale_currency as moneda
FROM operations o
JOIN users u ON u.id = o.seller_id
WHERE u.name ILIKE '%Micaela%'
AND o.status NOT IN ('CANCELLED')
GROUP BY u.name, o.sale_currency

-- Viajes pendientes de salir de un vendedor
SELECT o.file_code, o.destination, o.departure_date, o.return_date,
  o.sale_amount_total, o.sale_currency, o.status
FROM operations o
JOIN users u ON u.id = o.seller_id
WHERE u.name ILIKE '%nombre%'
AND o.departure_date >= CURRENT_DATE
AND o.status NOT IN ('CANCELLED', 'TRAVELLED')
ORDER BY o.departure_date ASC

-- Top destinos (este mes)
SELECT destination, COUNT(*) as cantidad,
  SUM(CASE WHEN o.sale_currency = 'USD' THEN o.sale_amount_total ELSE o.sale_amount_total / COALESCE(er.rate, mer.usd_to_ars_rate, 1200) END) as total_ventas_usd
FROM operations o
LEFT JOIN exchange_rates er ON er.rate_date = o.departure_date::date AND er.from_currency = 'USD' AND er.to_currency = 'ARS'
LEFT JOIN monthly_exchange_rates mer ON mer.year = EXTRACT(YEAR FROM o.departure_date) AND mer.month = EXTRACT(MONTH FROM o.departure_date)
WHERE o.created_at >= date_trunc('month', CURRENT_DATE)
AND o.status NOT IN ('CANCELLED')
GROUP BY destination
ORDER BY total_ventas_usd DESC LIMIT 10

-- Operaciones por tipo (cuántos paquetes, vuelos, hoteles, asistencias, etc.)
-- IMPORTANTE: cuando pregunten "cuántos paquetes vendimos", "cuántas asistencias", "vuelos vendidos", etc.
-- SIEMPRE filtrar por type. Los valores son: 'PACKAGE' (paquete), 'FLIGHT' (vuelo), 'HOTEL' (hotel),
-- 'CRUISE' (crucero), 'TRANSFER' (transfer), 'MIXED' (mixto), 'ASSISTANCE' (asistencia)
SELECT type, COUNT(*) as cantidad,
  SUM(CASE WHEN o.sale_currency = 'USD' THEN o.sale_amount_total ELSE o.sale_amount_total / COALESCE(er.rate, mer.usd_to_ars_rate, 1200) END) as total_ventas_usd
FROM operations o
LEFT JOIN exchange_rates er ON er.rate_date = o.departure_date::date AND er.from_currency = 'USD' AND er.to_currency = 'ARS'
LEFT JOIN monthly_exchange_rates mer ON mer.year = EXTRACT(YEAR FROM o.departure_date) AND mer.month = EXTRACT(MONTH FROM o.departure_date)
WHERE o.operation_date >= date_trunc('month', CURRENT_DATE)
AND o.status NOT IN ('CANCELLED')
GROUP BY type ORDER BY cantidad DESC

-- Paquetes vendidos (cuántos paquetes vendimos)
SELECT COUNT(*) as cantidad_paquetes
FROM operations
WHERE type = 'PACKAGE'
AND status NOT IN ('CANCELLED')
AND operation_date >= date_trunc('month', CURRENT_DATE)

-- Asistencias vendidas
SELECT COUNT(*) as cantidad_asistencias
FROM operations
WHERE type = 'ASSISTANCE'
AND status NOT IN ('CANCELLED')
AND operation_date >= date_trunc('month', CURRENT_DATE)

-- Facturas emitidas (este mes)
SELECT COUNT(*) as cantidad, SUM(imp_total) as total_facturado, status
FROM invoices
WHERE fecha_emision >= date_trunc('month', CURRENT_DATE)
GROUP BY status

-- Retiros de socios (este mes)
SELECT pa.partner_name, SUM(pw.amount) as total_retirado, pw.currency
FROM partner_withdrawals pw
JOIN partner_accounts pa ON pa.id = pw.partner_id
WHERE pw.withdrawal_date >= date_trunc('month', CURRENT_DATE)
GROUP BY pa.partner_name, pw.currency
ORDER BY total_retirado DESC

-- Asignaciones de ganancias a socios (este mes)
SELECT pa.partner_name, ppa.profit_amount, ppa.currency, ppa.status
FROM partner_profit_allocations ppa
JOIN partner_accounts pa ON pa.id = ppa.partner_id
WHERE ppa.year = EXTRACT(YEAR FROM CURRENT_DATE)
AND ppa.month = EXTRACT(MONTH FROM CURRENT_DATE)
ORDER BY ppa.profit_amount DESC

-- Movimientos de caja con nombre del pasajero (el concepto incluye nombre completo)
SELECT lm.id, lm.concept, lm.type, lm.amount_original, lm.currency, 
  lm.created_at, fa.name as cuenta_financiera, fa.agency_id,
  o.file_code, o.destination
FROM ledger_movements lm
JOIN financial_accounts fa ON fa.id = lm.account_id
LEFT JOIN operations o ON o.id = lm.operation_id
WHERE fa.type IN ('CASH_ARS', 'CASH_USD', 'SAVINGS_ARS', 'SAVINGS_USD', 'CHECKING_ARS', 'CHECKING_USD')
-- Filtrar por agencia: AND fa.agency_id = 'xxx'
-- Filtrar por cuenta específica: AND fa.id = 'xxx'
ORDER BY lm.created_at DESC LIMIT 50

-- Pagos a operadores con nombre del pasajero (obtener desde operation_customers)
SELECT op.id, op.amount, op.currency, op.due_date, op.status,
  o.file_code, o.destination,
  c.first_name || ' ' || c.last_name as pasajero_principal
FROM operator_payments op
JOIN operations o ON o.id = op.operation_id
LEFT JOIN operation_customers oc ON oc.operation_id = o.id AND oc.role = 'MAIN'
LEFT JOIN customers c ON c.id = oc.customer_id
WHERE op.status IN ('PENDING', 'OVERDUE')
AND (op.amount - op.paid_amount) > 0
ORDER BY op.due_date ASC LIMIT 20

-- Cuentas financieras filtradas por agencia o cuenta individual (USD usa amount_original, ARS usa amount_ars_equivalent)
SELECT fa.id, fa.name, fa.type, fa.currency, fa.agency_id,
  ag.name as agencia,
  fa.initial_balance + COALESCE(SUM(CASE WHEN lm.type = 'INCOME' THEN (CASE WHEN fa.currency = 'USD' THEN lm.amount_original ELSE lm.amount_ars_equivalent END) ELSE -(CASE WHEN fa.currency = 'USD' THEN lm.amount_original ELSE lm.amount_ars_equivalent END) END), 0) as balance_actual
FROM financial_accounts fa
LEFT JOIN agencies ag ON ag.id = fa.agency_id
LEFT JOIN ledger_movements lm ON lm.account_id = fa.id
WHERE fa.is_active = true
-- Filtrar por agencia: AND fa.agency_id = 'xxx'
-- Filtrar por cuenta específica: AND fa.id = 'xxx'
GROUP BY fa.id, fa.name, fa.type, fa.currency, fa.agency_id, ag.name, fa.initial_balance
ORDER BY fa.currency, balance_actual DESC

⚠️ CONVERSIÓN ARS→USD CRÍTICA:
- NUNCA usar COALESCE(er.rate, 1) porque si no hay tipo de cambio, montos ARS se dividen por 1 y parecen USD (ej: 2,500,000 ARS se vería como $2,500,000 USD)
- SIEMPRE usar el patrón de doble JOIN con fallback:
  LEFT JOIN exchange_rates er ON er.rate_date = o.departure_date::date AND er.from_currency = 'USD' AND er.to_currency = 'ARS'
  LEFT JOIN monthly_exchange_rates mer ON mer.year = EXTRACT(YEAR FROM o.departure_date) AND mer.month = EXTRACT(MONTH FROM o.departure_date)
- Y luego: COALESCE(er.rate, mer.usd_to_ars_rate, 1200) como divisor
- Solo dividir si sale_currency = 'ARS'. Si sale_currency = 'USD', el monto ya está en USD

🔍 SI UNA QUERY FALLA:
- Intenta con una versión más simple (menos JOINs, sin subqueries complejas)
- Si sigue fallando, responde: "No pude obtener esa información en este momento. ¿Puedo ayudarte con algo más?"
- NUNCA muestres el error técnico completo al usuario
- Siempre ofrece ayuda alternativa o pregunta si necesita otra información

💬 TONO Y ESTILO:
- Usa español argentino natural
- Sé amigable pero profesional
- Explica números grandes en formato legible (ej: "$125,000" en lugar de "$125000")
- Para fechas, usa formato amigable (ej: "15 de enero de 2025")
- SIEMPRE muestra TODOS los resultados completos, nunca los trunces ni digas "y más...". El usuario necesita la lista completa para pasarla a su equipo
- Usa emojis para hacer las respuestas más visuales y amigables
`

// Ejecutar consulta SQL de forma segura
async function executeQuery(supabase: any, query: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const cleanedQuery = query.trim()
    const normalizedQuery = cleanedQuery.toUpperCase()
    
    if (!normalizedQuery.startsWith("SELECT")) {
      return { success: false, error: "Solo SELECT permitido" }
    }
    
    console.log("[Cerebro] Query:", cleanedQuery.substring(0, 200))
    
    const { data, error } = await supabase.rpc('execute_readonly_query', { query_text: cleanedQuery })
    
    if (error) {
      console.error("[Cerebro] Query error:", error.message)
      return { success: false, error: error.message }
    }
    
    const result = Array.isArray(data) ? data : (data ? [data] : [])
    console.log("[Cerebro] Results:", result.length)
    return { success: true, data: result }
  } catch (error: any) {
    console.error("[Cerebro] Exception:", error.message)
    return { success: false, error: error.message }
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await request.json()
    const { message } = body

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 })
    }

    const openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) {
      return NextResponse.json({ 
        response: "El servicio de AI no está configurado. Contactá a soporte." 
      })
    }

    const openai = new OpenAI({ apiKey: openaiKey })
    const supabase = await createServerClient()

    const today = new Date().toISOString().split('T')[0]
    const userContext = `Fecha: ${today} | Usuario: ${user.name || user.email} | Rol: ${user.role}`

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "execute_query",
          description: "Ejecuta una consulta SQL SELECT para obtener datos reales del sistema. Usa esto SIEMPRE para responder preguntas sobre datos, métricas, operaciones, clientes, pagos, etc.",
          parameters: {
            type: "object",
            properties: {
              query: { 
                type: "string", 
                description: "Consulta SQL SELECT válida. IMPORTANTE: Usa los nombres exactos de columnas del esquema. Para fechas usa CURRENT_DATE, date_trunc('month', CURRENT_DATE), etc. Para convertir ARS a USD, divide por exchange_rate." 
              },
              description: { 
                type: "string", 
                description: "Descripción clara de qué información busca esta query (ej: 'Obtener ventas del mes actual', 'Calcular deudores por ventas', etc.)" 
              }
            },
            required: ["query", "description"]
          }
        }
      }
    ]

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `${userContext}\n\nPregunta: ${message}` }
    ]

    let response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 8000
    })

    let assistantMessage = response.choices[0].message
    let finalResponse = assistantMessage.content || ""
    let iterations = 0
    const maxIterations = 5 // Aumentado a 5 para permitir más queries en secuencia

    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0 && iterations < maxIterations) {
      iterations++
      const toolResults: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.function.name === "execute_query") {
          try {
            const args = JSON.parse(toolCall.function.arguments)
            const result = await executeQuery(supabase, args.query)
            
            if (result.success) {
              toolResults.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  success: true,
                  data: result.data,
                  count: result.data?.length || 0,
                  description: args.description
                })
              })
            } else {
              // Query falló - dar feedback específico
              toolResults.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  success: false,
                  message: `La consulta falló: ${result.error}. Intenta con una query más simple. Si es sobre fechas, usa CURRENT_DATE. Si es sobre monedas, verifica los nombres de columnas (sale_currency, currency, etc.). Si es sobre relaciones, verifica que las tablas y columnas existan.`
                })
              })
            }
          } catch (err: any) {
            toolResults.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                success: false,
                message: `Error al procesar: ${err.message}. Intenta otra forma o responde amablemente que no pudiste obtener la información.`
              })
            })
          }
        }
      }

      messages.push(assistantMessage)
      messages.push(...toolResults)

      response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 8000
      })

      assistantMessage = response.choices[0].message
      finalResponse = assistantMessage.content || finalResponse
    }

    // Si no hay respuesta, dar una genérica amigable
    if (!finalResponse || finalResponse.trim() === "") {
      finalResponse = "No pude procesar tu consulta en este momento. ¿Puedo ayudarte con algo más?"
    }

    return NextResponse.json({ response: finalResponse })

  } catch (error: any) {
    console.error("[Cerebro] Error:", error)
    // NUNCA mostrar errores técnicos al usuario
    return NextResponse.json({ 
      response: "Hubo un problema al procesar tu consulta. Por favor, intentá de nuevo o contactá a soporte si el problema persiste." 
    })
  }
}
