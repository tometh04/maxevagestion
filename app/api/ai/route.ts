import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import OpenAI from "openai"
import {
  getSalesSummary,
  getDuePayments,
  getSellerPerformance,
  getTopDestinations,
  getOperatorBalances,
  getIVAStatus,
  getCashBalances,
  getFXStatus,
  getOverdueOperatorPayments,
  getOperationMargin,
} from "@/lib/ai/tools"
import { withRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { validateRequest, aiCopilotSchema } from "@/lib/validation"
import { createAuditLog, getRequestMetadata } from "@/lib/audit-log"
import { createServerClient } from "@/lib/supabase/server"

// Helper para limpiar JSON de markdown
function cleanJsonString(jsonString: string): string {
  if (!jsonString) return "{}"
  // Remover markdown code blocks
  let cleaned = jsonString.trim()
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7)
  }
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3)
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3)
  }
  return cleaned.trim()
}

// Fallback: detección de keywords para llamar herramientas sin OpenAI
function detectToolsFromMessage(message: string): any[] {
  const lowerMessage = message.toLowerCase()
  const tools: any[] = []

  // Detectar años en el mensaje (ej: "2021", "2024", "año 2023")
  const yearMatch = lowerMessage.match(/(?:año|year)?\s*(\d{4})/)
  const detectedYear = yearMatch ? parseInt(yearMatch[1]) : null

  // Detectar consultas de ventas (mejorado para capturar más variaciones)
  if (
    lowerMessage.includes("venta") ||
    lowerMessage.includes("vendimos") ||
    lowerMessage.includes("ventas") ||
    lowerMessage.includes("ingreso") ||
    lowerMessage.includes("operacion") ||
    lowerMessage.includes("operaciones") ||
    lowerMessage.includes("cuanto") ||
    lowerMessage.includes("cuánto") ||
    detectedYear !== null
  ) {
    let from: string | undefined
    let to: string | undefined

    if (detectedYear) {
      // Si detectó un año específico, buscar ventas de ese año
      from = `${detectedYear}-01-01`
      to = `${detectedYear}-12-31`
    } else {
      // Por defecto, mes actual
      const today = new Date()
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
      from = firstDay.toISOString().split("T")[0]
      to = today.toISOString().split("T")[0]
    }

    tools.push({
      name: "getSalesSummary",
      params: { from, to },
    })
  }

  // Detectar consultas de pagos
  if (
    lowerMessage.includes("pago") ||
    lowerMessage.includes("vencido") ||
    lowerMessage.includes("pendiente")
  ) {
    tools.push({ name: "getDuePayments", params: {} })
  }

  // Detectar consultas de operadores
  if (lowerMessage.includes("operador") || lowerMessage.includes("balance")) {
    tools.push({ name: "getOperatorBalances", params: { onlyOverdue: false } })
  }

  // Detectar consultas de IVA
  if (lowerMessage.includes("iva") || lowerMessage.includes("impuesto")) {
    const today = new Date()
    tools.push({
      name: "getIVAStatus",
      params: { year: today.getFullYear(), month: today.getMonth() + 1 },
    })
  }

  // Detectar consultas de caja
  if (lowerMessage.includes("caja") || lowerMessage.includes("saldo")) {
    tools.push({ name: "getCashBalances", params: {} })
  }

  return tools
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Rate limiting: 10 requests por minuto por usuario
    try {
      withRateLimit(user.id, "/api/ai", RATE_LIMIT_CONFIGS.AI_COPILOT)
    } catch (error: any) {
      if (error.statusCode === 429) {
        return NextResponse.json(
          { error: "Demasiadas solicitudes. Por favor, espera un momento." },
          {
            status: 429,
            headers: {
              "Retry-After": "60",
              "X-RateLimit-Reset": String(error.resetTime),
            },
          }
        )
      }
      throw error
    }

    // Validar request body
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
      action: "SYNC_TRELLO", // Acción temporal, agregar "AI_COPILOT_QUERY" después
      entity_type: "ai_copilot",
      details: { message_length: message.length, has_agency: !!agencyId },
      ...metadata,
    })

    // Validar API key de OpenAI - OBLIGATORIA
    const openaiApiKey = process.env.OPENAI_API_KEY
    const lowerMessage = message.toLowerCase()
    
    // SIEMPRE intentar detectar si es una pregunta sobre ventas/años, incluso sin OpenAI
    const isSalesQuestion = lowerMessage.includes("venta") || 
                           lowerMessage.includes("vendimos") || 
                           lowerMessage.includes("ventas") || 
                           lowerMessage.includes("operacion") || 
                           lowerMessage.includes("operaciones") ||
                           lowerMessage.includes("año") ||
                           lowerMessage.includes("year") ||
                           /\d{4}/.test(message)
    
    // SI NO HAY OPENAI API KEY, ERROR CLARO
    if (!openaiApiKey || openaiApiKey === "tu_openai_api_key_aqui" || openaiApiKey.trim() === "") {
      return NextResponse.json({ 
        error: "OpenAI API Key no configurada. El AI Copilot requiere OpenAI para funcionar correctamente. Por favor, configura OPENAI_API_KEY en las variables de entorno de Vercel." 
      }, { status: 500 })
    }
    
    // OpenAI API Key es OBLIGATORIA - si no está, ya retornamos error arriba

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    })

    // First, let OpenAI decide which tools to use
    const toolsPrompt = `Analiza la siguiente pregunta del usuario y determina qué herramientas necesitas usar.
    
Herramientas disponibles:
1. getSalesSummary(from?, to?, agencyId?) - Resumen de ventas
2. getDuePayments(date?, type?) - Pagos vencidos o próximos (type: "CUSTOMER" o "OPERATOR")
3. getSellerPerformance(sellerId, from?, to?) - Performance de un vendedor
4. getTopDestinations(from?, to?, limit?) - Top destinos
5. getOperatorBalances(onlyOverdue?) - Balances de operadores
6. getIVAStatus(year?, month?) - Estado de IVA para un período
7. getCashBalances() - Balances de todas las cuentas financieras
8. getFXStatus(days?) - Estado de ganancias/pérdidas cambiarias
9. getOverdueOperatorPayments() - Pagos a operadores vencidos
10. getOperationMargin(operationId) - Margen detallado de una operación

Pregunta del usuario: "${message}"

Responde SOLO con un JSON que indique qué herramientas usar y con qué parámetros. Ejemplo:
{
  "tools": [
    {"name": "getSalesSummary", "params": {"from": "2024-01-01", "to": "2024-01-31"}},
    {"name": "getDuePayments", "params": {}}
  ]
}

Si no necesitas ninguna herramienta, responde: {"tools": []}`

    let toolCalls: any[] = []

    try {
      const toolDecision = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Eres un asistente que decide qué herramientas usar. Responde SOLO con JSON válido, sin markdown, sin explicaciones.",
          },
          {
            role: "user",
            content: toolsPrompt,
          },
        ],
        temperature: 0.3,
      })

      const toolDecisionText = toolDecision.choices[0]?.message?.content || "{}"
      const cleanedText = cleanJsonString(toolDecisionText)

      try {
        const parsed = JSON.parse(cleanedText)
        toolCalls = parsed.tools || []
      } catch (e) {
        console.error("Error parsing tool decision:", e, "Text:", cleanedText)
        // Fallback a detección de keywords
        toolCalls = detectToolsFromMessage(message)
      }
    } catch (openaiError: any) {
      console.error("OpenAI API error:", openaiError)
      // Si OpenAI falla, usar fallback
      toolCalls = detectToolsFromMessage(message)
    }

    // Execute tools
    const toolResults: any = {}

    console.log(`[AI Copilot] Ejecutando ${toolCalls.length} herramienta(s):`, toolCalls.map(t => t.name))

    for (const toolCall of toolCalls) {
      try {
        console.log(`[AI Copilot] Ejecutando herramienta: ${toolCall.name}`, toolCall.params)
        switch (toolCall.name) {
          case "getSalesSummary":
            toolResults.salesSummary = await getSalesSummary(
              user,
              toolCall.params?.from,
              toolCall.params?.to,
              agencyId || toolCall.params?.agencyId,
            )
            break
          case "getDuePayments":
            toolResults.duePayments = await getDuePayments(
              user,
              toolCall.params?.date,
              toolCall.params?.type,
            )
            break
          case "getSellerPerformance":
            if (toolCall.params?.sellerId) {
              toolResults.sellerPerformance = await getSellerPerformance(
                user,
                toolCall.params.sellerId,
                toolCall.params?.from,
                toolCall.params?.to,
              )
            }
            break
          case "getTopDestinations":
            toolResults.topDestinations = await getTopDestinations(
              user,
              toolCall.params?.from,
              toolCall.params?.to,
              toolCall.params?.limit || 5,
            )
            break
          case "getOperatorBalances":
            toolResults.operatorBalances = await getOperatorBalances(
              user,
              toolCall.params?.onlyOverdue || false,
            )
            break
          case "getIVAStatus":
            toolResults.ivaStatus = await getIVAStatus(
              user,
              toolCall.params?.year,
              toolCall.params?.month,
            )
            break
          case "getCashBalances":
            toolResults.cashBalances = await getCashBalances(user)
            break
          case "getFXStatus":
            toolResults.fxStatus = await getFXStatus(
              user,
              toolCall.params?.days || 30,
            )
            break
          case "getOverdueOperatorPayments":
            toolResults.overdueOperatorPayments = await getOverdueOperatorPayments(user)
            break
          case "getOperationMargin":
            if (toolCall.params?.operationId) {
              toolResults.operationMargin = await getOperationMargin(
                user,
                toolCall.params.operationId,
              )
            }
            break
        }
        console.log(`[AI Copilot] Herramienta ${toolCall.name} completada exitosamente`)
      } catch (error) {
        console.error(`[AI Copilot] Error ejecutando herramienta ${toolCall.name}:`, error)
        // Agregar información del error a los resultados para que el AI sepa qué pasó
        toolResults[`${toolCall.name}_error`] = {
          error: error instanceof Error ? error.message : String(error),
          tool: toolCall.name,
        }
      }
    }

    console.log(`[AI Copilot] Resultados de herramientas:`, Object.keys(toolResults))

    // Format results for LLM
    const resultsText = JSON.stringify(toolResults, null, 2)
    
    console.log(`[AI Copilot] Datos a enviar al LLM (primeros 500 chars):`, resultsText.substring(0, 500))

    // Generate natural language response
    let response = "No pude procesar tu consulta."

    // Crear prompt detallado sobre la estructura de la base de datos
    const databaseSchemaPrompt = `
ESTRUCTURA DE LA BASE DE DATOS SUPABASE:

TABLA: operations (operaciones/ventas)
- Campos clave para ventas:
  * sale_amount_total: Monto total de la venta (NUMERIC)
  * margin_amount: Margen de ganancia (NUMERIC)
  * margin_percentage: Porcentaje de margen (NUMERIC)
  * operator_cost: Costo del operador (NUMERIC)
  * currency: Moneda (ARS, USD)
  * created_at: Fecha de creación (TIMESTAMP) - USA ESTE CAMPO PARA FILTRAR POR AÑO/MES
  * destination: Destino del viaje
  * status: Estado (PRE_RESERVATION, RESERVED, CONFIRMED, CANCELLED, TRAVELLED, CLOSED)
  * agency_id: ID de la agencia
  * seller_id: ID del vendedor

TABLA: payments (pagos)
- Campos clave:
  * amount: Monto del pago (NUMERIC)
  * date_due: Fecha de vencimiento (DATE)
  * date_paid: Fecha de pago (DATE, nullable)
  * status: Estado (PENDING, PAID, OVERDUE)
  * payer_type: Tipo de pagador (CUSTOMER, OPERATOR)
  * direction: Dirección (INCOME, EXPENSE)
  * operation_id: ID de la operación relacionada

TABLA: leads (prospectos)
- Campos clave:
  * status: Estado (NEW, IN_PROGRESS, QUOTED, WON, LOST)
  * destination: Destino
  * created_at: Fecha de creación
  * agency_id: ID de la agencia

INSTRUCCIONES PARA INTERPRETAR DATOS:
1. Para preguntas sobre VENTAS por AÑO:
   - Los datos vienen de la tabla "operations"
   - El campo "created_at" contiene la fecha - extrae el AÑO de ahí
   - Suma todos los "sale_amount_total" del año consultado
   - Cuenta las operaciones (operationsCount)
   - Calcula el margen total sumando "margin_amount"

2. Para preguntas sobre "año con más ventas":
   - Compara los totales de ventas (totalSales) de cada año
   - El año con mayor totalSales es el que tiene más ventas

3. Para preguntas sobre operaciones:
   - operationsCount = cantidad de operaciones
   - Cada operación tiene un sale_amount_total

4. Formato de respuesta:
   - Montos: $1.234.567,89 (formato argentino con punto para miles y coma para decimales)
   - Fechas: DD/MM/YYYY
   - Siempre incluye números exactos de la base de datos
   - Si no hay datos, di claramente "No hay datos registrados para [período]"

IMPORTANTE:
- Los datos que recibes YA fueron consultados de Supabase usando las herramientas
- NO necesitas consultar Supabase directamente, usa los datos que te proporcionan
- Los datos son REALES y vienen de la base de datos
- Si operationsCount es 0, significa que NO HAY operaciones en ese período
- Si totalSales es 0, significa que NO HAY ventas en ese período
`

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Eres un asistente de negocio experto para una agencia de viajes llamada MAXEVA GESTION. 
            
