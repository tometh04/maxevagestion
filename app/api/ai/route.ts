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
- type: TEXT ('CASH', 'BANK', 'MERCADOPAGO', 'CRYPTO')
- currency: TEXT ('ARS', 'USD')
- initial_balance: NUMERIC
- agency_id: UUID (FK → agencies)
- is_active: BOOLEAN
- created_at, updated_at: TIMESTAMP

### TABLA: ledger_movements (Movimientos contables)
- id: UUID (PK)
- operation_id: UUID (FK → operations)
- payment_id: UUID (FK → payments)
- account_id: UUID (FK → financial_accounts)
- type: TEXT ('INCOME', 'EXPENSE', 'TRANSFER', 'FX_GAIN', 'FX_LOSS', 'OPERATOR_PAYMENT')
- amount: NUMERIC
- currency: TEXT
- amount_ars_equivalent: NUMERIC (Equivalente en ARS)
- description: TEXT
- movement_date: TIMESTAMP
- created_at: TIMESTAMP

### TABLA: alerts (Alertas del sistema)
- id: UUID (PK)
- operation_id, customer_id, user_id: UUID (FKs opcionales)
- type: TEXT ('PAYMENT_DUE', 'OPERATOR_DUE', 'UPCOMING_TRIP', 'MISSING_DOC', 'GENERIC')
- description: TEXT
- date_due: TIMESTAMP
- status: TEXT ('PENDING', 'DONE', 'IGNORED')
- created_at, updated_at: TIMESTAMP

### TABLA: exchange_rates (Tipos de cambio)
- id: UUID (PK)
- date: DATE
- currency_from, currency_to: TEXT
- rate: NUMERIC
- source: TEXT
- created_at: TIMESTAMP

### TABLA: documents (Documentos/Archivos)
- id: UUID (PK)
- operation_id, customer_id, lead_id: UUID (FKs opcionales)
- type: TEXT ('PASSPORT', 'VOUCHER', 'TICKET', 'INVOICE', 'OTHER')
- file_name, file_url, storage_path: TEXT
- uploaded_by: UUID (FK → users)
- uploaded_at: TIMESTAMP

### RELACIONES CLAVE:
- Una OPERACIÓN tiene un VENDEDOR (seller_id), un OPERADOR (operator_id), y un CLIENTE (customer_id)
- Una OPERACIÓN puede tener muchos PAGOS (INCOME de clientes, EXPENSE a operadores)
- Un LEAD puede convertirse en una OPERACIÓN cuando se concreta la venta
- Los PAGOS tienen estado PENDING/PAID/OVERDUE

