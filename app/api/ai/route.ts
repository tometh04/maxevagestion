import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import OpenAI from "openai"
import { createServerClient } from "@/lib/supabase/server"

// Esquema completo de la base de datos para que el AI lo entienda
const DATABASE_SCHEMA = `
## ESQUEMA DE BASE DE DATOS - MAXEVA GESTION (Agencia de Viajes)

### TABLA: users (Usuarios del sistema)
- id: UUID (PK)
- name: TEXT (Nombre completo)
- email: TEXT (Email único)
- role: TEXT ('SUPER_ADMIN', 'ADMIN', 'SELLER', 'VIEWER')
- is_active: BOOLEAN
- commission_percentage: NUMERIC (% de comisión del vendedor)

### TABLA: agencies (Agencias/Sucursales)
- id: UUID (PK)
- name: TEXT (Nombre: "Rosario", "Madero")
- city: TEXT

### TABLA: operators (Operadores mayoristas/proveedores)
- id: UUID (PK)
- name: TEXT
- contact_name, contact_email, contact_phone: TEXT
- credit_limit: NUMERIC

### TABLA: customers (Clientes/Pasajeros)
- id: UUID (PK)
- first_name, last_name: TEXT
- phone, email: TEXT
- document_type, document_number: TEXT
- date_of_birth: DATE

### TABLA: leads (Leads/Consultas)
- id: UUID (PK)
- agency_id: UUID (FK → agencies)
- source: TEXT ('Instagram', 'WhatsApp', 'Meta Ads', 'Trello', 'Web', 'Referido', 'Other')
- status: TEXT ('NEW', 'IN_PROGRESS', 'QUOTED', 'WON', 'LOST')
- region: TEXT ('ARGENTINA', 'CARIBE', 'BRASIL', 'EUROPA', 'EEUU', 'OTROS', 'CRUCEROS')
- destination: TEXT
- contact_name, contact_phone, contact_email: TEXT
- assigned_seller_id: UUID (FK → users)
- travel_date, return_date: DATE
- created_at: TIMESTAMP

### TABLA: operations (Operaciones/Ventas) ⭐ MUY IMPORTANTE
- id: UUID (PK)
- file_code: TEXT (Código único: "OP-20250115-abc123")
- agency_id: UUID (FK → agencies)
- seller_id: UUID (FK → users)
- operator_id: UUID (FK → operators)
- customer_id: UUID (FK → customers)
- type: TEXT ('FLIGHT', 'HOTEL', 'PACKAGE', 'CRUISE', 'TRANSFER', 'MIXED')
- origin, destination: TEXT
- departure_date, return_date: DATE (Fechas del viaje)
- checkin_date, checkout_date: DATE (Para hoteles)
- adults, children, infants: INTEGER
- status: TEXT ('PRE_RESERVATION', 'RESERVED', 'CONFIRMED', 'CANCELLED', 'TRAVELLED', 'CLOSED')
- sale_amount_total: NUMERIC (Precio de venta al cliente) 💰
- sale_currency: TEXT ('ARS', 'USD')
- operator_cost: NUMERIC (Costo del operador) 💰
- margin_amount: NUMERIC (Ganancia = sale_amount_total - operator_cost) 💰
- commission_amount: NUMERIC (Comisión del vendedor)
- created_at: TIMESTAMP

### TABLA: payments (Pagos)
- id: UUID (PK)
- operation_id: UUID (FK → operations)
- customer_id: UUID (FK → customers)
- operator_id: UUID (FK → operators)
- type: TEXT ('INCOME' = cobro a cliente, 'EXPENSE' = pago a operador)
- amount: NUMERIC
- currency: TEXT
- payment_method: TEXT ('CASH', 'TRANSFER', 'CREDIT_CARD', 'DEBIT_CARD')
- status: TEXT ('PENDING', 'PAID', 'OVERDUE')
- due_date: DATE
- paid_date: DATE

### TABLA: cash_boxes (Cajas de dinero)
- id: UUID (PK)
- name: TEXT
- currency: TEXT ('ARS', 'USD')
- initial_balance: NUMERIC
- current_balance: NUMERIC
- is_active: BOOLEAN

### TABLA: cash_movements (Movimientos de caja)
- id: UUID (PK)
- cash_box_id: UUID (FK → cash_boxes)
- type: TEXT ('INCOME', 'EXPENSE')
- amount: NUMERIC
- currency: TEXT
- description: TEXT
- payment_id: UUID (FK → payments, opcional)
- created_at: TIMESTAMP

### TABLA: quotations (Cotizaciones)
- id: UUID (PK)
- lead_id: UUID (FK → leads)
- status: TEXT ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'CONVERTED')
- total_amount: NUMERIC
- currency: TEXT

### MÉTRICAS DE NEGOCIO IMPORTANTES:
- VENTA TOTAL = sale_amount_total
- COSTO = operator_cost
- MARGEN = margin_amount = sale_amount_total - operator_cost
- CONVERSIÓN LEADS = leads con status='WON' / total leads
- BALANCE CAJA = Se calcula sumando todos los cash_movements (INCOME - EXPENSE)
`