${databaseSchemaPrompt}

Tu trabajo es:
1. Analizar la pregunta del usuario
2. Interpretar los datos proporcionados (que YA fueron consultados de Supabase)
3. Dar una respuesta clara, precisa y profesional en español
4. SIEMPRE usar los números exactos de los datos proporcionados
5. Si los datos muestran 0 operaciones o 0 ventas, di claramente que no hay datos para ese período
6. Formatea montos en formato argentino: $1.234.567,89
7. El usuario tiene rol: ${user.role}

IMPORTANTE: Los datos que recibes son REALES y vienen directamente de Supabase. Si operationsCount es 0, significa que NO HAY operaciones registradas. Si totalSales es 0, significa que NO HAY ventas registradas.`,
          },
          {
            role: "user",
            content: `Pregunta del usuario: "${message}"

Datos obtenidos de Supabase (ya consultados):
${resultsText}

INSTRUCCIONES:
- Analiza los datos proporcionados
- Responde la pregunta usando los números EXACTOS de los datos
- Si operationsCount es 0, di que no hay operaciones registradas
- Si totalSales es 0, di que no hay ventas registradas
- Formatea los montos en formato argentino
- Sé específico y preciso con los números

Responde la pregunta del usuario:`,
          },
        ],
        temperature: 0.3, // Reducido para más precisión
      })

      response = completion.choices[0]?.message?.content || "No pude procesar tu consulta."
    } catch (openaiError: any) {
      console.error("OpenAI completion error:", openaiError)
      // Si falla la generación de respuesta, crear una respuesta básica con los datos
      if (Object.keys(toolResults).length > 0) {
        response = "Aquí tienes la información solicitada:\n\n"
        response += JSON.stringify(toolResults, null, 2)
      } else {
        response = "No pude obtener datos para responder tu consulta. Verifica que la API key de OpenAI esté configurada correctamente."
      }
    }

    return NextResponse.json({ response })
  } catch (error: any) {
    console.error("AI error:", error)
    const errorMessage =
      error?.message || "Error al procesar la consulta. Verifica la configuración de OpenAI."
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