### MÉTRICAS DE NEGOCIO:
- VENTA TOTAL = sale_amount_total (lo que paga el cliente)
- COSTO = operator_cost (lo que pagamos al operador)
- MARGEN = margin_amount = sale_amount_total - operator_cost (nuestra ganancia)
- COMISIÓN = commission_amount (lo que gana el vendedor)
- CONVERSIÓN = leads WON / leads totales
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
    const contextData: any = {}

    // 1. Resumen de ventas del mes actual
    const { data: salesThisMonth } = await supabase
      .from("operations")
      .select("sale_amount_total, margin_amount, operator_cost, status, product_type, seller_id")
      .gte("created_at", startOfMonth)

    contextData.ventasMesActual = {
      total: (salesThisMonth || []).reduce((sum: number, op: any) => sum + (op.sale_amount_total || 0), 0),
      margen: (salesThisMonth || []).reduce((sum: number, op: any) => sum + (op.margin_amount || 0), 0),
      cantidadOperaciones: (salesThisMonth || []).length,
    }

    // 2. Ventas de esta semana
    const { data: salesThisWeek } = await supabase
      .from("operations")
      .select("sale_amount_total, margin_amount")
      .gte("created_at", startOfWeekStr)

    contextData.ventasEstaSemana = {
      total: (salesThisWeek || []).reduce((sum: number, op: any) => sum + (op.sale_amount_total || 0), 0),
      margen: (salesThisWeek || []).reduce((sum: number, op: any) => sum + (op.margin_amount || 0), 0),
      cantidadOperaciones: (salesThisWeek || []).length,
    }

    // 3. Pagos vencidos
    const { data: overduePayments } = await supabase
      .from("payments")
      .select(`
        id, amount, currency, date_due, direction, payer_type,
        operations:operation_id(file_code, destination, customers:customer_id(first_name, last_name))
      `)
      .eq("status", "PENDING")
      .lt("date_due", currentDate)

    contextData.pagosVencidos = {
      cantidad: (overduePayments || []).length,
      detalles: (overduePayments || []).slice(0, 10).map((p: any) => ({
        monto: p.amount,
        moneda: p.currency,
        vencimiento: p.date_due,
        tipo: p.payer_type === 'CUSTOMER' ? 'Cobrar a cliente' : 'Pagar a operador',
        operacion: p.operations?.file_code || p.operations?.destination,
        cliente: p.operations?.customers ? `${p.operations.customers.first_name} ${p.operations.customers.last_name}` : null,
      })),
    }

    // 4. Pagos que vencen hoy
    const { data: paymentsDueToday } = await supabase
      .from("payments")
      .select(`
        id, amount, currency, direction, payer_type,
        operations:operation_id(file_code, destination, customers:customer_id(first_name, last_name))
      `)
      .eq("status", "PENDING")
      .eq("date_due", currentDate)

    contextData.pagosVencenHoy = {
      cantidad: (paymentsDueToday || []).length,
      detalles: (paymentsDueToday || []).map((p: any) => ({
        monto: p.amount,
        moneda: p.currency,
        tipo: p.payer_type === 'CUSTOMER' ? 'Cobrar a cliente' : 'Pagar a operador',
        operacion: p.operations?.file_code || p.operations?.destination,
        cliente: p.operations?.customers ? `${p.operations.customers.first_name} ${p.operations.customers.last_name}` : null,
      })),
    }

    // 5. Próximos viajes (esta semana)
    const endOfWeek = new Date(today)
    endOfWeek.setDate(today.getDate() + 7)
    const { data: upcomingTrips } = await supabase
      .from("operations")
      .select(`
        id, file_code, destination, departure_date, status,
        customers:customer_id(first_name, last_name, phone),
        users:seller_id(name)
      `)
      .gte("departure_date", currentDate)
      .lte("departure_date", endOfWeek.toISOString().split('T')[0])
      .order("departure_date", { ascending: true })

    contextData.viajesProximos = {
      cantidad: (upcomingTrips || []).length,
      detalles: (upcomingTrips || []).map((t: any) => ({
        codigo: t.file_code,
        destino: t.destination,
        fechaSalida: t.departure_date,
        estado: t.status,
        cliente: t.customers ? `${t.customers.first_name} ${t.customers.last_name}` : null,
        telefono: t.customers?.phone,
        vendedor: t.users?.name,
      })),
    }

    // 6. Top vendedores del mes
    const { data: operations } = await supabase
      .from("operations")
      .select("seller_id, sale_amount_total, margin_amount, users:seller_id(name)")
      .gte("created_at", startOfMonth)

    const sellerStats: Record<string, any> = {}
    for (const op of (operations || []) as any[]) {
      const sellerId = op.seller_id
      const sellerName = op.users?.name || "Sin vendedor"
      if (!sellerStats[sellerId]) {
        sellerStats[sellerId] = { nombre: sellerName, ventas: 0, margen: 0, operaciones: 0 }
      }
      sellerStats[sellerId].ventas += op.sale_amount_total || 0
      sellerStats[sellerId].margen += op.margin_amount || 0
      sellerStats[sellerId].operaciones += 1
    }
    contextData.topVendedores = Object.values(sellerStats)
      .sort((a: any, b: any) => b.ventas - a.ventas)
      .slice(0, 5)

    // 7. Leads activos
    const { data: activeLeads } = await supabase
      .from("leads")
      .select("id, status, source, region, destination")
      .in("status", ["NEW", "IN_PROGRESS", "QUOTED"])

    const leadsByStatus: Record<string, number> = {}
    for (const lead of (activeLeads || []) as any[]) {
      leadsByStatus[lead.status] = (leadsByStatus[lead.status] || 0) + 1
    }
    contextData.leadsActivos = {
      total: (activeLeads || []).length,
      porEstado: leadsByStatus,
    }

    // 8. Cuentas financieras
    const { data: accounts } = await supabase
      .from("financial_accounts")
      .select("name, type, currency, initial_balance")
      .eq("is_active", true)

    contextData.cuentasFinancieras = accounts || []

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

**"en que fecha cae el próximo?"** (pregunta ambigua)
→ Si no está claro, preguntar: "¿Te referís al próximo pago, próximo viaje, o próximo vencimiento?"

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
