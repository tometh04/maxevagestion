import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import OpenAI from "openai"
import { createServerClient } from "@/lib/supabase/server"

// Esquema COMPLETO de la base de datos - ACTUALIZADO 2025-01-19
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
- id, file_code, agency_id, seller_id, operator_id, lead_id
- type ('FLIGHT','HOTEL','PACKAGE','CRUISE','TRANSFER','MIXED')
- origin, destination, departure_date, return_date
- adults, children, infants
- status ('PRE_RESERVATION','RESERVED','CONFIRMED','CANCELLED','TRAVELLED','CLOSED')
- sale_amount_total (venta total), sale_currency ('ARS','USD')
- operator_cost (costo total), operator_cost_currency ('ARS','USD')
- margin_amount (ganancia), margin_percentage (margen %)
- reservation_code_air, reservation_code_hotel (códigos de reserva)
- created_at, updated_at

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

#### financial_accounts (Cuentas Financieras) - Caja, Bancos, Mercado Pago
- id, name, type ('CASH','BANK','MP','USD'), currency ('ARS','USD')
- initial_balance (saldo inicial), current_balance (saldo actual calculado)
- chart_account_id (relación con plan de cuentas), is_active
- created_at, created_by, notes

#### ledger_movements (Movimientos Contables) - CORAZÓN CONTABLE ⭐
- id, operation_id, lead_id, type ('INCOME','EXPENSE','FX_GAIN','FX_LOSS','COMMISSION','OPERATOR_PAYMENT')
- concept, notes, currency ('ARS','USD')
- amount_original (monto en moneda original)
- exchange_rate (tasa usada), amount_ars_equivalent (siempre en ARS)
- method ('CASH','BANK','MP','USD','OTHER')
- account_id (FK a financial_accounts), chart_account_id (FK a chart_of_accounts)
- seller_id, operator_id, receipt_number
- created_at, created_by

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
\`\`\`sql
SELECT fa.id, fa.name, fa.type, fa.currency, fa.initial_balance,
  COALESCE(SUM(CASE WHEN lm.type = 'INCOME' THEN lm.amount_ars_equivalent ELSE 0 END), 0) as ingresos,
  COALESCE(SUM(CASE WHEN lm.type = 'EXPENSE' THEN lm.amount_ars_equivalent ELSE 0 END), 0) as egresos,
  fa.initial_balance + COALESCE(SUM(CASE WHEN lm.type = 'INCOME' THEN lm.amount_ars_equivalent ELSE -lm.amount_ars_equivalent END), 0) as balance_actual
FROM financial_accounts fa
LEFT JOIN ledger_movements lm ON lm.account_id = fa.id
WHERE fa.is_active = true
GROUP BY fa.id, fa.name, fa.type, fa.currency, fa.initial_balance
\`\`\`

#### Deudores por Ventas (Cuentas por Cobrar):
\`\`\`sql
SELECT o.id, o.file_code, o.destination, o.sale_amount_total, o.sale_currency,
  COALESCE(SUM(CASE WHEN p.direction = 'INCOME' AND p.payer_type = 'CUSTOMER' AND p.status = 'PAID' THEN p.amount_usd ELSE 0 END), 0) as pagado_usd,
  (o.sale_amount_total / COALESCE(er.rate, 1)) - COALESCE(SUM(CASE WHEN p.direction = 'INCOME' AND p.payer_type = 'CUSTOMER' AND p.status = 'PAID' THEN p.amount_usd ELSE 0 END), 0) as deuda_usd
FROM operations o
LEFT JOIN payments p ON p.operation_id = o.id
LEFT JOIN exchange_rates er ON er.rate_date = o.departure_date::date AND er.from_currency = 'USD' AND er.to_currency = 'ARS'
WHERE o.status NOT IN ('CANCELLED')
GROUP BY o.id, o.file_code, o.destination, o.sale_amount_total, o.sale_currency, er.rate
HAVING (o.sale_amount_total / COALESCE(er.rate, 1)) - COALESCE(SUM(CASE WHEN p.direction = 'INCOME' AND p.payer_type = 'CUSTOMER' AND p.status = 'PAID' THEN p.amount_usd ELSE 0 END), 0) > 0
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
  SUM(CASE WHEN o.sale_currency = 'USD' THEN o.sale_amount_total ELSE o.sale_amount_total / er.rate END) as total_usd,
  SUM(o.margin_amount / COALESCE(er.rate, 1)) as margen_usd
FROM operations o
LEFT JOIN exchange_rates er ON er.rate_date = o.departure_date::date AND er.from_currency = 'USD' AND er.to_currency = 'ARS'
WHERE o.created_at >= date_trunc('month', CURRENT_DATE)
AND o.status NOT IN ('CANCELLED')
\`\`\`

#### Posición Contable Mensual (Activo = Pasivo + Patrimonio Neto):
\`\`\`sql
-- ACTIVO CORRIENTE
SELECT SUM(COALESCE(lm.amount_ars_equivalent, 0)) as activo_corriente
FROM ledger_movements lm
JOIN chart_of_accounts coa ON coa.id = lm.chart_account_id
WHERE coa.category = 'ACTIVO' AND coa.subcategory = 'CORRIENTE'
AND DATE_TRUNC('month', lm.created_at) = DATE_TRUNC('month', CURRENT_DATE)

-- PASIVO CORRIENTE
SELECT SUM(COALESCE(lm.amount_ars_equivalent, 0)) as pasivo_corriente
FROM ledger_movements lm
JOIN chart_of_accounts coa ON coa.id = lm.chart_account_id
WHERE coa.category = 'PASIVO' AND coa.subcategory = 'CORRIENTE'
AND DATE_TRUNC('month', lm.created_at) = DATE_TRUNC('month', CURRENT_DATE)

-- RESULTADO DEL MES (Ingresos - Costos - Gastos)
SELECT 
  SUM(CASE WHEN coa.subcategory = 'INGRESOS' THEN lm.amount_ars_equivalent ELSE 0 END) as ingresos,
  SUM(CASE WHEN coa.subcategory = 'COSTOS' THEN lm.amount_ars_equivalent ELSE 0 END) as costos,
  SUM(CASE WHEN coa.subcategory = 'GASTOS' THEN lm.amount_ars_equivalent ELSE 0 END) as gastos
FROM ledger_movements lm
JOIN chart_of_accounts coa ON coa.id = lm.chart_account_id
WHERE coa.category = 'RESULTADO'
AND DATE_TRUNC('month', lm.created_at) = DATE_TRUNC('month', CURRENT_DATE)
\`\`\`

### ⚠️ NOTAS CRÍTICAS

1. **Monedas:** Siempre convertir a USD usando exchange_rates. Si operation.sale_currency = 'USD', usar directamente. Si es 'ARS', dividir por exchange_rate.
2. **Fechas:** Usar CURRENT_DATE, date_trunc('month', CURRENT_DATE), etc. Para fechas de operaciones usar departure_date o created_at según corresponda.
3. **Payments:** La columna es date_due (NO due_date). Usar amount_usd para cálculos en USD.
4. **Ledger Movements:** amount_ars_equivalent SIEMPRE está en ARS. Para USD, usar amount_original con exchange_rate.
5. **Operator Payments:** Usar (amount - paid_amount) para calcular pendiente. Status puede ser 'PENDING', 'PAID', 'OVERDUE'.
6. **Financial Accounts:** Balance = initial_balance + SUM(ledger_movements.amount_ars_equivalent) donde INCOME suma y EXPENSE resta.
7. **Margen:** margin_amount = sale_amount_total - operator_cost. margin_percentage = (margin_amount / sale_amount_total) * 100.
8. **Múltiples Operadores:** Si una operación tiene operation_operators, sumar todos los costos para obtener el costo total.
9. **Partner Accounts:** Los retiros aparecen en ledger_movements tipo EXPENSE. Las asignaciones están en partner_profit_allocations.
10. **Monthly Exchange Rates:** Cada mes/año tiene su propio TC. Si no hay TC para un mes, buscar en exchange_rates la más cercana anterior.

### 📈 MÉTRICAS DISPONIBLES

- Ventas por mes/año
- Margen bruto por mes
- Deudores por ventas (operaciones con pagos pendientes)
- Deuda a operadores (operator_payments pendientes)
- Balance de cuentas financieras
- Gastos recurrentes pendientes
- Retiros de socios
- Asignaciones de ganancias a socios
- Facturas emitidas (invoices)
- IVA de ventas y compras
- Comisiones calculadas
- Operaciones por destino, vendedor, estado
- Leads por estado, región, fuente
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

-- Deudores por ventas (TOP 10)
SELECT o.file_code, o.destination, 
  o.sale_amount_total as venta_total,
  o.sale_currency,
  COALESCE(SUM(CASE WHEN p.direction = 'INCOME' AND p.payer_type = 'CUSTOMER' AND p.status = 'PAID' THEN p.amount_usd ELSE 0 END), 0) as pagado_usd,
  (o.sale_amount_total / COALESCE((SELECT rate FROM exchange_rates WHERE rate_date <= o.departure_date::date AND from_currency = 'USD' AND to_currency = 'ARS' ORDER BY rate_date DESC LIMIT 1), 1)) - 
  COALESCE(SUM(CASE WHEN p.direction = 'INCOME' AND p.payer_type = 'CUSTOMER' AND p.status = 'PAID' THEN p.amount_usd ELSE 0 END), 0) as deuda_usd
FROM operations o
LEFT JOIN payments p ON p.operation_id = o.id
WHERE o.status NOT IN ('CANCELLED')
GROUP BY o.id, o.file_code, o.destination, o.sale_amount_total, o.sale_currency, o.departure_date
HAVING (o.sale_amount_total / COALESCE((SELECT rate FROM exchange_rates WHERE rate_date <= o.departure_date::date AND from_currency = 'USD' AND to_currency = 'ARS' ORDER BY rate_date DESC LIMIT 1), 1)) - 
  COALESCE(SUM(CASE WHEN p.direction = 'INCOME' AND p.payer_type = 'CUSTOMER' AND p.status = 'PAID' THEN p.amount_usd ELSE 0 END), 0) > 0
ORDER BY deuda_usd DESC LIMIT 10

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

-- Balance de todas las cuentas financieras
SELECT fa.name, fa.type, fa.currency, fa.initial_balance,
  COALESCE(SUM(CASE WHEN lm.type = 'INCOME' THEN lm.amount_ars_equivalent ELSE 0 END), 0) as ingresos,
  COALESCE(SUM(CASE WHEN lm.type = 'EXPENSE' THEN lm.amount_ars_equivalent ELSE 0 END), 0) as egresos,
  fa.initial_balance + COALESCE(SUM(CASE WHEN lm.type = 'INCOME' THEN lm.amount_ars_equivalent ELSE -lm.amount_ars_equivalent END), 0) as balance_actual
FROM financial_accounts fa
LEFT JOIN ledger_movements lm ON lm.account_id = fa.id
WHERE fa.is_active = true
GROUP BY fa.id, fa.name, fa.type, fa.currency, fa.initial_balance
ORDER BY fa.currency, balance_actual DESC

-- Ventas del mes actual (en USD)
SELECT 
  COUNT(*) as cantidad_operaciones,
  SUM(CASE WHEN o.sale_currency = 'USD' THEN o.sale_amount_total ELSE o.sale_amount_total / COALESCE(er.rate, 1) END) as total_ventas_usd,
  SUM(CASE WHEN o.sale_currency = 'USD' THEN o.margin_amount ELSE o.margin_amount / COALESCE(er.rate, 1) END) as total_margen_usd
FROM operations o
LEFT JOIN exchange_rates er ON er.rate_date = o.departure_date::date AND er.from_currency = 'USD' AND er.to_currency = 'ARS'
WHERE o.created_at >= date_trunc('month', CURRENT_DATE)
AND o.status NOT IN ('CANCELLED')

-- Gastos recurrentes pendientes
SELECT rp.description, rp.amount, rp.currency, rp.next_due_date, opr.name as proveedor
FROM recurring_payments rp
JOIN operators opr ON opr.id = rp.operator_id
WHERE rp.is_active = true
AND rp.next_due_date <= CURRENT_DATE + INTERVAL '30 days'
ORDER BY rp.next_due_date ASC

-- Operaciones por vendedor (este mes)
SELECT u.name as vendedor, COUNT(o.id) as cantidad, 
  SUM(CASE WHEN o.sale_currency = 'USD' THEN o.sale_amount_total ELSE o.sale_amount_total / COALESCE(er.rate, 1) END) as total_ventas_usd
FROM operations o
JOIN users u ON u.id = o.seller_id
LEFT JOIN exchange_rates er ON er.rate_date = o.departure_date::date AND er.from_currency = 'USD' AND to_currency = 'ARS'
WHERE o.created_at >= date_trunc('month', CURRENT_DATE)
AND o.status NOT IN ('CANCELLED')
GROUP BY u.name
ORDER BY total_ventas_usd DESC

-- Top destinos (este mes)
SELECT destination, COUNT(*) as cantidad,
  SUM(CASE WHEN sale_currency = 'USD' THEN sale_amount_total ELSE sale_amount_total / COALESCE(er.rate, 1) END) as total_ventas_usd
FROM operations o
LEFT JOIN exchange_rates er ON er.rate_date = o.departure_date::date AND er.from_currency = 'USD' AND to_currency = 'ARS'
WHERE o.created_at >= date_trunc('month', CURRENT_DATE)
AND o.status NOT IN ('CANCELLED')
GROUP BY destination
ORDER BY total_ventas_usd DESC LIMIT 10

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
- Si hay muchos resultados, muestra solo los primeros y menciona el total
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
      max_tokens: 2000
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
        max_tokens: 2000
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
