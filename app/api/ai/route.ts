import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import OpenAI from "openai"
import { withRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { validateRequest, aiCopilotSchema } from "@/lib/validation"
import { createAuditLog, getRequestMetadata } from "@/lib/audit-log"
import { createServerClient } from "@/lib/supabase/server"

// Esquema completo de la base de datos para que el AI lo entienda
const DATABASE_SCHEMA = `
## ESQUEMA DE BASE DE DATOS - MAXEVA GESTION (Agencia de Viajes)

### TABLA: users (Usuarios del sistema)
- id: UUID (PK)
- auth_id: UUID (ID de Supabase Auth)
- name: TEXT (Nombre completo)
- email: TEXT (Email único)
- role: TEXT ('SUPER_ADMIN', 'ADMIN', 'SELLER', 'CONTABLE', 'VIEWER')
- is_active: BOOLEAN
- commission_percentage: NUMERIC (% de comisión del vendedor)
- created_at, updated_at: TIMESTAMP

### TABLA: agencies (Agencias/Sucursales)
- id: UUID (PK)
- name: TEXT (Nombre: "Rosario", "Madero")
- city: TEXT
- timezone: TEXT
- created_at, updated_at: TIMESTAMP

### TABLA: user_agencies (Relación usuarios-agencias)
- id: UUID (PK)
- user_id: UUID (FK → users)
- agency_id: UUID (FK → agencies)

### TABLA: operators (Operadores mayoristas/proveedores)
- id: UUID (PK)
- name: TEXT (Nombre del operador)
- contact_name, contact_email, contact_phone: TEXT
- credit_limit: NUMERIC
- created_at, updated_at: TIMESTAMP

### TABLA: customers (Clientes/Pasajeros)
- id: UUID (PK)
- first_name, last_name: TEXT
- phone, email: TEXT
- instagram_handle: TEXT
- document_type: TEXT (DNI, PASAPORTE, etc)
- document_number: TEXT
- date_of_birth: DATE
- nationality: TEXT
- created_at, updated_at: TIMESTAMP

### TABLA: leads (Leads/Consultas de potenciales clientes)
- id: UUID (PK)
- agency_id: UUID (FK → agencies)
- source: TEXT ('Instagram', 'WhatsApp', 'Meta Ads', 'Trello', 'Web', 'Referido', 'Other')
- external_id: TEXT (ID de Trello si viene de ahí)
- trello_url: TEXT
- trello_list_id: TEXT (ID de la lista de Trello)
- status: TEXT ('NEW', 'IN_PROGRESS', 'QUOTED', 'WON', 'LOST')
- region: TEXT ('ARGENTINA', 'CARIBE', 'BRASIL', 'EUROPA', 'EEUU', 'OTROS', 'CRUCEROS')
- destination: TEXT (Destino consultado)
- contact_name, contact_phone, contact_email, contact_instagram: TEXT
- assigned_seller_id: UUID (FK → users, vendedor asignado)
- notes: TEXT
- has_deposit: BOOLEAN (Si dejó seña)
- deposit_amount: NUMERIC
- deposit_currency: TEXT
- travel_date, return_date: DATE
- created_at, updated_at: TIMESTAMP

### TABLA: operations (Operaciones/Ventas cerradas) ⭐ TABLA MÁS IMPORTANTE
- id: UUID (PK)
- file_code: TEXT (Código único: "OP-20250115-abc123")
- agency_id: UUID (FK → agencies)
- lead_id: UUID (FK → leads, lead que originó la venta)
- seller_id: UUID (FK → users, vendedor principal)
- seller_secondary_id: UUID (FK → users, vendedor secundario para comisiones compartidas)
- operator_id: UUID (FK → operators, operador/proveedor)
- customer_id: UUID (FK → customers, cliente principal)
- type: TEXT ('FLIGHT', 'HOTEL', 'PACKAGE', 'CRUISE', 'TRANSFER', 'MIXED')
- product_type: TEXT ('AEREO', 'HOTEL', 'PAQUETE', 'CRUCERO', 'OTRO')
- origin, destination: TEXT
- departure_date, return_date: DATE (Fechas del viaje)
- checkin_date, checkout_date: DATE (Para hoteles)
- adults, children, infants: INTEGER
- status: TEXT ('PRE_RESERVATION', 'RESERVED', 'CONFIRMED', 'CANCELLED', 'TRAVELLED', 'CLOSED')
- sale_amount_total: NUMERIC (Precio de venta al cliente) 💰
- sale_currency: TEXT ('ARS', 'USD')
- operator_cost: NUMERIC (Costo que nos cobra el operador) 💰
- operator_cost_currency: TEXT ('ARS', 'USD')
- margin_amount: NUMERIC (Ganancia = sale_amount_total - operator_cost) 💰
- margin_percentage: NUMERIC (% de margen)
- commission_amount: NUMERIC (Comisión del vendedor)
- commission_paid: BOOLEAN
- passengers: JSONB (Info de pasajeros)
- notes: TEXT
- created_at, updated_at: TIMESTAMP

### TABLA: payments (Pagos - cobros a clientes y pagos a operadores)
- id: UUID (PK)
- operation_id: UUID (FK → operations)
- payer_type: TEXT ('CUSTOMER' = cliente nos paga, 'OPERATOR' = nosotros pagamos al operador)
- direction: TEXT ('INCOME' = entra dinero, 'EXPENSE' = sale dinero)
- method: TEXT ('CASH', 'TRANSFER', 'CREDIT_CARD', 'DEBIT_CARD', 'MP', 'CHECK')
- amount: NUMERIC 💰
- currency: TEXT ('ARS', 'USD')
- date_due: DATE (Fecha de vencimiento)
- date_paid: DATE (Fecha en que se pagó)
- status: TEXT ('PENDING', 'PAID', 'OVERDUE')
- reference: TEXT
- created_at, updated_at: TIMESTAMP

### TABLA: financial_accounts (Cuentas financieras/Cajas)
- id: UUID (PK)
- name: TEXT (Nombre: "Caja ARS", "Banco Galicia USD", etc)
- type: TEXT ('SAVINGS_ARS', 'SAVINGS_USD', 'CHECKING_ARS', 'CHECKING_USD', 'CASH_ARS', 'CASH_USD', 'CREDIT_CARD', 'ASSETS')
- currency: TEXT ('ARS', 'USD')
- initial_balance: NUMERIC
- agency_id: UUID (FK → agencies)
- is_active: BOOLEAN
- account_number: TEXT (Número de cuenta bancaria)
- card_number, card_holder, bank_name, card_expiry_date, card_cvv: TEXT (Para tarjetas)
- asset_type, asset_description, asset_quantity: TEXT/INTEGER (Para activos)
- created_at, updated_at: TIMESTAMP

### TABLA: ledger_movements (Libro Mayor - Movimientos contables) ⭐ CONTABILIDAD
- id: UUID (PK)
- operation_id: UUID (FK → operations)
- lead_id: UUID (FK → leads) - si el movimiento es de un lead
- payment_id: UUID (FK → payments) - si viene de un pago
- account_id: UUID (FK → financial_accounts)
- type: TEXT ('INCOME', 'EXPENSE', 'FX_GAIN', 'FX_LOSS', 'OPERATOR_PAYMENT', 'COMMISSION')
- concept: TEXT (descripción del movimiento)
- amount_original: NUMERIC (monto en moneda original)
- currency: TEXT ('ARS', 'USD')
- exchange_rate: NUMERIC (tasa de cambio si es USD)
- amount_ars_equivalent: NUMERIC (equivalente en ARS para reportes)
- method: TEXT ('CASH', 'BANK', 'MP', 'USD', 'OTHER')
- seller_id, operator_id: UUID (FKs opcionales)
- receipt_number: TEXT
- notes: TEXT
- created_at: TIMESTAMP
NOTA: Este es el LIBRO MAYOR. Cada pago genera un movimiento aquí. Eliminar un pago elimina su movimiento.

### TABLA: cash_boxes (Cajas físicas/virtuales)
- id: UUID (PK)
- agency_id: UUID (FK → agencies)
- name: TEXT (Nombre: "Caja Principal", "Caja Chica", etc)
- description: TEXT
- box_type: TEXT ('MAIN', 'PETTY', 'USD', 'BANK', 'OTHER')
- currency: TEXT ('ARS', 'USD')
- initial_balance: NUMERIC
- current_balance: NUMERIC (calculado automáticamente)
- is_active: BOOLEAN
- is_default: BOOLEAN (caja por defecto de la agencia)
- notes: TEXT
- created_at, updated_at: TIMESTAMP
- created_by: UUID (FK → users)

### TABLA: cash_movements (Movimientos de Caja) ⭐ CAJA
- id: UUID (PK)
- operation_id: UUID (FK → operations)
- payment_id: UUID (FK → payments) - si viene de un pago
- cash_box_id: UUID (FK → cash_boxes)
- user_id: UUID (FK → users, quien registró)
- type: TEXT ('INCOME', 'EXPENSE')
- category: TEXT ('SALE', 'OPERATOR_PAYMENT', 'COMMISSION', etc)
- amount: NUMERIC
- currency: TEXT
- movement_date: TIMESTAMP
- notes: TEXT
- is_touristic: BOOLEAN
NOTA: Registra entradas/salidas de dinero de las cajas. Pagos generan movimientos aquí automáticamente.

### TABLA: iva_sales (IVA Ventas - Débito Fiscal) ⭐ IVA
- id: UUID (PK)
- operation_id: UUID (FK → operations)
- sale_amount_total: NUMERIC (total de la venta)
- net_amount: NUMERIC (neto gravado = total / 1.21)
- iva_amount: NUMERIC (IVA 21% = total - neto)
- currency: TEXT
- sale_date: DATE
NOTA: Se crea automáticamente al crear operación. Se actualiza si cambia el monto de venta.

### TABLA: iva_purchases (IVA Compras - Crédito Fiscal) ⭐ IVA
- id: UUID (PK)
- operation_id: UUID (FK → operations)
- operator_id: UUID (FK → operators)
- operator_cost_total: NUMERIC (costo del operador)
- net_amount: NUMERIC (neto gravado = total / 1.21)
- iva_amount: NUMERIC (IVA 21% = total - neto)
- currency: TEXT
- purchase_date: DATE
NOTA: Se crea automáticamente al crear operación. Se actualiza si cambia el costo del operador.

### TABLA: operator_payments (Cuentas a Pagar a Operadores)
- id: UUID (PK)
- operation_id: UUID (FK → operations)
- operator_id: UUID (FK → operators)
- amount: NUMERIC
- currency: TEXT
- due_date: DATE (fecha de vencimiento)
- status: TEXT ('PENDING', 'PAID', 'OVERDUE')
- ledger_movement_id: UUID (FK → ledger_movements, cuando se paga)
NOTA: Se crea automáticamente al crear operación. Se marca PAID cuando se registra el pago.

### TABLA: commission_records (Comisiones de Vendedores) ⭐ CORREGIDO
- id: UUID (PK)
- operation_id: UUID (FK → operations)
- seller_id: UUID (FK → users)
- agency_id: UUID (FK → agencies)
- amount: NUMERIC
- status: TEXT ('PENDING', 'PAID')
- date_calculated: DATE
- date_paid: DATE
- created_at, updated_at: TIMESTAMP
NOTA: Se calculan automáticamente cuando la operación pasa a CONFIRMED/CLOSED. Tabla correcta es commission_records, no commissions.

### TABLA: alerts (Alertas del sistema)
- id: UUID (PK)
- operation_id, customer_id, user_id, lead_id: UUID (FKs opcionales)
- type: TEXT ('PAYMENT_DUE', 'OPERATOR_DUE', 'UPCOMING_TRIP', 'MISSING_DOC', 'PASSPORT_EXPIRY', 'DESTINATION_REQUIREMENT', 'BIRTHDAY', 'GENERIC')
- description: TEXT
- date_due: TIMESTAMP
- status: TEXT ('PENDING', 'DONE', 'IGNORED')
- created_at, updated_at: TIMESTAMP
NOTA: lead_id se agregó para alertas de pasaportes en leads no convertidos.

### TABLA: destination_requirements (Requisitos por Destino) ⭐ NUEVO
- id: UUID (PK)
- destination_code: TEXT (Código ISO: "BR", "US", "EU", etc.)
- destination_name: TEXT ("Brasil", "Estados Unidos", etc.)
- requirement_type: TEXT ('VACCINE', 'FORM', 'VISA', 'INSURANCE', 'DOCUMENT', 'OTHER')
- requirement_name: TEXT ("Fiebre Amarilla", "ESTA", etc.)
- is_required: BOOLEAN
- description: TEXT
- url: TEXT (Link a más info)
- days_before_trip: INTEGER (Días antes del viaje para alertar)
- valid_from, valid_to: DATE
- is_active: BOOLEAN
- created_at, updated_at: TIMESTAMP
NOTA: Requisitos de vacunas, visas, formularios por destino. Se generan alertas automáticas.

### TABLA: partner_accounts (Cuentas de Socios) ⭐ NUEVO
- id: UUID (PK)
- partner_name: TEXT ("Maxi", "Socio 2", etc.)
- user_id: UUID (FK → users, opcional)
- is_active: BOOLEAN
- notes: TEXT
- created_at, updated_at: TIMESTAMP

### TABLA: partner_withdrawals (Retiros de Socios) ⭐ NUEVO
- id: UUID (PK)
- partner_id: UUID (FK → partner_accounts)
- amount: NUMERIC
- currency: TEXT ('ARS', 'USD')
- withdrawal_date: DATE
- account_id: UUID (FK → financial_accounts, de qué cuenta salió)
- cash_movement_id: UUID (FK → cash_movements)
- ledger_movement_id: UUID (FK → ledger_movements)
- description: TEXT
- created_by: UUID (FK → users)
- created_at: TIMESTAMP
NOTA: Retiros personales de socios. Genera movimientos contables automáticamente.

### TABLA: recurring_payments (Pagos Recurrentes) ⭐ NUEVO
- id: UUID (PK)
- provider_name: TEXT (Nombre del proveedor, no FK a operators)
- amount: NUMERIC
- currency: TEXT ('ARS', 'USD')
- frequency: TEXT ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY')
- start_date: DATE
- end_date: DATE (opcional, NULL = sin fin)
- next_due_date: DATE (próxima fecha de vencimiento)
- last_generated_date: DATE
- is_active: BOOLEAN
- description: TEXT
- invoice_number, reference: TEXT
- agency_id: UUID (FK → agencies)
- created_at, updated_at: TIMESTAMP
- created_by: UUID (FK → users)
NOTA: Pagos que se generan automáticamente según frecuencia. Un cron job genera los pagos. NO están vinculados a operators, son proveedores genéricos.

### TABLA: recurring_payment_providers (Proveedores de Pagos Recurrentes)
- id: UUID (PK)
- name: TEXT (Nombre único del proveedor)
- created_at: TIMESTAMP
NOTA: Lista de proveedores usados en pagos recurrentes para autocompletado.

### TABLA: quotations (Cotizaciones Formales) ⭐ NUEVO
- id: UUID (PK)
- lead_id: UUID (FK → leads)
- agency_id: UUID (FK → agencies)
- seller_id: UUID (FK → users)
- operator_id: UUID (FK → operators, opcional)
- quotation_number: TEXT (Número único: "COT-2025-001")
- destination: TEXT
- origin: TEXT
- region: TEXT ('ARGENTINA', 'CARIBE', 'BRASIL', 'EUROPA', 'EEUU', 'OTROS', 'CRUCEROS')
- departure_date, return_date: DATE
- valid_until: DATE (Fecha de vencimiento de la cotización)
- adults, children, infants: INTEGER
- subtotal, discounts, taxes, total_amount: NUMERIC
- currency: TEXT ('ARS', 'USD')
- status: TEXT ('DRAFT', 'SENT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONVERTED')
- approved_by: UUID (FK → users)
- approved_at: TIMESTAMP
- rejection_reason: TEXT
- operation_id: UUID (FK → operations, cuando se convierte)
- converted_at: TIMESTAMP
- notes, terms_and_conditions: TEXT
- created_at, updated_at: TIMESTAMP
- created_by: UUID (FK → users)
NOTA: Cotizaciones formales del sistema. Flujo: Lead → Cotización → Aprobación → Operación.

### TABLA: quotation_items (Items de Cotizaciones)
- id: UUID (PK)
- quotation_id: UUID (FK → quotations)
- item_type: TEXT ('ACCOMMODATION', 'FLIGHT', 'TRANSFER', 'ACTIVITY', 'INSURANCE', 'VISA', 'OTHER')
- description: TEXT
- quantity: INTEGER
- tariff_id: UUID (FK → tariffs, opcional)
- unit_price, discount_percentage, discount_amount, subtotal: NUMERIC
- currency: TEXT ('ARS', 'USD')
- notes: TEXT
- order_index: INTEGER
- created_at, updated_at: TIMESTAMP
NOTA: Items individuales de una cotización (alojamiento, vuelo, etc.).

### TABLA: tariffs (Tarifarios de Operadores)
- id: UUID (PK)
- operator_id: UUID (FK → operators)
- agency_id: UUID (FK → agencies, NULL = global)
- name: TEXT (Nombre del tarifario)
- description: TEXT
- destination: TEXT
- region: TEXT ('ARGENTINA', 'CARIBE', 'BRASIL', 'EUROPA', 'EEUU', 'OTROS', 'CRUCEROS')
- valid_from, valid_to: DATE (Fechas de vigencia)
- tariff_type: TEXT ('ACCOMMODATION', 'FLIGHT', 'PACKAGE', 'TRANSFER', 'ACTIVITY', 'CRUISE', 'OTHER')
- currency: TEXT ('ARS', 'USD')
- is_active: BOOLEAN
- notes, terms_and_conditions: TEXT
- created_at, updated_at: TIMESTAMP
- created_by: UUID (FK → users)
NOTA: Tarifarios de operadores con precios y condiciones.

### TABLA: tariff_items (Items de Tarifarios)
- id: UUID (PK)
- tariff_id: UUID (FK → tariffs)
- category: TEXT (Ej: "Habitación Standard", "Adulto", "Menor")
- room_type: TEXT ('SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD', 'SHARED', NULL)
- occupancy_type: TEXT ('SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD', 'SHARED', NULL)
- base_price: NUMERIC
- price_per_night: BOOLEAN
- price_per_person: BOOLEAN
- discount_percentage, commission_percentage: NUMERIC
- min_nights, max_nights: INTEGER
- min_pax, max_pax: INTEGER
- is_available: BOOLEAN
- notes: TEXT
- order_index: INTEGER
- created_at, updated_at: TIMESTAMP
NOTA: Items individuales de un tarifario (categorías, tipos de habitación, etc.).

### TABLA: quotas (Cupos Disponibles)
- id: UUID (PK)
- tariff_id: UUID (FK → tariffs, opcional)
- operator_id: UUID (FK → operators)
- destination: TEXT
- accommodation_name: TEXT (Nombre del hotel/alojamiento)
- room_type: TEXT
- date_from, date_to: DATE
- total_quota: INTEGER (Cupo total disponible)
- reserved_quota: INTEGER (Cupo reservado)
- available_quota: INTEGER (Calculado: total - reservado)
- is_active: BOOLEAN
- notes: TEXT
- created_at, updated_at: TIMESTAMP
- created_by: UUID (FK → users)
NOTA: Cupos disponibles de operadores por fecha y destino.

### TABLA: quota_reservations (Reservas de Cupos)
- id: UUID (PK)
- quota_id: UUID (FK → quotas)
- quotation_id: UUID (FK → quotations, opcional)
- operation_id: UUID (FK → operations, opcional)
- quantity: INTEGER
- status: TEXT ('RESERVED', 'CONFIRMED', 'RELEASED', 'EXPIRED')
- reserved_until: TIMESTAMP (Para reservas temporales)
- released_at: TIMESTAMP
- created_at: TIMESTAMP
- created_by: UUID (FK → users)
NOTA: Reservas temporales de cupos para cotizaciones u operaciones.

### TABLA: cash_transfers (Transferencias entre Cajas)
- id: UUID (PK)
- from_box_id: UUID (FK → cash_boxes, caja origen)
- to_box_id: UUID (FK → cash_boxes, caja destino)
- agency_id: UUID (FK → agencies)
- amount: NUMERIC
- currency: TEXT ('ARS', 'USD')
- exchange_rate: NUMERIC (Si la transferencia es entre monedas diferentes)
- transfer_date: DATE
- status: TEXT ('PENDING', 'COMPLETED', 'CANCELLED')
- reference: TEXT
- notes: TEXT
- created_at, updated_at: TIMESTAMP
- created_by: UUID (FK → users)
NOTA: Transferencias de dinero entre cajas. Actualiza balances automáticamente.

### TABLA: payment_coupons (Cupones de Pago)
- id: UUID (PK)
- operation_id: UUID (FK → operations, opcional)
- payment_id: UUID (FK → payments, opcional)
- customer_id: UUID (FK → customers, opcional)
- agency_id: UUID (FK → agencies)
- coupon_number: TEXT (Número único: "CUP-2025-001")
- coupon_type: TEXT ('PAYMENT', 'DEPOSIT', 'BALANCE')
- amount: NUMERIC
- currency: TEXT ('ARS', 'USD')
- issue_date, due_date, paid_date: DATE
- status: TEXT ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED')
- customer_name, customer_phone, customer_email: TEXT
- description, notes: TEXT
- payment_reference: TEXT
- created_at, updated_at: TIMESTAMP
- created_by: UUID (FK → users)
NOTA: Cupones de cobro generados para clientes.

### TABLA: card_transactions (Transacciones con Tarjetas)
- id: UUID (PK)
- operation_id: UUID (FK → operations, opcional)
- payment_id: UUID (FK → payments, opcional)
- cash_box_id: UUID (FK → cash_boxes, opcional)
- agency_id: UUID (FK → agencies)
- transaction_number: TEXT (Número único de transacción)
- card_type: TEXT ('VISA', 'MASTERCARD', 'AMEX', 'DINERS', 'CABAL', 'OTHER')
- card_last_four: TEXT (Últimos 4 dígitos)
- amount: NUMERIC
- currency: TEXT ('ARS', 'USD')
- commission_percentage, commission_amount: NUMERIC
- net_amount: NUMERIC (Monto neto después de comisión)
- transaction_date, settlement_date: DATE
- status: TEXT ('PENDING', 'APPROVED', 'SETTLED', 'REJECTED', 'CANCELLED', 'REFUNDED')
- processor: TEXT (Procesador de pagos)
- authorization_code: TEXT
- description, notes: TEXT
- created_at, updated_at: TIMESTAMP
- created_by: UUID (FK → users)
NOTA: Transacciones con tarjetas de crédito/débito. Registro y conciliación.

### TABLA: billing_info (Información de Facturación)
- id: UUID (PK)
- operation_id: UUID (FK → operations, opcional)
- quotation_id: UUID (FK → quotations, opcional)
- billing_type: TEXT ('CUSTOMER', 'THIRD_PARTY', 'COMPANY')
- company_name: TEXT
- tax_id: TEXT (CUIT/CUIL)
- first_name, last_name: TEXT
- address, city, postal_code: TEXT
- phone, email: TEXT
- notes: TEXT
- created_at, updated_at: TIMESTAMP
NOTA: Información de facturación para operaciones y cotizaciones. Permite facturar a terceros.

### TABLA: operation_passengers (Pasajeros de Operación)
- id: UUID (PK)
- operation_id: UUID (FK → operations)
- passenger_number: INTEGER (1, 2, 3...)
- first_name, last_name: TEXT
- date_of_birth: DATE
- nationality: TEXT
- document_type: TEXT ('DNI', 'PASSPORT', 'LC', 'LE')
- document_number: TEXT
- is_main_passenger: BOOLEAN (Solo uno por operación)
- billing_info_id: UUID (FK → billing_info, opcional)
- created_at, updated_at: TIMESTAMP
NOTA: Pasajeros de una operación con datos completos. Diferente a operation_customers (que es relación con tabla customers).

### TABLA: operation_operators (Múltiples Operadores por Operación)
- id: UUID (PK)
- operation_id: UUID (FK → operations)
- operator_id: UUID (FK → operators)
- cost: NUMERIC
- cost_currency: TEXT ('ARS', 'USD')
- notes: TEXT
- created_at, updated_at: TIMESTAMP
NOTA: Relación many-to-many entre operaciones y operadores. Permite múltiples operadores por operación con costos individuales.

### TABLA: chart_of_accounts (Plan de Cuentas Contable)
- id: UUID (PK)
- account_code: TEXT (Código único: "1.1.01", "2.1.01")
- account_name: TEXT
- category: TEXT ('ACTIVO', 'PASIVO', 'PATRIMONIO_NETO', 'RESULTADO')
- subcategory: TEXT ('CORRIENTE', 'NO_CORRIENTE', 'CAPITAL', 'RESERVAS', 'RESULTADOS', 'INGRESOS', 'EGRESOS', 'COSTOS', 'GASTOS')
- account_type: TEXT ('CAJA', 'BANCO', 'CUENTAS_POR_COBRAR', 'CUENTAS_POR_PAGAR', 'VENTAS', 'COSTOS', etc.)
- level: INTEGER (1 = principal, 2 = subcuenta)
- parent_id: UUID (FK → chart_of_accounts, para jerarquías)
- is_movement_account: BOOLEAN (true = cuenta de movimiento, false = cuenta de saldo)
- is_active: BOOLEAN
- display_order: INTEGER
- description: TEXT
- created_at, updated_at: TIMESTAMP
- created_by: UUID (FK → users)
NOTA: Plan de cuentas contable estándar. Define la estructura contable con categorización por rubros. financial_accounts tiene chart_account_id para relacionar.

### TABLA: lead_comments (Comentarios en Leads)
- id: UUID (PK)
- lead_id: UUID (FK → leads)
- user_id: UUID (FK → users)
- comment: TEXT
- created_at, updated_at: TIMESTAMP
NOTA: Comentarios de vendedores en leads. Permite comunicación interna sobre el lead.

### TABLA: manychat_list_order (Orden de Listas Manychat)
- id: UUID (PK)
- agency_id: UUID (FK → agencies)
- list_name: TEXT (Nombre de la lista)
- position: INTEGER (Orden: 0, 1, 2...)
- created_at, updated_at: TIMESTAMP
NOTA: Orden personalizado de listas en CRM Manychat. Independiente de Trello.

### TABLA: commission_rules (Reglas de Comisiones)
- id: UUID (PK)
- type: TEXT ('SELLER', 'AGENCY')
- basis: TEXT ('FIXED_PERCENTAGE', 'FIXED_AMOUNT')
- value: NUMERIC
- destination_region: TEXT
- agency_id: UUID (FK → agencies, opcional)
- valid_from: DATE
- valid_to: DATE (opcional)
- created_at, updated_at: TIMESTAMP
NOTA: Reglas configurables para cálculo de comisiones de vendedores y agencias.

### TABLA: message_templates (Templates de WhatsApp) ⭐ NUEVO
- id: UUID (PK)
- name: TEXT
- description: TEXT
- category: TEXT ('PAYMENT', 'TRIP', 'QUOTATION', 'BIRTHDAY', 'MARKETING', 'CUSTOM')
- trigger_type: TEXT ('MANUAL', 'QUOTATION_SENT', 'PAYMENT_DUE_3D', 'TRIP_7D_BEFORE', etc.)
- template: TEXT (Template con variables: {nombre}, {destino}, etc.)
- emoji_prefix: TEXT
- is_active: BOOLEAN
- send_hour_from, send_hour_to: INTEGER
- agency_id: UUID (FK → agencies, NULL = global)
- created_at, updated_at: TIMESTAMP

### TABLA: whatsapp_messages (Mensajes WhatsApp) ⭐ NUEVO
- id: UUID (PK)
- template_id: UUID (FK → message_templates)
- customer_id: UUID (FK → customers)
- phone: TEXT
- customer_name: TEXT
- message: TEXT (Mensaje ya armado con variables)
- whatsapp_link: TEXT (Link wa.me generado)
- operation_id, payment_id, quotation_id: UUID (FKs opcionales, para contexto)
- status: TEXT ('PENDING', 'SENT', 'SKIPPED', 'FAILED')
- scheduled_for: TIMESTAMP
- sent_at: TIMESTAMP
- sent_by: UUID (FK → users)
- agency_id: UUID (FK → agencies)
- created_at: TIMESTAMP
NOTA: Cola de mensajes WhatsApp. Un cron job procesa y envía los mensajes pendientes.

### TABLA: communications (Historial de Comunicaciones) ⭐ NUEVO
- id: UUID (PK)
- customer_id, lead_id, operation_id: UUID (FKs, al menos uno requerido)
- communication_type: TEXT ('CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'NOTE')
- subject: TEXT
- content: TEXT
- date: TIMESTAMP
- duration: INTEGER (minutos, si es llamada)
- follow_up_date: DATE (fecha para seguimiento)
- user_id: UUID (FK → users, quien realizó la comunicación)
- created_at, updated_at: TIMESTAMP
NOTA: Historial de todas las comunicaciones con clientes, leads y operaciones.

### TABLA: settings_trello (Configuración Trello) ⭐ NUEVO
- id: UUID (PK)
- agency_id: UUID (FK → agencies, UNIQUE)
- trello_api_key: TEXT
- trello_token: TEXT
- board_id: TEXT
- list_status_mapping: JSONB (mapeo de listas a estados de leads)
- list_region_mapping: JSONB (mapeo de listas a regiones)
- last_sync_at: TIMESTAMP
- created_at, updated_at: TIMESTAMP
NOTA: Configuración de sincronización con Trello por agencia.

### TABLA: audit_logs (Logs de Auditoría) ⭐ NUEVO
- id: UUID (PK)
- user_id: UUID (FK → users)
- action: TEXT (LOGIN, CREATE_*, UPDATE_*, DELETE_*, etc.)
- entity_type: TEXT (user, lead, operation, payment, etc.)
- entity_id: UUID
- details: JSONB (detalles adicionales)
- ip_address: INET
- user_agent: TEXT
- created_at: TIMESTAMP
NOTA: Registro de todas las acciones importantes en el sistema. Solo visible para SUPER_ADMIN y ADMIN.

### TABLA: exchange_rates (Tipos de cambio)
- id: UUID (PK)
- date: DATE
- currency_from, currency_to: TEXT
- rate: NUMERIC
- source: TEXT
- created_at: TIMESTAMP

### TABLA: operation_customers (Relación Operación-Clientes)
- id: UUID (PK)
- operation_id: UUID (FK → operations)
- customer_id: UUID (FK → customers)
- role: TEXT ('MAIN' = cliente principal, 'COMPANION' = acompañante)
NOTA: Una operación puede tener múltiples clientes/pasajeros.

### TABLA: documents (Documentos/Archivos)
- id: UUID (PK)
- operation_id, customer_id, lead_id: UUID (FKs opcionales)
- type: TEXT ('PASSPORT', 'DNI', 'VOUCHER', 'TICKET', 'INVOICE', 'OTHER')
- file_name, file_url, storage_path: TEXT
- scanned_data: JSONB (Datos extraídos por OCR: nombre, documento, fecha_nacimiento, expiration_date, etc.)
- uploaded_by: UUID (FK → users)
- uploaded_at: TIMESTAMP
NOTA: scanned_data contiene información extraída por OCR de pasaportes, DNI, etc.

### RELACIONES CLAVE:
- Una OPERACIÓN tiene un VENDEDOR (seller_id), un OPERADOR PRINCIPAL (operator_id), y un CLIENTE PRINCIPAL (customer_id)
- Una OPERACIÓN puede tener MÚLTIPLES OPERADORES (tabla operation_operators) con costos individuales
- Una OPERACIÓN puede tener MÚLTIPLES CLIENTES/PASAJEROS (tabla operation_customers y operation_passengers)
- Una OPERACIÓN puede tener muchos PAGOS (INCOME de clientes, EXPENSE a operadores)
- Un LEAD puede generar una COTIZACIÓN (quotations) que luego se convierte en OPERACIÓN
- Un LEAD puede tener COMENTARIOS (lead_comments) de vendedores
- Una COTIZACIÓN puede tener MÚLTIPLES ITEMS (quotation_items) y puede usar TARIFARIOS (tariffs)
- Los TARIFARIOS tienen ITEMS (tariff_items) y pueden tener CUPOS (quotas) asociados
- Los CUPOS pueden tener RESERVAS (quota_reservations) para cotizaciones u operaciones
- Los PAGOS generan movimientos en ledger_movements y cash_movements automáticamente
- Los PAGOS pueden tener CUPONES (payment_coupons) asociados
- Los PAGOS pueden tener TRANSACCIONES CON TARJETA (card_transactions) asociadas
- Las CAJAS pueden tener TRANSFERENCIAS (cash_transfers) entre ellas
- Los PAGOS tienen estado PENDING/PAID/OVERDUE
- Las ALERTAS se generan automáticamente: pagos vencidos, viajes próximos, documentos faltantes, pasaportes vencidos, requisitos de destino
- Los DOCUMENTOS pueden estar asociados a operations, customers o leads (conectados bidireccionalmente)
- Los RETIROS DE SOCIOS generan movimientos en ledger_movements y cash_movements
- Los PAGOS RECURRENTES generan pagos automáticamente según su frecuencia (NO están vinculados a operators, usan provider_name)
- Los MENSAJES WHATSAPP se generan automáticamente según triggers configurados
- Las OPERACIONES y COTIZACIONES pueden tener INFORMACIÓN DE FACTURACIÓN (billing_info) para facturar a terceros
- Las CUENTAS FINANCIERAS (financial_accounts) pueden estar relacionadas con PLAN DE CUENTAS (chart_of_accounts) mediante chart_account_id

### MÉTRICAS DE NEGOCIO:
- VENTA TOTAL = sale_amount_total (lo que paga el cliente)
- COSTO = operator_cost (operador principal) + SUM(cost) de operation_operators (múltiples operadores)
- MARGEN = margin_amount = sale_amount_total - operator_cost (nuestra ganancia)
- COMISIÓN = commission_amount (lo que gana el vendedor, registrado en commission_records)
- CONVERSIÓN = leads WON / leads totales
- CONVERSIÓN COTIZACIONES = quotations CONVERTED / quotations SENT
- IVA A PAGAR = ivaVentas - ivaCompras (débito fiscal - crédito fiscal)
- TASA DE APROBACIÓN COTIZACIONES = quotations APPROVED / quotations SENT
- CUPOS DISPONIBLES = total_quota - reserved_quota (de tabla quotas)
- BALANCE DE CAJA = initial_balance + SUM(ingresos) - SUM(egresos) - SUM(transferencias salientes) + SUM(transferencias entrantes)
- NETO TRANSACCIONES TARJETA = amount - commission_amount (de tabla card_transactions)
`

// Helper para limpiar JSON
function cleanJsonString(jsonString: string): string {
  if (!jsonString) return "{}"
  let cleaned = jsonString.trim()
  if (cleaned.startsWith("```json")) cleaned = cleaned.substring(7)
  if (cleaned.startsWith("```sql")) cleaned = cleaned.substring(6)
  if (cleaned.startsWith("```")) cleaned = cleaned.substring(3)
  if (cleaned.endsWith("```")) cleaned = cleaned.substring(0, cleaned.length - 3)
  return cleaned.trim()
}

// Ejecutar consulta SQL de forma segura (solo SELECT)
async function executeQuery(supabase: any, query: string): Promise<any> {
  try {
    // Limpiar y validar query
    const cleanedQuery = query.trim()
    
    // Validar que sea solo SELECT (seguridad adicional)
    const normalizedQuery = cleanedQuery.toUpperCase()
  if (!normalizedQuery.startsWith("SELECT")) {
    throw new Error("Solo se permiten consultas SELECT")
  }
  
    // Log de la query que se va a ejecutar (para debugging)
    console.log("[AI] Ejecutando query:", cleanedQuery.substring(0, 200))
  
    // Ejecutar usando función RPC
    const { data, error } = await supabase.rpc('execute_readonly_query', { query_text: cleanedQuery })
  
  if (error) {
      console.error("[AI] Error ejecutando query:", error)
      console.error("[AI] Query que falló:", cleanedQuery)
      throw new Error(`Error ejecutando query: ${error.message}`)
    }
    
    // Retornar datos parseados
    const result = Array.isArray(data) ? data : (data ? [data] : [])
    console.log("[AI] Query ejecutada exitosamente, resultados:", result.length)
    return result
  } catch (error: any) {
    console.error("[AI] Error en executeQuery:", error)
    console.error("[AI] Query que causó el error:", query)
    throw error
  }
}

// Generar query SQL basada en la pregunta del usuario (helper para el AI)
function generateQuerySuggestion(question: string, context: any): string {
  // Esta función puede ser mejorada con un modelo de AI más pequeño
  // Por ahora, retorna ejemplos de queries comunes basadas en palabras clave
  const lowerQuestion = question.toLowerCase()
  
  if (lowerQuestion.includes("cotización") || lowerQuestion.includes("cotizaciones")) {
    if (lowerQuestion.includes("enviadas")) {
      return "SELECT COUNT(*) as total, SUM(total_amount) as monto_total FROM quotations WHERE status = 'SENT' AND created_at >= date_trunc('month', CURRENT_DATE)"
    }
    if (lowerQuestion.includes("convertidas")) {
      return "SELECT COUNT(*) as total, SUM(total_amount) as monto_total FROM quotations WHERE status = 'CONVERTED' AND converted_at >= date_trunc('month', CURRENT_DATE)"
    }
    return "SELECT status, COUNT(*) as cantidad, SUM(total_amount) as monto_total FROM quotations WHERE created_at >= date_trunc('month', CURRENT_DATE) GROUP BY status"
  }
  
  if (lowerQuestion.includes("cupón") || lowerQuestion.includes("cupones")) {
    if (lowerQuestion.includes("vencido")) {
      return "SELECT COUNT(*) as total, SUM(amount) as monto_total FROM payment_coupons WHERE status = 'OVERDUE'"
    }
    return "SELECT status, COUNT(*) as cantidad, SUM(amount) as monto_total FROM payment_coupons GROUP BY status"
  }
  
  if (lowerQuestion.includes("transferencia") || lowerQuestion.includes("transferencias")) {
    return "SELECT * FROM cash_transfers WHERE transfer_date >= CURRENT_DATE - INTERVAL '7 days' ORDER BY transfer_date DESC LIMIT 20"
  }
  
  if (lowerQuestion.includes("tarjeta") || lowerQuestion.includes("transacción")) {
    return "SELECT COUNT(*) as total, SUM(net_amount) as monto_neto FROM card_transactions WHERE transaction_date >= date_trunc('month', CURRENT_DATE) AND status IN ('APPROVED', 'SETTLED')"
  }
  
  // Query genérica si no se encuentra patrón
  return ""
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Rate limiting
    try {
      withRateLimit(user.id, "/api/ai", RATE_LIMIT_CONFIGS.AI_COPILOT)
    } catch (error: any) {
      if (error.statusCode === 429) {
        return NextResponse.json(
          { error: "Demasiadas solicitudes. Por favor, espera un momento." },
          { status: 429, headers: { "Retry-After": "60" } }
        )
      }
      throw error
    }

    // Validar request
    let validatedBody
    try {
      validatedBody = await validateRequest(request, aiCopilotSchema)
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const { message, agencyId } = validatedBody

    // Log de auditoría
    const supabase = await createServerClient()
    const metadata = getRequestMetadata(request)
    await createAuditLog(supabase, {
      user_id: user.id,
      action: "AI_COPILOT_QUERY",
      entity_type: "ai_copilot",
      details: { message_length: message.length, has_agency: !!agencyId, query: message },
      ...metadata,
    })

    // Validar API key de OpenAI
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey || openaiApiKey === "tu_openai_api_key_aqui" || openaiApiKey.trim() === "") {
      return NextResponse.json({ 
        error: "OpenAI API Key no configurada. Configura OPENAI_API_KEY en Vercel." 
      }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey: openaiApiKey })

    // Obtener contexto actual
    const today = new Date()
    const currentDate = today.toISOString().split('T')[0]
    const currentYear = today.getFullYear()
    const currentMonth = today.getMonth() + 1
    
    // Calcular fechas útiles
    const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - today.getDay() + 1) // Lunes
    const startOfWeekStr = startOfWeek.toISOString().split('T')[0]
    
    const lastMonthStart = new Date(currentYear, currentMonth - 2, 1)
    const lastMonthEnd = new Date(currentYear, currentMonth - 1, 0)
    const lastMonthStartStr = lastMonthStart.toISOString().split('T')[0]
    const lastMonthEndStr = lastMonthEnd.toISOString().split('T')[0]

    // Obtener datos relevantes del contexto actual
    // OPTIMIZACIÓN: Paralelizar queries con Promise.all()
    const contextData: any = {}

    // Paralelizar queries iniciales (1-2)
    const [salesThisMonthResult, salesThisWeekResult] = await Promise.all([
      supabase
        .from("operations")
        .select("sale_amount_total, margin_amount, operator_cost, status, product_type, seller_id")
        .gte("created_at", startOfMonth),
      supabase
        .from("operations")
        .select("sale_amount_total, margin_amount")
        .gte("created_at", startOfWeekStr),
    ])

    const salesThisMonth = salesThisMonthResult.data || []
    const salesThisWeek = salesThisWeekResult.data || []

    contextData.ventasMesActual = {
      total: salesThisMonth.reduce((sum: number, op: any) => sum + (op.sale_amount_total || 0), 0),
      margen: salesThisMonth.reduce((sum: number, op: any) => sum + (op.margin_amount || 0), 0),
      cantidadOperaciones: salesThisMonth.length,
    }

    contextData.ventasEstaSemana = {
      total: salesThisWeek.reduce((sum: number, op: any) => sum + (op.sale_amount_total || 0), 0),
      margen: salesThisWeek.reduce((sum: number, op: any) => sum + (op.margin_amount || 0), 0),
      cantidadOperaciones: salesThisWeek.length,
    }

    // Paralelizar queries de pagos (3-4)
    const endOfWeek = new Date(today)
    endOfWeek.setDate(today.getDate() + 7)
    
    const [overduePaymentsResult, paymentsDueTodayResult, upcomingTripsResult, activeLeadsResult, accountsResult] = await Promise.all([
      supabase
        .from("payments")
        .select(`
          id, amount, currency, date_due, direction, payer_type,
          operations:operation_id(file_code, destination, customers:customer_id(first_name, last_name))
        `)
        .eq("status", "PENDING")
        .lt("date_due", currentDate),
      supabase
        .from("payments")
        .select(`
          id, amount, currency, direction, payer_type,
          operations:operation_id(file_code, destination, customers:customer_id(first_name, last_name))
        `)
        .eq("status", "PENDING")
        .eq("date_due", currentDate),
      supabase
        .from("operations")
        .select(`
          id, file_code, destination, departure_date, status,
          customers:customer_id(first_name, last_name, phone),
          users:seller_id(name)
        `)
        .gte("departure_date", currentDate)
        .lte("departure_date", endOfWeek.toISOString().split('T')[0])
        .order("departure_date", { ascending: true }),
      supabase
        .from("leads")
        .select("id, status, source, region, destination")
        .in("status", ["NEW", "IN_PROGRESS", "QUOTED"]),
      supabase
        .from("financial_accounts")
        .select("name, type, currency, initial_balance")
        .eq("is_active", true),
    ])

    const overduePayments = overduePaymentsResult.data || []
    const paymentsDueToday = paymentsDueTodayResult.data || []
    const upcomingTrips = upcomingTripsResult.data || []
    const activeLeads = activeLeadsResult.data || []
    const accounts = accountsResult.data || []

    contextData.pagosVencidos = {
      cantidad: overduePayments.length,
      detalles: overduePayments.slice(0, 10).map((p: any) => ({
        monto: p.amount,
        moneda: p.currency,
        vencimiento: p.date_due,
        tipo: p.payer_type === 'CUSTOMER' ? 'Cobrar a cliente' : 'Pagar a operador',
        operacion: p.operations?.file_code || p.operations?.destination,
        cliente: p.operations?.customers ? `${p.operations.customers.first_name} ${p.operations.customers.last_name}` : null,
      })),
    }

    contextData.pagosVencenHoy = {
      cantidad: paymentsDueToday.length,
      detalles: paymentsDueToday.map((p: any) => ({
        monto: p.amount,
        moneda: p.currency,
        tipo: p.payer_type === 'CUSTOMER' ? 'Cobrar a cliente' : 'Pagar a operador',
        operacion: p.operations?.file_code || p.operations?.destination,
        cliente: p.operations?.customers ? `${p.operations.customers.first_name} ${p.operations.customers.last_name}` : null,
      })),
    }

    contextData.viajesProximos = {
      cantidad: upcomingTrips.length,
      detalles: upcomingTrips.map((t: any) => ({
        codigo: t.file_code,
        destino: t.destination,
        fechaSalida: t.departure_date,
        estado: t.status,
        cliente: t.customers ? `${t.customers.first_name} ${t.customers.last_name}` : null,
        telefono: t.customers?.phone,
        vendedor: t.users?.name,
      })),
    }

    // 6. Top vendedores del mes (usar datos ya cargados)
    const sellerStats: Record<string, any> = {}
    for (const op of salesThisMonth as any[]) {
      const sellerId = op.seller_id
      // Necesitamos el nombre del vendedor, hacer query separada si es necesario
      if (!sellerStats[sellerId]) {
        sellerStats[sellerId] = { nombre: "Sin vendedor", ventas: 0, margen: 0, operaciones: 0 }
      }
      sellerStats[sellerId].ventas += op.sale_amount_total || 0
      sellerStats[sellerId].margen += op.margin_amount || 0
      sellerStats[sellerId].operaciones += 1
    }
    
    // Obtener nombres de vendedores en batch
    const sellerIds = Object.keys(sellerStats)
    if (sellerIds.length > 0) {
      const { data: sellers } = await supabase
        .from("users")
        .select("id, name")
        .in("id", sellerIds)
      
      for (const seller of (sellers || []) as any[]) {
        if (sellerStats[seller.id]) {
          sellerStats[seller.id].nombre = seller.name
        }
      }
    }
    
    contextData.topVendedores = Object.values(sellerStats)
      .sort((a: any, b: any) => b.ventas - a.ventas)
      .slice(0, 5)

    const leadsByStatus: Record<string, number> = {}
    for (const lead of activeLeads as any[]) {
      leadsByStatus[lead.status] = (leadsByStatus[lead.status] || 0) + 1
    }
    contextData.leadsActivos = {
      total: activeLeads.length,
      porEstado: leadsByStatus,
    }

    contextData.cuentasFinancieras = accounts

    // Obtener balances de cajas activas
    const { data: cashBoxes } = await supabase
      .from("cash_boxes")
      .select("id, name, currency, current_balance, is_active")
      .eq("is_active", true)
    
    contextData.balancesCajas = {
      totalCajas: cashBoxes?.length || 0,
      cajas: (cashBoxes || []).map((cb: any) => ({
        nombre: cb.name,
        moneda: cb.currency,
        balance: cb.current_balance,
      })),
      totalARS: (cashBoxes || []).filter((cb: any) => cb.currency === 'ARS').reduce((sum: number, cb: any) => sum + Number(cb.current_balance || 0), 0),
      totalUSD: (cashBoxes || []).filter((cb: any) => cb.currency === 'USD').reduce((sum: number, cb: any) => sum + Number(cb.current_balance || 0), 0),
    }

    // Paralelizar queries contables (9-11)
    const [cashMovementsResult, ledgerMovementsResult, ivaSalesResult, ivaPurchasesResult] = await Promise.all([
      (supabase.from("cash_movements") as any)
        .select("type, amount, currency, category, movement_date")
        .gte("movement_date", startOfMonth),
      (supabase.from("ledger_movements") as any)
        .select("type, amount_original, currency, amount_ars_equivalent, concept")
        .gte("created_at", startOfMonth),
      (supabase.from("iva_sales") as any)
        .select("sale_amount_total, net_amount, iva_amount, currency")
        .gte("sale_date", startOfMonth),
      (supabase.from("iva_purchases") as any)
        .select("operator_cost_total, net_amount, iva_amount, currency")
        .gte("purchase_date", startOfMonth),
    ])

    const cashMovements = cashMovementsResult.data || []
    const ledgerMovements = ledgerMovementsResult.data || []
    const ivaSales = ivaSalesResult.data || []
    const ivaPurchases = ivaPurchasesResult.data || []

    const ingresos = cashMovements.filter((m: any) => m.type === "INCOME")
    const egresos = cashMovements.filter((m: any) => m.type === "EXPENSE")
    
    contextData.movimientosCajaMes = {
      totalIngresos: ingresos.reduce((sum: number, m: any) => sum + Number(m.amount || 0), 0),
      totalEgresos: egresos.reduce((sum: number, m: any) => sum + Number(m.amount || 0), 0),
      cantidadMovimientos: cashMovements.length,
    }

    const ledgerByType: Record<string, number> = {}
    for (const mov of ledgerMovements as any[]) {
      ledgerByType[mov.type] = (ledgerByType[mov.type] || 0) + Number(mov.amount_ars_equivalent || 0)
    }
    
    contextData.libroMayorMes = {
      porTipo: ledgerByType,
      cantidadMovimientos: ledgerMovements.length,
    }

    const totalIvaSales = ivaSales.reduce((sum: number, s: any) => sum + Number(s.iva_amount || 0), 0)
    const totalIvaPurchases = ivaPurchases.reduce((sum: number, p: any) => sum + Number(p.iva_amount || 0), 0)
    
    contextData.ivaMes = {
      ivaVentas: totalIvaSales,
      ivaCompras: totalIvaPurchases,
      ivaPagar: totalIvaSales - totalIvaPurchases, // Débito - Crédito
      cantidadRegistros: ivaSales.length + ivaPurchases.length,
    }

    // Paralelizar queries de nuevas tablas (12-25)
    const [
      pendingCommissionsResult, 
      pendingOperatorPaymentsResult, 
      destinationRequirementsResult, 
      partnerAccountsResult, 
      recurringPaymentsResult, 
      whatsappMessagesResult,
      quotationsResult,
      cashTransfersResult,
      paymentCouponsResult,
      cardTransactionsResult,
      tariffsResult,
      quotasResult,
      chartOfAccountsResult,
      leadCommentsResult
    ] = await Promise.all([
      (supabase.from("commission_records") as any)
        .select(`
          amount, status,
          users:seller_id(name),
          operations:operation_id(file_code, destination)
        `)
        .eq("status", "PENDING"),
      (supabase.from("operator_payments") as any)
        .select(`
          amount, currency, due_date, status,
          operators:operator_id(name),
          operations:operation_id(file_code, destination)
        `)
        .eq("status", "PENDING")
        .order("due_date", { ascending: true }),
      supabase
        .from("destination_requirements")
        .select("destination_code, destination_name, requirement_type, requirement_name, is_required")
        .eq("is_active", true)
        .limit(20),
      supabase
        .from("partner_accounts")
        .select("id, partner_name, is_active"),
      (supabase.from("recurring_payments") as any)
        .select("id, operator_id, amount, currency, frequency, next_due_date, is_active, description")
        .eq("is_active", true),
      (supabase.from("whatsapp_messages") as any)
        .select("id, customer_name, message, status, scheduled_for, sent_at")
        .eq("status", "PENDING")
        .limit(10),
      // Cotizaciones del mes
      (supabase.from("quotations") as any)
        .select("id, quotation_number, status, total_amount, currency, created_at, converted_at, operation_id")
        .gte("created_at", startOfMonth),
      // Transferencias entre cajas del mes
      (supabase.from("cash_transfers") as any)
        .select("id, from_box_id, to_box_id, amount, currency, transfer_date, status")
        .gte("transfer_date", startOfMonth)
        .order("transfer_date", { ascending: false })
        .limit(20),
      // Cupones de pago
      (supabase.from("payment_coupons") as any)
        .select("id, coupon_number, status, amount, currency, due_date, paid_date")
        .in("status", ["PENDING", "OVERDUE"]),
      // Transacciones con tarjeta del mes
      (supabase.from("card_transactions") as any)
        .select("id, amount, net_amount, currency, transaction_date, status, card_type")
        .gte("transaction_date", startOfMonth)
        .limit(50),
      // Tarifarios activos (resumen)
      (supabase.from("tariffs") as any)
        .select("id, name, destination, region, tariff_type, is_active, valid_from, valid_to")
        .eq("is_active", true)
        .gte("valid_to", currentDate)
        .limit(20),
      // Cupos disponibles (resumen)
      (supabase.from("quotas") as any)
        .select("id, destination, total_quota, reserved_quota, available_quota, date_from, date_to")
        .eq("is_active", true)
        .gte("date_to", currentDate)
        .limit(30),
      // Plan de cuentas (estructura básica)
      (supabase.from("chart_of_accounts") as any)
        .select("account_code, account_name, category, subcategory, account_type, is_active")
        .eq("is_active", true)
        .order("account_code", { ascending: true })
        .limit(50),
      // Comentarios recientes en leads
      (supabase.from("lead_comments") as any)
        .select("id, lead_id, user_id, comment, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ])

    const pendingCommissions = pendingCommissionsResult.data || []
    const pendingOperatorPayments = pendingOperatorPaymentsResult.data || []
    const destinationRequirements = destinationRequirementsResult.data || []
    const partnerAccounts = partnerAccountsResult.data || []
    const recurringPayments = recurringPaymentsResult.data || []
    const whatsappMessages = whatsappMessagesResult.data || []
    const quotations = quotationsResult.data || []
    const cashTransfers = cashTransfersResult.data || []
    const paymentCoupons = paymentCouponsResult.data || []
    const cardTransactions = cardTransactionsResult.data || []
    const tariffs = tariffsResult.data || []
    const quotas = quotasResult.data || []
    const chartOfAccounts = chartOfAccountsResult.data || []
    const leadComments = leadCommentsResult.data || []

    contextData.comisionesPendientes = {
      cantidad: pendingCommissions.length,
      totalPendiente: pendingCommissions.reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0),
      detalles: pendingCommissions.slice(0, 5).map((c: any) => ({
        vendedor: c.users?.name,
        monto: c.amount,
        operacion: c.operations?.file_code || c.operations?.destination,
      })),
    }

    contextData.pagosPendientesOperadores = {
      cantidad: pendingOperatorPayments.length,
      totalPendiente: pendingOperatorPayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0),
      detalles: pendingOperatorPayments.slice(0, 5).map((p: any) => ({
        operador: p.operators?.name,
        monto: p.amount,
        moneda: p.currency,
        vencimiento: p.due_date,
        operacion: p.operations?.file_code || p.operations?.destination,
      })),
    }

    // 14. Requisitos de destino activos
    contextData.requisitosDestino = {
      cantidad: destinationRequirements.length,
      destinosUnicos: Array.from(new Set(destinationRequirements.map((r: any) => r.destination_name))),
      detalles: destinationRequirements.slice(0, 10),
    }

    // 15. Cuentas de socios
    contextData.cuentasSocios = {
      cantidad: partnerAccounts.length,
      activas: partnerAccounts.filter((p: any) => p.is_active).length,
      detalles: partnerAccounts.map((p: any) => ({
        nombre: p.partner_name,
        activo: p.is_active,
      })),
    }

    // 16. Pagos recurrentes activos
    contextData.pagosRecurrentes = {
      cantidad: recurringPayments.length,
      proximos: recurringPayments
        .filter((p: any) => {
          const nextDue = new Date(p.next_due_date + 'T12:00:00')
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          return nextDue <= new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000) // Próximos 7 días
        })
        .length,
      detalles: recurringPayments.slice(0, 5),
    }

    // 17. Mensajes WhatsApp pendientes
    contextData.mensajesWhatsApp = {
      pendientes: whatsappMessages.length,
      detalles: whatsappMessages.map((m: any) => ({
        cliente: m.customer_name,
        estado: m.status,
        programado: m.scheduled_for,
      })),
    }

    // 18. Cotizaciones del mes
    const quotationsByStatus: Record<string, any> = {}
    let quotationsConverted = 0
    let quotationsTotal = 0
    for (const q of quotations as any[]) {
      quotationsByStatus[q.status] = (quotationsByStatus[q.status] || 0) + 1
      quotationsTotal += Number(q.total_amount || 0)
      if (q.status === 'CONVERTED') quotationsConverted++
    }
    contextData.cotizacionesMes = {
      total: quotations.length,
      porEstado: quotationsByStatus,
      montoTotal: quotationsTotal,
      convertidas: quotationsConverted,
      tasaConversion: quotations.length > 0 ? (quotationsConverted / quotations.length * 100).toFixed(2) : 0,
    }

    // 19. Transferencias entre cajas
    contextData.transferenciasCaja = {
      cantidad: cashTransfers.length,
      totalTransferido: cashTransfers.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0),
      porEstado: cashTransfers.reduce((acc: any, t: any) => {
        acc[t.status] = (acc[t.status] || 0) + 1
        return acc
      }, {}),
      detalles: cashTransfers.slice(0, 10).map((t: any) => ({
        monto: t.amount,
        moneda: t.currency,
        fecha: t.transfer_date,
        estado: t.status,
      })),
    }

    // 20. Cupones de pago
    const couponsByStatus: Record<string, any> = {}
    let couponsOverdue = 0
    let couponsPending = 0
    let couponsTotalAmount = 0
    for (const c of paymentCoupons as any[]) {
      couponsByStatus[c.status] = (couponsByStatus[c.status] || 0) + 1
      if (c.status === 'OVERDUE') couponsOverdue++
      if (c.status === 'PENDING') couponsPending++
      couponsTotalAmount += Number(c.amount || 0)
    }
    contextData.cuponesPago = {
      total: paymentCoupons.length,
      vencidos: couponsOverdue,
      pendientes: couponsPending,
      montoTotal: couponsTotalAmount,
      porEstado: couponsByStatus,
    }

    // 21. Transacciones con tarjeta
    const transactionsByStatus: Record<string, any> = {}
    let transactionsNetTotal = 0
    let transactionsCount = 0
    for (const t of cardTransactions as any[]) {
      transactionsByStatus[t.status] = (transactionsByStatus[t.status] || 0) + 1
      if (t.status === 'SETTLED' || t.status === 'APPROVED') {
        transactionsNetTotal += Number(t.net_amount || 0)
        transactionsCount++
      }
    }
    contextData.transaccionesTarjeta = {
      total: cardTransactions.length,
      liquidadas: transactionsByStatus['SETTLED'] || 0,
      montoNetoTotal: transactionsNetTotal,
      cantidadLiquidadas: transactionsCount,
      porEstado: transactionsByStatus,
    }

    // 22. Tarifarios activos
    const tariffsByRegion: Record<string, number> = {}
    const tariffsByType: Record<string, number> = {}
    for (const t of tariffs as any[]) {
      tariffsByRegion[t.region] = (tariffsByRegion[t.region] || 0) + 1
      tariffsByType[t.tariff_type] = (tariffsByType[t.tariff_type] || 0) + 1
    }
    contextData.tarifariosActivos = {
      total: tariffs.length,
      porRegion: tariffsByRegion,
      porTipo: tariffsByType,
      detalles: tariffs.slice(0, 10).map((t: any) => ({
        nombre: t.name,
        destino: t.destination,
        region: t.region,
        tipo: t.tariff_type,
        vigenteHasta: t.valid_to,
      })),
    }

    // 23. Cupos disponibles
    let totalQuotaAvailable = 0
    let totalQuotaReserved = 0
    const quotasByDestination: Record<string, number> = {}
    for (const q of quotas as any[]) {
      totalQuotaAvailable += Number(q.available_quota || 0)
      totalQuotaReserved += Number(q.reserved_quota || 0)
      quotasByDestination[q.destination] = (quotasByDestination[q.destination] || 0) + Number(q.available_quota || 0)
    }
    contextData.cuposDisponibles = {
      totalCupos: quotas.length,
      cuposDisponibles: totalQuotaAvailable,
      cuposReservados: totalQuotaReserved,
      porDestino: quotasByDestination,
      detalles: quotas
        .filter((q: any) => Number(q.available_quota || 0) > 0)
        .slice(0, 10)
        .map((q: any) => ({
          destino: q.destination,
          disponibles: q.available_quota,
          reservados: q.reserved_quota,
          total: q.total_quota,
        })),
    }

    // 24. Plan de cuentas
    const accountsByCategory: Record<string, number> = {}
    for (const acc of chartOfAccounts as any[]) {
      accountsByCategory[acc.category] = (accountsByCategory[acc.category] || 0) + 1
    }
    contextData.planCuentas = {
      totalCuentas: chartOfAccounts.length,
      porCategoria: accountsByCategory,
      estructura: chartOfAccounts.slice(0, 20).map((acc: any) => ({
        codigo: acc.account_code,
        nombre: acc.account_name,
        categoria: acc.category,
        subcategoria: acc.subcategory,
        tipo: acc.account_type,
      })),
    }

    // 25. Comentarios recientes en leads
    // Obtener nombres de usuarios que hicieron comentarios
    const commentUserIds = Array.from(new Set(leadComments.map((c: any) => c.user_id).filter(Boolean)))
    let commentUsers: any[] = []
    if (commentUserIds.length > 0) {
      const { data: usersData } = await supabase
        .from("users")
        .select("id, name")
        .in("id", commentUserIds)
      commentUsers = usersData || []
    }
    const usersMap = new Map(commentUsers.map((u: any) => [u.id, u.name]))
    
    contextData.comentariosLeads = {
      total: leadComments.length,
      recientes: leadComments.slice(0, 10).map((c: any) => ({
        comentario: c.comment?.substring(0, 100),
        autor: usersMap.get(c.user_id) || "Usuario desconocido",
        fecha: c.created_at,
      })),
    }

    // Convertir contexto a texto
    const contextText = JSON.stringify(contextData, null, 2)

    // PROMPT PRINCIPAL - El cerebro del AI Copilot
    const systemPrompt = `Eres el ASISTENTE EJECUTIVO INTELIGENTE de MAXEVA GESTION, una agencia de viajes argentina con sucursales en Rosario y Madero.

## TU ROL
Eres un experto en el negocio de agencias de viajes. Conocés perfectamente:
- Cómo funciona una agencia de viajes (vendemos viajes, cobramos a clientes, pagamos a operadores)
- El flujo de un cliente: Lead → Operación/Venta → Viaje → Cierre
- Métricas de negocio: ventas, márgenes, comisiones, cobros, pagos, IVA
- Operadores mayoristas (proveedores que nos venden los servicios)
- Gestión de leads desde Instagram, WhatsApp, Trello

## ESQUEMA DE BASE DE DATOS
${DATABASE_SCHEMA}

## CONTEXTO ACTUAL (${currentDate})
Hoy es ${new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
Semana actual: desde ${startOfWeekStr}
Mes actual: ${new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
Mes pasado: ${lastMonthStartStr} a ${lastMonthEndStr}

## DATOS EN TIEMPO REAL
${contextText}

## REGLAS DE RESPUESTA
1. **Idioma**: Siempre en español argentino
2. **Formato moneda**: $1.234.567,89 (punto para miles, coma para decimales)
3. **Formato fecha**: DD/MM/YYYY
4. **Sé conciso pero completo**
5. **Usa emojis para destacar**:
   - 📈 datos positivos
   - 📉 datos negativos  
   - ⚠️ alertas importantes
   - 💰 montos
   - 📊 estadísticas
   - ✅ confirmaciones
   - ❌ problemas
6. **Si hay alertas o riesgos, mencionalos**
7. **Si necesitás más contexto, preguntá**
8. **Respondé con los datos que tenés, no inventes**

## USUARIO ACTUAL
- Nombre: ${user.name}
- Email: ${user.email}
- Rol: ${user.role}

## EJEMPLOS DE PREGUNTAS Y CÓMO RESPONDER

### Preguntas Básicas (usar contexto pre-cargado):
**"¿Cuánto vendimos esta semana?"**
→ Usar datos de ventasEstaSemana

**"¿Qué pagos vencen hoy?"** o **"¿Qué cobros tengo hoy?"**
→ Usar datos de pagosVencenHoy

**"¿Qué viajes salen esta semana?"**
→ Usar datos de viajesProximos

**"¿Quién vendió más este mes?"**
→ Usar datos de topVendedores

**"¿Cómo estamos vs el mes pasado?"**
→ Comparar ventasMesActual con mes pasado (necesitarás hacer query para mes pasado)

**"¿Cuánto IVA tenemos que pagar este mes?"**
→ Usar datos de ivaMes (ivaVentas - ivaCompras = ivaPagar)

**"¿Cuánto le debemos a los operadores?"**
→ Usar datos de pagosPendientesOperadores

**"¿Cuánto hay en caja?"** o **"¿Cómo está la caja este mes?"**
→ Usar datos de movimientosCajaMes y balancesCajas

**"¿Cuál es el balance actual de todas las cajas?"**
→ Usar datos de balancesCajas (ya está en contexto pre-cargado)

**"¿Cuántas comisiones hay pendientes?"**
→ Usar datos de comisionesPendientes

**"¿Qué movimientos hubo en el libro mayor?"**
→ Usar datos de libroMayorMes

**"¿Qué requisitos hay para viajar a Brasil?"**
→ Usar datos de requisitosDestino (filtrar por destination_code="BR")

**"¿Cuántos retiros hicieron los socios este mes?"**
→ Consultar partner_withdrawals filtrando por withdrawal_date del mes

**"¿Qué pagos recurrentes están activos?"**
→ Usar datos de pagosRecurrentes

**"¿Cuántos mensajes WhatsApp están pendientes?"**
→ Usar datos de mensajesWhatsApp

### Preguntas sobre Cotizaciones (requieren queries dinámicas):
**"¿Cuántas cotizaciones se enviaron este mes?"**
→ Query: SELECT COUNT(*) FROM quotations WHERE status = 'SENT' AND created_at >= start_of_month

**"¿Cuántas cotizaciones se convirtieron en operaciones?"**
→ Query: SELECT COUNT(*) FROM quotations WHERE status = 'CONVERTED' AND converted_at >= start_of_month

**"¿Cuál es la tasa de conversión de cotizaciones este mes?"**
→ (cotizaciones convertidas / cotizaciones enviadas) * 100

**"¿Qué cotizaciones están próximas a vencer?"**
→ Query: SELECT * FROM quotations WHERE status IN ('SENT', 'PENDING_APPROVAL') AND valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 3

**"¿Cuánto monto total hay en cotizaciones pendientes de aprobación?"**
→ Query: SELECT SUM(total_amount) FROM quotations WHERE status = 'PENDING_APPROVAL'

### Preguntas sobre Tarifarios y Cupos:
**"¿Qué tarifarios están activos para el Caribe?"**
→ Query: SELECT * FROM tariffs WHERE region = 'CARIBE' AND is_active = true AND valid_from <= CURRENT_DATE AND valid_to >= CURRENT_DATE

**"¿Cuántos cupos disponibles hay para Brasil en febrero?"**
→ Query: SELECT SUM(available_quota) FROM quotas WHERE destination LIKE '%Brasil%' AND date_from <= '2025-02-28' AND date_to >= '2025-02-01' AND is_active = true

**"¿Qué operador tiene más cupos reservados?"**
→ Query: SELECT o.name, SUM(qr.quantity) FROM quota_reservations qr JOIN quotas q ON qr.quota_id = q.id JOIN operators o ON q.operator_id = o.id WHERE qr.status = 'RESERVED' GROUP BY o.name ORDER BY SUM(qr.quantity) DESC

### Preguntas sobre Transferencias y Cajas:
**"¿Qué transferencias entre cajas hubo la semana pasada?"**
→ Query: SELECT * FROM cash_transfers WHERE transfer_date BETWEEN start_of_last_week AND end_of_last_week

**"¿Cuál es el balance actual de todas las cajas?"**
→ Query: SELECT name, currency, current_balance FROM cash_boxes WHERE is_active = true

**"¿Cuánto se transfirió de ARS a USD este mes?"**
→ Query: SELECT SUM(amount) FROM cash_transfers WHERE currency = 'USD' AND transfer_date >= start_of_month

### Preguntas sobre Cupones y Transacciones:
**"¿Cuántos cupones de pago están vencidos?"**
→ Query: SELECT COUNT(*) FROM payment_coupons WHERE status = 'OVERDUE'

**"¿Cuánto monto total hay en cupones pendientes?"**
→ Query: SELECT SUM(amount) FROM payment_coupons WHERE status = 'PENDING'

**"¿Cuántas transacciones con tarjeta se liquidaron este mes?"**
→ Query: SELECT COUNT(*) FROM card_transactions WHERE status = 'SETTLED' AND settlement_date >= start_of_month

**"¿Cuál es el monto neto total de transacciones con tarjeta este mes?"**
→ Query: SELECT SUM(net_amount) FROM card_transactions WHERE transaction_date >= start_of_month AND status IN ('APPROVED', 'SETTLED')

### Preguntas sobre Pasajeros y Documentos:
**"¿Qué pasajeros tienen documentos vencidos para viajes próximos?"**
→ Query compleja: JOIN operation_passengers con documents y operations filtrando por expiration_date < departure_date

**"¿Cuántos pasajeros tiene la operación OP-2025-001?"**
→ Query: SELECT COUNT(*) FROM operation_passengers WHERE operation_id = (SELECT id FROM operations WHERE file_code = 'OP-2025-001')

### Preguntas sobre Múltiples Operadores:
**"¿Qué operación tiene más operadores asociados?"**
→ Query: SELECT o.file_code, COUNT(oo.id) FROM operations o JOIN operation_operators oo ON o.id = oo.operation_id GROUP BY o.file_code ORDER BY COUNT(oo.id) DESC

**"¿Cuál es el costo total de una operación incluyendo todos sus operadores?"**
→ Sumar operator_cost de operations + SUM(cost) de operation_operators

### Preguntas sobre Plan de Cuentas:
**"¿Cómo se relaciona la cuenta financiera 'Caja Principal' con el plan de cuentas?"**
→ Query: SELECT fa.name, coa.account_code, coa.account_name FROM financial_accounts fa JOIN chart_of_accounts coa ON fa.chart_account_id = coa.id WHERE fa.name = 'Caja Principal'

**"¿Qué cuentas del plan de cuentas son de tipo ACTIVO CORRIENTE?"**
→ Query: SELECT * FROM chart_of_accounts WHERE category = 'ACTIVO' AND subcategory = 'CORRIENTE'

### Preguntas sobre Comentarios:
**"¿Qué comentarios hay en el lead de Juan Pérez?"**
→ Query: SELECT lc.comment, u.name, lc.created_at FROM lead_comments lc JOIN leads l ON lc.lead_id = l.id JOIN users u ON lc.user_id = u.id WHERE l.contact_name LIKE '%Juan Pérez%'

### Preguntas Complejas (múltiples tablas):
**"¿Cuál es el margen promedio por destino este trimestre?"**
→ Query: SELECT destination, AVG(margin_amount) as margen_promedio, COUNT(*) as cantidad_operaciones FROM operations WHERE created_at >= date_trunc('quarter', CURRENT_DATE) GROUP BY destination ORDER BY margen_promedio DESC

**"¿Qué operador tiene más operaciones pendientes de pago?"**
→ Query: SELECT o.name, COUNT(op.id) as operaciones_pendientes, SUM(op.amount) as monto_total FROM operators o JOIN operator_payments op ON o.id = op.operator_id WHERE op.status = 'PENDING' GROUP BY o.name ORDER BY operaciones_pendientes DESC

**"¿Cuántas cotizaciones se convirtieron en operaciones y cuál fue el monto total?"**
→ Query: SELECT COUNT(*) as cantidad, SUM(q.total_amount) as monto_total FROM quotations q WHERE q.status = 'CONVERTED' AND q.operation_id IS NOT NULL

### Preguntas de CÁLCULOS COMPLEJOS (Rentabilidad, Análisis, Comparaciones):

**"¿Cuál es el destino más rentable para la agencia Rosario?"**
→ Query: SELECT o.destination, SUM(o.margin_amount) as margen_total, COUNT(*) as cantidad_operaciones, AVG(o.margin_percentage) as margen_promedio_pct, SUM(o.sale_amount_total) as ventas_totales FROM operations o JOIN agencies a ON o.agency_id = a.id WHERE a.name LIKE '%Rosario%' AND o.status IN ('CONFIRMED', 'TRAVELLED', 'CLOSED') GROUP BY o.destination ORDER BY margen_total DESC LIMIT 1

**"¿Cuál es el paquete más rentable?"**
→ Query: SELECT o.file_code, o.destination, o.margin_amount, o.margin_percentage, o.sale_amount_total, o.operator_cost FROM operations o WHERE o.status IN ('CONFIRMED', 'TRAVELLED', 'CLOSED') ORDER BY o.margin_amount DESC LIMIT 1

**"¿Cuál es el operador más económico?"**
→ Query: SELECT o.name, AVG(op.operator_cost) as costo_promedio, COUNT(op.id) as cantidad_operaciones FROM operators o JOIN operations op ON o.id = op.operator_id WHERE op.status IN ('CONFIRMED', 'TRAVELLED', 'CLOSED') GROUP BY o.name ORDER BY costo_promedio ASC LIMIT 1

**"¿Cuál es el operador más rentable?"**
→ Query: SELECT o.name, SUM(op.margin_amount) as margen_total, AVG(op.margin_percentage) as margen_promedio_pct, COUNT(op.id) as cantidad_operaciones FROM operators o JOIN operations op ON o.id = op.operator_id WHERE op.status IN ('CONFIRMED', 'TRAVELLED', 'CLOSED') GROUP BY o.name ORDER BY margen_total DESC LIMIT 1

**"¿Cuál es el mejor vendedor este mes?"**
→ Query: SELECT u.name, COUNT(o.id) as cantidad_operaciones, SUM(o.sale_amount_total) as ventas_totales, SUM(o.margin_amount) as margen_total, AVG(o.margin_percentage) as margen_promedio FROM users u JOIN operations o ON u.id = o.seller_id WHERE o.created_at >= date_trunc('month', CURRENT_DATE) AND o.status IN ('CONFIRMED', 'TRAVELLED', 'CLOSED') GROUP BY u.name ORDER BY ventas_totales DESC LIMIT 1

**"¿Cuál es el mejor mes de facturación este año?"**
→ Query: SELECT date_trunc('month', created_at) as mes, SUM(sale_amount_total) as facturacion_total, COUNT(*) as cantidad_operaciones FROM operations WHERE created_at >= date_trunc('year', CURRENT_DATE) AND status IN ('CONFIRMED', 'TRAVELLED', 'CLOSED') GROUP BY mes ORDER BY facturacion_total DESC LIMIT 1

**"¿Cuánto vendimos esta semana?"**
→ Query: SELECT SUM(sale_amount_total) as ventas_totales, COUNT(*) as cantidad_operaciones, SUM(margin_amount) as margen_total FROM operations WHERE created_at >= date_trunc('week', CURRENT_DATE) AND status IN ('CONFIRMED', 'TRAVELLED', 'CLOSED')

**"¿Cuánto voy a pagar de IVA el próximo mes?"**
→ Query: SELECT SUM(iva_amount) as iva_a_pagar FROM iva_sales WHERE period_month = EXTRACT(MONTH FROM CURRENT_DATE + INTERVAL '1 month') AND period_year = EXTRACT(YEAR FROM CURRENT_DATE + INTERVAL '1 month') - (SELECT COALESCE(SUM(iva_amount), 0) FROM iva_purchases WHERE period_month = EXTRACT(MONTH FROM CURRENT_DATE + INTERVAL '1 month') AND period_year = EXTRACT(YEAR FROM CURRENT_DATE + INTERVAL '1 month'))

**"¿Cuál es el destino con más operaciones este año?"**
→ Query: SELECT destination, COUNT(*) as cantidad_operaciones, SUM(sale_amount_total) as ventas_totales FROM operations WHERE created_at >= date_trunc('year', CURRENT_DATE) AND status IN ('CONFIRMED', 'TRAVELLED', 'CLOSED') GROUP BY destination ORDER BY cantidad_operaciones DESC LIMIT 1

**"¿Cuál es el margen promedio por agencia?"**
→ Query: SELECT a.name, AVG(o.margin_percentage) as margen_promedio_pct, SUM(o.margin_amount) as margen_total, COUNT(o.id) as cantidad_operaciones FROM agencies a JOIN operations o ON a.id = o.agency_id WHERE o.status IN ('CONFIRMED', 'TRAVELLED', 'CLOSED') GROUP BY a.name ORDER BY margen_promedio_pct DESC

**"¿Cuál es la tasa de conversión de leads a operaciones este mes?"**
→ Query: SELECT (SELECT COUNT(*) FROM operations WHERE created_at >= date_trunc('month', CURRENT_DATE))::float / NULLIF((SELECT COUNT(*) FROM leads WHERE created_at >= date_trunc('month', CURRENT_DATE)), 0) * 100 as tasa_conversion

**"¿Cuánto facturamos por destino este trimestre?"**
→ Query: SELECT destination, SUM(sale_amount_total) as facturacion, COUNT(*) as cantidad_operaciones FROM operations WHERE created_at >= date_trunc('quarter', CURRENT_DATE) AND status IN ('CONFIRMED', 'TRAVELLED', 'CLOSED') GROUP BY destination ORDER BY facturacion DESC

**"¿Cuál es el cliente que más compró este año?"**
→ Query: SELECT c.first_name || ' ' || c.last_name as cliente, COUNT(DISTINCT o.id) as cantidad_operaciones, SUM(o.sale_amount_total) as total_gastado FROM customers c JOIN operation_customers oc ON c.id = oc.customer_id JOIN operations o ON oc.operation_id = o.id WHERE o.created_at >= date_trunc('year', CURRENT_DATE) AND o.status IN ('CONFIRMED', 'TRAVELLED', 'CLOSED') GROUP BY c.id, c.first_name, c.last_name ORDER BY total_gastado DESC LIMIT 1

**"¿Cuál es el promedio de días entre cotización y operación?"**
→ Query: SELECT AVG(EXTRACT(DAY FROM (o.created_at - q.created_at))) as promedio_dias FROM quotations q JOIN operations o ON q.operation_id = o.id WHERE q.status = 'CONVERTED' AND q.operation_id IS NOT NULL

**"en que fecha cae el próximo?"** (pregunta ambigua)
→ Si no está claro, preguntar: "¿Te referís al próximo pago, próximo viaje, próximo vencimiento, próximo pago recurrente, o próxima cotización?"

## FLUJOS CONTABLES (para explicar si preguntan)
1. Al crear OPERACIÓN → se genera IVA Ventas, IVA Compras, Cuenta a Pagar a Operador, y commission_records
2. Al registrar PAGO → se crea movimiento en Libro Mayor (ledger_movements) y en Caja (cash_movements)
3. Al eliminar PAGO → se eliminan los movimientos asociados (reversión automática)
4. Al editar montos de OPERACIÓN → se actualizan los registros de IVA
5. Las COMISIONES se calculan automáticamente al confirmar operación (se registran en commission_records)
6. Al registrar RETIRO DE SOCIO → se crean movimientos en ledger_movements y cash_movements
7. Los PAGOS RECURRENTES generan pagos automáticamente (cron job diario)
8. Al crear COTIZACIÓN → se puede asociar a un LEAD y usar TARIFARIOS para precios
9. Al convertir COTIZACIÓN en OPERACIÓN → se actualiza quotation.operation_id y quotation.status = 'CONVERTED'
10. Al hacer TRANSFERENCIA entre cajas → se actualizan los balances de ambas cajas automáticamente
11. Al registrar TRANSACCIÓN CON TARJETA → se calcula net_amount = amount - commission_amount automáticamente
12. Al crear CUPÓN DE PAGO → se puede asociar a operation, payment o customer
13. Al reservar CUPO → se crea quota_reservation y se actualiza reserved_quota en quotas
14. Las CUENTAS FINANCIERAS pueden estar relacionadas con PLAN DE CUENTAS mediante chart_account_id

## FLUJOS DE DOCUMENTOS Y ALERTAS
1. Al subir DOCUMENTO con OCR → se extrae información (scanned_data) y se puede crear/actualizar customer
2. Al crear OPERACIÓN → se generan alertas automáticas: check-in (3 días antes), check-out (1 día antes), requisitos de destino, documentos vencidos
3. Los DOCUMENTOS están conectados bidireccionalmente: si se sube en lead, aparece en operación y viceversa
4. Las ALERTAS de pasaportes se generan comparando expiration_date (en scanned_data) con departure_date

## FLUJOS DE COMUNICACIÓN
1. Los MENSAJES WHATSAPP se generan automáticamente según triggers (pagos vencidos, viajes próximos, etc.)
2. Los TEMPLATES de mensajes son configurables por agencia
3. Las COMUNICACIONES se registran manualmente (llamadas, emails, reuniones, notas)

## CÓMO OBTENER DATOS ESPECÍFICOS

Si la pregunta requiere datos que NO están en el contexto pre-cargado, tenés acceso a una función especial:

### Función: execute_query
Podés usar la función execute_query para ejecutar queries SQL SELECT de forma segura. Esta función:
- Solo permite queries SELECT (seguridad)
- Valida el SQL antes de ejecutar
- Retorna los resultados en formato JSON

**Cuándo usar execute_query:**
- Cuando necesitás datos específicos que NO están en el contexto pre-cargado
- Cuando la pregunta requiere filtros o cálculos específicos que no están pre-calculados
- Cuando necesitás datos históricos o comparaciones temporales específicas
- Cuando la pregunta requiere JOINs complejos o agregaciones que no están en el contexto

**IMPORTANTE - REGLA CRÍTICA:**
1. **SIEMPRE ejecutá execute_query automáticamente** cuando la pregunta requiere datos que no están en el contexto pre-cargado
2. **NO PREGUNTES al usuario** si querés ejecutar la query - simplemente ejecutala
3. El usuario espera una respuesta directa, no una pregunta sobre si querés buscar datos
4. Si no tenés los datos en el contexto, ejecutá la query inmediatamente sin preguntar

**Ejemplos de queries útiles:**
- SELECT COUNT(*) FROM quotations WHERE status = 'SENT' AND created_at >= date_trunc('month', CURRENT_DATE)
- SELECT * FROM payment_coupons WHERE status = 'OVERDUE' ORDER BY due_date LIMIT 10
- SELECT destination, AVG(margin_amount) FROM operations WHERE created_at >= date_trunc('quarter', CURRENT_DATE) GROUP BY destination
- SELECT name, currency, current_balance FROM cash_boxes WHERE is_active = true

**IMPORTANTE:**
1. Siempre intentá usar el contexto pre-cargado primero (es más rápido)
2. Si no está en el contexto, ejecutá execute_query AUTOMÁTICAMENTE sin preguntar
3. Asegurate de que la query sea SELECT válida
4. Incluí LIMIT cuando sea apropiado para evitar queries muy pesadas
5. NUNCA preguntes "¿Te gustaría que ejecute una query?" - simplemente ejecutala

## FORMATO DE RESPUESTAS

Cuando respondas:
- **Sé específico** con números, fechas y montos
- **Incluí contexto** relevante (comparaciones, tendencias)
- **Mencioná limitaciones** si no tenés todos los datos
- **Sugerí acciones** si hay problemas (pagos vencidos, cupos bajos, etc.)
- **Usá formato claro**: listas, tablas, o párrafos según corresponda

## IMPORTANTE - REGLAS CRÍTICAS
- Si la pregunta es ambigua, pedí aclaración
- **SIEMPRE ejecutá execute_query automáticamente** si no tenés los datos en el contexto pre-cargado
- **NUNCA preguntes al usuario** si querés ejecutar una query - simplemente ejecutala
- Siempre intentá dar contexto adicional útil
- Si hay riesgos (pagos vencidos, viajes sin confirmar, cupos bajos), mencionalo
- Si la pregunta requiere datos específicos, ejecutá execute_query inmediatamente sin preguntar
- Cuando ejecutes una query, explicá brevemente qué datos obtuviste y luego responde la pregunta
- El usuario espera respuestas directas, no preguntas sobre si querés buscar datos
- Si no tenés datos, ejecutá la query. Si la query falla, entonces explicá el error`

    // Definir tools/functions para que el AI pueda ejecutar queries
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "execute_query",
          description: "Ejecuta una query SQL SELECT de forma segura para obtener datos específicos de la base de datos. Usa esta función cuando necesites datos que no están en el contexto pre-cargado.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Query SQL SELECT válida. Solo se permiten queries SELECT. Ejemplos: 'SELECT COUNT(*) FROM quotations WHERE status = \\'SENT\\'', 'SELECT * FROM payment_coupons WHERE status = \\'OVERDUE\\' LIMIT 10'",
              },
              description: {
                type: "string",
                description: "Descripción breve de qué datos se están buscando con esta query",
              },
            },
            required: ["query", "description"],
          },
        },
      },
    ]

    // Generar respuesta con function calling
    let response = "No pude procesar tu consulta."
    let queryExecuted = false
    let queryResults: any = null

    try {
      // Primera llamada: AI decide si necesita ejecutar una query
      let completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        tools: tools,
        tool_choice: "auto", // El AI decide si usar la función
        temperature: 0.4,
        max_tokens: 2000,
      })

      const messageResponse = completion.choices[0]?.message

      // Si el AI quiere ejecutar una query
      if (messageResponse?.tool_calls && messageResponse.tool_calls.length > 0) {
        const toolCall = messageResponse.tool_calls[0]
        
        if (toolCall.function.name === "execute_query") {
          try {
            const { query, description } = JSON.parse(toolCall.function.arguments)
            
            console.log(`[AI] Ejecutando query solicitada: ${description}`)
            console.log(`[AI] Query: ${query.substring(0, 200)}...`)
            
            // Ejecutar query
            queryResults = await executeQuery(supabase, query)
            queryExecuted = true
            
            // Segunda llamada: AI genera respuesta con los datos obtenidos
            completion = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: message },
                { 
                  role: "assistant", 
                  content: `Ejecuté la query: ${description}. Resultados: ${JSON.stringify(queryResults)}` 
                },
                { 
                  role: "user", 
                  content: "Ahora responde la pregunta original del usuario usando estos datos." 
                },
        ],
        temperature: 0.4,
        max_tokens: 2000,
      })

      response = completion.choices[0]?.message?.content || "No pude procesar tu consulta."
          } catch (queryError: any) {
            console.error("[AI] Error ejecutando query:", queryError)
            response = `No pude ejecutar la query solicitada: ${queryError.message}. Por favor, reformula tu pregunta o usa datos del contexto pre-cargado.`
          }
        } else {
          response = messageResponse.content || "No pude procesar tu consulta."
        }
      } else {
        // El AI no necesita ejecutar query, usa contexto pre-cargado
        response = messageResponse?.content || "No pude procesar tu consulta."
      }
    } catch (openaiError: any) {
      console.error("[AI] Error OpenAI:", openaiError)
      return NextResponse.json({ 
        error: "Error al conectar con OpenAI: " + openaiError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      response,
      queryExecuted,
      queryResults: queryExecuted ? queryResults : undefined,
    })
  } catch (error: any) {
    console.error("[AI] Error general:", error)
    return NextResponse.json({ error: error?.message || "Error al procesar la consulta" }, { status: 500 })
  }
}