const SYSTEM_PROMPT = `Eres "Cerebro", el asistente inteligente de MAXEVA GESTION, un sistema de gestión para agencias de viajes.

IMPORTANTE - TU FORMA DE TRABAJAR:
1. Tienes acceso COMPLETO a la base de datos del sistema
2. Para CUALQUIER pregunta sobre datos, DEBES usar la función execute_query
3. Construye queries SQL dinámicas basadas en lo que te pregunten
4. SIEMPRE ejecuta queries para obtener datos reales, NUNCA inventes datos
5. Responde en español argentino, de forma amigable y concisa

ESQUEMA DE LA BASE DE DATOS:
${DATABASE_SCHEMA}

EJEMPLOS DE QUERIES QUE PUEDES HACER:

Para viajes/salidas próximas (usa departure_date O checkin_date):
SELECT file_code, destination, departure_date, checkin_date, sale_amount_total, status 
FROM operations 
WHERE (departure_date >= CURRENT_DATE OR checkin_date >= CURRENT_DATE)
AND status NOT IN ('CANCELLED')
ORDER BY COALESCE(departure_date, checkin_date) ASC
LIMIT 20

Para balance de cajas:
SELECT cb.name, cb.currency, cb.initial_balance,
  COALESCE(SUM(CASE WHEN cm.type = 'INCOME' THEN cm.amount ELSE 0 END), 0) as ingresos,
  COALESCE(SUM(CASE WHEN cm.type = 'EXPENSE' THEN cm.amount ELSE 0 END), 0) as egresos
FROM cash_boxes cb
LEFT JOIN cash_movements cm ON cm.cash_box_id = cb.id
WHERE cb.is_active = true
GROUP BY cb.id, cb.name, cb.currency, cb.initial_balance

Para ventas del mes:
SELECT COUNT(*) as cantidad, SUM(sale_amount_total) as total_ventas, SUM(margin_amount) as total_margen
FROM operations
WHERE created_at >= date_trunc('month', CURRENT_DATE)
AND status NOT IN ('CANCELLED')

Para leads por estado:
SELECT status, COUNT(*) as cantidad
FROM leads
WHERE created_at >= date_trunc('month', CURRENT_DATE)
GROUP BY status

Para pagos pendientes:
SELECT p.amount, p.currency, p.due_date, c.first_name, c.last_name, o.file_code
FROM payments p
LEFT JOIN customers c ON c.id = p.customer_id
LEFT JOIN operations o ON o.id = p.operation_id
WHERE p.status = 'PENDING' AND p.due_date <= CURRENT_DATE + INTERVAL '7 days'
ORDER BY p.due_date ASC

REGLAS:
1. Siempre usa CURRENT_DATE para fechas actuales
2. Usa date_trunc('month', CURRENT_DATE) para inicio del mes
3. Filtra por status NOT IN ('CANCELLED') cuando sea relevante
4. Para viajes próximos, considera AMBOS: departure_date (vuelos) y checkin_date (hoteles)
5. El balance de caja se calcula: initial_balance + ingresos - egresos
6. Formatea montos con el símbolo de moneda ($ para ARS, USD para dólares)
7. Si no hay datos, dilo claramente
8. Sé proactivo: si te preguntan algo general, da un resumen útil

FORMATO DE RESPUESTA:
- Usa emojis para hacer más visual (✈️ 🏨 💰 📊 👥 📅)
- Formatea números grandes con separadores de miles
- Si hay muchos items, haz una lista ordenada
- Si hay errores en la query, explica qué pasó y sugiere alternativas
`

