import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import OpenAI from "openai"
import { createServerClient } from "@/lib/supabase/server"

// Esquema REAL de la base de datos
const DATABASE_SCHEMA = `
## ESQUEMA DE BASE DE DATOS - MAXEVA GESTION

### users (Usuarios)
- id, name, email, role ('SUPER_ADMIN','ADMIN','SELLER','VIEWER'), is_active

### agencies (Agencias)  
- id, name, city

### operators (Operadores/Proveedores)
- id, name, contact_name, contact_email, contact_phone, credit_limit

### customers (Clientes)
- id, first_name, last_name, phone, email, document_type, document_number, date_of_birth

### leads (Consultas)
- id, agency_id, source, status ('NEW','IN_PROGRESS','QUOTED','WON','LOST'), region, destination
- contact_name, contact_phone, contact_email, assigned_seller_id, travel_date, return_date, created_at

### operations (Operaciones/Ventas) ⭐
- id, file_code, agency_id, seller_id, operator_id, customer_id
- type, origin, destination, departure_date, return_date, checkin_date, checkout_date
- adults, children, infants
- status ('PRE_RESERVATION','RESERVED','CONFIRMED','CANCELLED','TRAVELLED','CLOSED')
- sale_amount_total (venta), sale_currency
- operator_cost (costo), margin_amount (ganancia)
- commission_amount, created_at

### payments (Pagos)
- id, operation_id, payer_type ('CUSTOMER','OPERATOR'), direction ('INCOME','EXPENSE')
- method, amount, currency
- date_due (fecha vencimiento), date_paid (fecha pago)
- status ('PENDING','PAID','OVERDUE'), reference, created_at

### cash_boxes (Cajas)
- id, name, currency ('ARS','USD'), initial_balance, current_balance, is_active

### cash_movements (Movimientos de caja)
- id, cash_box_id, type ('INCOME','EXPENSE'), amount, currency, description, payment_id, created_at

### quotations (Cotizaciones)
- id, lead_id, status ('DRAFT','SENT','APPROVED','REJECTED','CONVERTED'), total_amount, currency

### NOTAS IMPORTANTES:
- Fechas: usar CURRENT_DATE, date_trunc('month', CURRENT_DATE), etc.
- En payments la fecha de vencimiento es "date_due" (NO "due_date")
- Balance caja = initial_balance + ingresos - egresos
- Margen = sale_amount_total - operator_cost
`

const SYSTEM_PROMPT = `Eres "Cerebro", el asistente de MAXEVA GESTION para agencias de viajes.

REGLAS CRÍTICAS:
1. SIEMPRE usa execute_query para obtener datos reales
2. Si una query falla, intenta con otra más simple
3. NUNCA muestres errores técnicos al usuario
4. Responde en español argentino, amigable y conciso
5. Usa emojis para hacer visual (✈️ 🏨 💰 📊 👥)

ESQUEMA:
${DATABASE_SCHEMA}

EJEMPLOS DE QUERIES CORRECTAS:

-- Viajes próximos (usa departure_date O checkin_date)
SELECT file_code, destination, departure_date, checkin_date, sale_amount_total, status 
FROM operations 
WHERE (departure_date >= CURRENT_DATE OR checkin_date >= CURRENT_DATE)
AND status NOT IN ('CANCELLED')
ORDER BY COALESCE(departure_date, checkin_date) ASC LIMIT 10

-- Pagos pendientes (la columna es date_due, NO due_date)
SELECT p.amount, p.currency, p.date_due, p.status
FROM payments p
WHERE p.status = 'PENDING'
ORDER BY p.date_due ASC LIMIT 10

-- Balance de cajas
SELECT cb.name, cb.currency, cb.initial_balance,
  COALESCE(SUM(CASE WHEN cm.type = 'INCOME' THEN cm.amount ELSE 0 END), 0) as ingresos,
  COALESCE(SUM(CASE WHEN cm.type = 'EXPENSE' THEN cm.amount ELSE 0 END), 0) as egresos
FROM cash_boxes cb
LEFT JOIN cash_movements cm ON cm.cash_box_id = cb.id
WHERE cb.is_active = true
GROUP BY cb.id, cb.name, cb.currency, cb.initial_balance

-- Ventas del mes
SELECT COUNT(*) as cantidad, COALESCE(SUM(sale_amount_total), 0) as total
FROM operations
WHERE created_at >= date_trunc('month', CURRENT_DATE) AND status NOT IN ('CANCELLED')

-- Leads por estado
SELECT status, COUNT(*) as cantidad FROM leads
WHERE created_at >= date_trunc('month', CURRENT_DATE) GROUP BY status

-- Total operaciones
SELECT COUNT(*) as total FROM operations WHERE status NOT IN ('CANCELLED')

-- Total clientes
SELECT COUNT(*) as total FROM customers

SI UNA QUERY FALLA:
- Intenta con una versión más simple
- Si sigue fallando, responde: "No pude obtener esa información en este momento. ¿Puedo ayudarte con algo más?"
- NUNCA muestres el error técnico
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
    const userContext = `Fecha: ${today} | Usuario: ${user.name || user.email}`

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "execute_query",
          description: "Ejecuta una consulta SQL SELECT para obtener datos del sistema.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Consulta SQL SELECT" },
              description: { type: "string", description: "Qué información busca" }
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
      max_tokens: 1500
    })

    let assistantMessage = response.choices[0].message
    let finalResponse = assistantMessage.content || ""
    let iterations = 0
    const maxIterations = 3

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
                  count: result.data?.length || 0
                })
              })
            } else {
              // Query falló - decirle al AI que intente otra
              toolResults.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  success: false,
                  message: "La consulta falló. Intenta con una query más simple o responde que no pudiste obtener la información."
                })
              })
            }
          } catch {
            toolResults.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                success: false,
                message: "Error al procesar. Intenta otra forma o responde amablemente que no pudiste obtener la información."
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
        max_tokens: 1500
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
