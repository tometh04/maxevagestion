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
- operator_id: UUID (FK → operators)
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
- created_at, updated_at: TIMESTAMP
- created_by: UUID (FK → users)
NOTA: Pagos que se generan automáticamente según frecuencia. Un cron job genera los pagos.

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
- Una OPERACIÓN tiene un VENDEDOR (seller_id), un OPERADOR (operator_id), y un CLIENTE PRINCIPAL (customer_id)
- Una OPERACIÓN puede tener MÚLTIPLES CLIENTES/PASAJEROS (tabla operation_customers)
- Una OPERACIÓN puede tener muchos PAGOS (INCOME de clientes, EXPENSE a operadores)
- Un LEAD puede convertirse en una OPERACIÓN cuando se concreta la venta
- Los PAGOS generan movimientos en ledger_movements y cash_movements automáticamente
- Los PAGOS tienen estado PENDING/PAID/OVERDUE
- Las ALERTAS se generan automáticamente: pagos vencidos, viajes próximos, documentos faltantes, pasaportes vencidos, requisitos de destino
- Los DOCUMENTOS pueden estar asociados a operations, customers o leads (conectados bidireccionalmente)
- Los RETIROS DE SOCIOS generan movimientos en ledger_movements y cash_movements
- Los PAGOS RECURRENTES generan pagos automáticamente según su frecuencia
- Los MENSAJES WHATSAPP se generan automáticamente según triggers configurados