// Ejecutar consulta SQL de forma segura
async function executeQuery(supabase: any, query: string): Promise<any> {
  try {
    const cleanedQuery = query.trim()
    const normalizedQuery = cleanedQuery.toUpperCase()
    
    if (!normalizedQuery.startsWith("SELECT")) {
      throw new Error("Solo se permiten consultas SELECT")
    }
    
    console.log("[Cerebro] Ejecutando query:", cleanedQuery.substring(0, 300))
    
    const { data, error } = await supabase.rpc('execute_readonly_query', { query_text: cleanedQuery })
    
    if (error) {
      console.error("[Cerebro] Error en query:", error)
      throw new Error(`Error: ${error.message}`)
    }
    
    const result = Array.isArray(data) ? data : (data ? [data] : [])
    console.log("[Cerebro] Resultados:", result.length)
    return result
  } catch (error: any) {
    console.error("[Cerebro] Error:", error)
    throw error
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
      return NextResponse.json({ error: "OpenAI no configurado" }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey: openaiKey })
    const supabase = await createServerClient()

    // Obtener contexto básico del usuario
    const today = new Date().toISOString().split('T')[0]
    const userContext = `
Fecha actual: ${today}
Usuario: ${user.name || user.email}
Rol: ${user.role}
`

    // Función para que OpenAI ejecute queries
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "execute_query",
          description: "Ejecuta una consulta SQL SELECT en la base de datos para obtener información. SIEMPRE usa esta función para obtener datos reales del sistema.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "La consulta SQL SELECT a ejecutar. Solo SELECT está permitido."
              },
              description: {
                type: "string",
                description: "Breve descripción de qué información se busca con esta query"
              }
            },
            required: ["query", "description"]
          }
        }
      }
    ]

    // Primera llamada al AI
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `${userContext}\n\nPregunta del usuario: ${message}` }
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
    let queryExecuted = false
    let queryResults: any = null

    // Manejar llamadas a funciones (puede haber múltiples)
    let iterations = 0
    const maxIterations = 5

    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0 && iterations < maxIterations) {
      iterations++
      const toolResults: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.function.name === "execute_query") {
          try {
            const args = JSON.parse(toolCall.function.arguments)
            console.log(`[Cerebro] Query ${iterations}: ${args.description}`)
            
            const results = await executeQuery(supabase, args.query)
            queryExecuted = true
            queryResults = results

            toolResults.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                success: true,
                data: results,
                count: results.length,
                description: args.description
              })
            })
          } catch (error: any) {
            console.error("[Cerebro] Error en query:", error)
            toolResults.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                success: false,
                error: error.message,
                suggestion: "Intenta con una query más simple o verifica los nombres de las tablas/columnas"
              })
            })
          }
        }
      }

      // Agregar resultados y obtener siguiente respuesta
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

    return NextResponse.json({
      response: finalResponse,
      queryExecuted,
      queryCount: iterations
    })

  } catch (error: any) {
    console.error("[Cerebro] Error general:", error)
    return NextResponse.json(
      { error: error.message || "Error interno" },
      { status: 500 }
    )
  }
}