### MÉTRICAS DE NEGOCIO:
- VENTA TOTAL = sale_amount_total (lo que paga el cliente)
- COSTO = operator_cost (lo que pagamos al operador)
- MARGEN = margin_amount = sale_amount_total - operator_cost (nuestra ganancia)
- COMISIÓN = commission_amount (lo que gana el vendedor, registrado en commission_records)
- CONVERSIÓN = leads WON / leads totales
- IVA A PAGAR = ivaVentas - ivaCompras (débito fiscal - crédito fiscal)
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
  // Validar que sea solo SELECT (seguridad)
  const normalizedQuery = query.trim().toUpperCase()
  if (!normalizedQuery.startsWith("SELECT")) {
    throw new Error("Solo se permiten consultas SELECT")
  }
  
  // Ejecutar usando rpc si existe, o directamente
  const { data, error } = await supabase.rpc('execute_readonly_query', { query_text: query })
  
  if (error) {
    // Si no existe la función RPC, intentar consulta directa limitada
    console.log("[AI] RPC no disponible, usando consulta directa")
    return { error: error.message, note: "Función RPC no configurada" }
  }
  
  return data
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

    const { message, agencyId, operationId: operationIdFromRequest } = validatedBody

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

    // Paralelizar queries finales (12-17)
    const [pendingCommissionsResult, pendingOperatorPaymentsResult, destinationRequirementsResult, partnerAccountsResult, recurringPaymentsResult, whatsappMessagesResult] = await Promise.all([
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
    ])

    const pendingCommissions = pendingCommissionsResult.data || []
    const pendingOperatorPayments = pendingOperatorPaymentsResult.data || []
    const destinationRequirements = destinationRequirementsResult.data || []
    const partnerAccounts = partnerAccountsResult.data || []
    const recurringPayments = recurringPaymentsResult.data || []
    const whatsappMessages = whatsappMessagesResult.data || []

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

    // Detectar si la pregunta menciona una operación específica (por ID o código)
    // O si viene operationId en el request (usuario está en la página de la operación)
    let operationDocuments: any[] = []
    let targetOperationId: string | null = null
    
    // Prioridad 1: operationId del request (si el usuario está en la página de la operación)
    if (operationIdFromRequest) {
      targetOperationId = operationIdFromRequest
    } else {
      // Prioridad 2: Buscar en el mensaje
      // Buscar UUID completo
      const fullUuidMatch = message.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)
      
      // Buscar ID parcial (primeros 8 caracteres del UUID)
      const partialIdMatch = message.match(/([a-f0-9]{8})[^a-f0-9]/i)
      
      // Buscar código de operación
      const operationCodeMatch = message.match(/OP-[\w-]+/i) || 
                                 message.match(/#([\w-]+)/i) ||
                                 message.match(/c[oó]digo[:\s]+([\w-]+)/i)

      if (fullUuidMatch || partialIdMatch || operationCodeMatch) {
        try {
          let operationQuery = supabase.from("operations").select("id, file_code")
          
          if (fullUuidMatch) {
            // UUID completo
            operationQuery = operationQuery.eq("id", fullUuidMatch[1])
          } else if (partialIdMatch) {
            // ID parcial - buscar operaciones que empiecen con ese ID
            const partialId = partialIdMatch[1]
            operationQuery = operationQuery.ilike("id", `${partialId}%`)
          } else if (operationCodeMatch) {
            // Código de operación
            const code = operationCodeMatch[1] || operationCodeMatch[0].replace(/OP-|#/, "")
            operationQuery = operationQuery.ilike("file_code", `%${code}%`)
          }
          
          const { data: operations } = await operationQuery.limit(1)
          
          if (operations && operations.length > 0) {
            targetOperationId = operations[0].id
          }
        } catch (error) {
          console.error("[AI] Error buscando operación:", error)
        }
      }
    }

    // Si tenemos un operationId, cargar sus documentos con scanned_data
    if (targetOperationId) {
      try {
        const { data: operation } = await supabase
          .from("operations")
          .select("id, file_code")
          .eq("id", targetOperationId)
          .single()
        
        if (operation) {
          // Cargar documentos de la operación con scanned_data
          const { data: docs } = await supabase
            .from("documents")
            .select("id, type, file_url, scanned_data, uploaded_at")
            .eq("operation_id", targetOperationId)
            .order("uploaded_at", { ascending: false })
          
          if (docs && docs.length > 0) {
            operationDocuments = docs.map((doc: any) => ({
              tipo: doc.type,
              url: doc.file_url,
              datos_escaneados: doc.scanned_data,
              subido: doc.uploaded_at,
            }))
            
            contextData.operacionConsultada = {
              id: operation.id,
              codigo: operation.file_code,
              documentos: operationDocuments,
            }
            
            console.log(`[AI] ✅ Cargados ${operationDocuments.length} documentos con scanned_data para operación ${operation.file_code}`)
          } else {
            console.log(`[AI] ⚠️ No se encontraron documentos para operación ${operation.file_code}`)
          }
        }
      } catch (error) {
        console.error("[AI] Error cargando documentos de operación:", error)
      }
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

**"¿Cuánto vendimos esta semana?"**
→ Usar datos de ventasEstaSemana

**"¿Qué pagos vencen hoy?"** o **"¿Qué cobros tengo hoy?"**
→ Usar datos de pagosVencenHoy

**"¿Qué viajes salen esta semana?"**
→ Usar datos de viajesProximos

**"¿Quién vendió más este mes?"**
→ Usar datos de topVendedores

**"¿Cómo estamos vs el mes pasado?"**
→ Comparar ventasMesActual con mes pasado

**"¿Cuánto IVA tenemos que pagar este mes?"**
→ Usar datos de ivaMes (ivaVentas - ivaCompras = ivaPagar)

**"¿Cuánto le debemos a los operadores?"**
→ Usar datos de pagosPendientesOperadores

**"¿Cuánto hay en caja?"** o **"¿Cómo está la caja este mes?"**
→ Usar datos de movimientosCajaMes

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

**"¿Qué requisitos faltan para la operación X?"**
→ Consultar destination_requirements para el destino de la operación y comparar con documentos cargados

**"¿Qué datos tiene el DNI que subí?"** o **"¿Qué información tiene el documento de esta operación?"**
→ Si se menciona una operación específica (por ID o código), usar datos de operacionConsultada.documentos donde cada documento tiene datos_escaneados con información extraída por OCR (nombre, documento, fecha_nacimiento, etc.)

**"en que fecha cae el próximo?"** (pregunta ambigua)
→ Si no está claro, preguntar: "¿Te referís al próximo pago, próximo viaje, próximo vencimiento, o próximo pago recurrente?"

## FLUJOS CONTABLES (para explicar si preguntan)
1. Al crear OPERACIÓN → se genera IVA Ventas, IVA Compras, Cuenta a Pagar a Operador, y commission_records
2. Al registrar PAGO → se crea movimiento en Libro Mayor (ledger_movements) y en Caja (cash_movements)
3. Al eliminar PAGO → se eliminan los movimientos asociados (reversión automática)
4. Al editar montos de OPERACIÓN → se actualizan los registros de IVA
5. Las COMISIONES se calculan automáticamente al confirmar operación (se registran en commission_records)
6. Al registrar RETIRO DE SOCIO → se crean movimientos en ledger_movements y cash_movements
7. Los PAGOS RECURRENTES generan pagos automáticamente (cron job diario)

## FLUJOS DE DOCUMENTOS Y ALERTAS
1. Al subir DOCUMENTO con OCR → se extrae información (scanned_data) y se puede crear/actualizar customer
2. Al crear OPERACIÓN → se generan alertas automáticas: check-in (3 días antes), check-out (1 día antes), requisitos de destino, documentos vencidos
3. Los DOCUMENTOS están conectados bidireccionalmente: si se sube en lead, aparece en operación y viceversa
4. Las ALERTAS de pasaportes se generan comparando expiration_date (en scanned_data) con departure_date
5. **IMPORTANTE**: Si el usuario pregunta sobre una operación específica (mencionando ID, código como "OP-20251211-XXX", o "#ee888732"), se cargan automáticamente los documentos de esa operación con sus datos escaneados (scanned_data) en el campo operacionConsultada.documentos. Cada documento tiene:
   - tipo: tipo de documento (DNI, PASSPORT, etc.)
   - datos_escaneados: objeto JSON con información extraída por OCR (document_number, first_name, last_name, date_of_birth, expiration_date, etc.)
   - subido: fecha de subida

## FLUJOS DE COMUNICACIÓN
1. Los MENSAJES WHATSAPP se generan automáticamente según triggers (pagos vencidos, viajes próximos, etc.)
2. Los TEMPLATES de mensajes son configurables por agencia
3. Las COMUNICACIONES se registran manualmente (llamadas, emails, reuniones, notas)

## IMPORTANTE
- Si la pregunta es ambigua, pedí aclaración
- Si no tenés datos suficientes, decilo honestamente
- Siempre intentá dar contexto adicional útil
- Si hay riesgos (pagos vencidos, viajes sin confirmar), mencionalo`

    // Generar respuesta
    let response = "No pude procesar tu consulta."

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.4,
        max_tokens: 2000,
      })

      response = completion.choices[0]?.message?.content || "No pude procesar tu consulta."
    } catch (openaiError: any) {
      console.error("[AI] Error OpenAI:", openaiError)
      return NextResponse.json({ 
        error: "Error al conectar con OpenAI: " + openaiError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ response })
  } catch (error: any) {
    console.error("[AI] Error general:", error)
    return NextResponse.json({ error: error?.message || "Error al procesar la consulta" }, { status: 500 })
  }
}
