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

    // Validar API key de OpenAI
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
    
    if (!openaiApiKey || openaiApiKey === "tu_openai_api_key_aqui" || openaiApiKey.trim() === "") {
      // Fallback: usar detección de keywords
      console.log("⚠️ OpenAI API key no configurada, usando fallback")
      let toolCalls = detectToolsFromMessage(message)
      
      // Si es pregunta sobre ventas/años pero no detectó herramientas, forzar consulta
      if (isSalesQuestion && toolCalls.length === 0) {
        const yearMatch = lowerMessage.match(/(?:año|year)?\s*(\d{4})/)
        const detectedYear = yearMatch ? parseInt(yearMatch[1]) : null
        
        if (detectedYear) {
          toolCalls.push({
            name: "getSalesSummary",
            params: {
              from: `${detectedYear}-01-01`,
              to: `${detectedYear}-12-31`,
            },
          })
        } else if (lowerMessage.includes("año con más") || lowerMessage.includes("mejor año") || lowerMessage.includes("más ventas")) {
          // Si pregunta sobre el año con más ventas, consultar todos los años
          const currentYear = new Date().getFullYear()
          for (let year = currentYear; year >= currentYear - 5; year--) {
            toolCalls.push({
              name: "getSalesSummary",
              params: {
                from: `${year}-01-01`,
                to: `${year}-12-31`,
              },
            })
          }
        } else {
          // Por defecto, consultar mes actual
          const today = new Date()
          const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
          toolCalls.push({
            name: "getSalesSummary",
            params: {
              from: firstDay.toISOString().split("T")[0],
              to: today.toISOString().split("T")[0],
            },
          })
        }
      }
      
      const toolResults: any = {}

      for (const toolCall of toolCalls) {
        try {
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
          }
        } catch (error) {
          console.error(`Error executing tool ${toolCall.name}:`, error)
        }
      }

      // Generar respuesta básica sin OpenAI
      const resultsText = JSON.stringify(toolResults, null, 2)
      let response = "Aquí tienes la información solicitada:\n\n"

      if (toolResults.salesSummary) {
        response += `**Ventas:**\n`
        response += `- Total: $${toolResults.salesSummary.totalSales.toLocaleString("es-AR")}\n`
        response += `- Margen: $${toolResults.salesSummary.totalMargin.toLocaleString("es-AR")}\n`
        response += `- Operaciones: ${toolResults.salesSummary.operationsCount}\n\n`
      }

      if (toolResults.duePayments && toolResults.duePayments.length > 0) {
        response += `**Pagos pendientes:** ${toolResults.duePayments.length}\n\n`
      }

      if (toolResults.operatorBalances && toolResults.operatorBalances.length > 0) {
        response += `**Balances de operadores:** ${toolResults.operatorBalances.length}\n\n`
      }

      if (toolResults.ivaStatus) {
        response += `**IVA:** $${toolResults.ivaStatus.iva_to_pay?.toLocaleString("es-AR") || 0}\n\n`
      }

      if (toolResults.cashBalances && toolResults.cashBalances.length > 0) {
        response += `**Cuentas financieras:** ${toolResults.cashBalances.length}\n\n`
      }

      if (Object.keys(toolResults).length === 0 && isSalesQuestion) {
        // Si no detectó herramientas pero pregunta sobre ventas/años, intentar consultar todos los años disponibles
        if (lowerMessage.includes("venta") || lowerMessage.includes("año") || lowerMessage.match(/\d{4}/)) {
          // Consultar ventas de los últimos años para encontrar el año con más ventas
          const currentYear = new Date().getFullYear()
          const yearsToCheck = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4, currentYear - 5]
          
          const yearResults: any[] = []
          for (const year of yearsToCheck) {
            try {
              const yearSummary = await getSalesSummary(
                user,
                `${year}-01-01`,
                `${year}-12-31`,
                agencyId
              )
              if (yearSummary.operationsCount > 0) {
                yearResults.push({ year, ...yearSummary })
              }
            } catch (error) {
              console.error(`Error getting sales for year ${year}:`, error)
            }
          }

          if (yearResults.length > 0) {
            const bestYear = yearResults.reduce((best, current) => 
              current.totalSales > best.totalSales ? current : best
            )
            response = `**Año con más ventas:** ${bestYear.year}\n\n`
            response += `**Ventas en ${bestYear.year}:**\n`
            response += `- Total: $${bestYear.totalSales.toLocaleString("es-AR")}\n`
            response += `- Operaciones: ${bestYear.operationsCount}\n`
            response += `- Margen: $${bestYear.totalMargin.toLocaleString("es-AR")}\n\n`
            response += `**Resumen de todos los años:**\n`
            yearResults.forEach((yr) => {
              response += `- ${yr.year}: $${yr.totalSales.toLocaleString("es-AR")} (${yr.operationsCount} operaciones)\n`
            })
          } else {
            response = "No encontré ventas registradas en los últimos años. Verifica que haya operaciones en la base de datos."
          }
        } else {
          response =
            "No pude identificar qué información necesitas. Por favor, configura la API key de OpenAI en las variables de entorno para usar el asistente completo."
        }
      }

      return NextResponse.json({ response })
    }

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

    for (const toolCall of toolCalls) {
      try {
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
      } catch (error) {
        console.error(`Error executing tool ${toolCall.name}:`, error)
      }
    }

    // Format results for LLM
    const resultsText = JSON.stringify(toolResults, null, 2)

    // Generate natural language response
    let response = "No pude procesar tu consulta."

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Eres un asistente de negocio para una agencia de viajes. Responde preguntas sobre ventas, pagos, operaciones y métricas del negocio.
          El usuario tiene rol: ${user.role}.
          Responde en español de manera clara, concisa y profesional.
          Usa los datos proporcionados para dar respuestas precisas.
          Si hay datos numéricos, formatea los montos con formato de moneda (ej: $1.234,56).
          Puedes sugerir navegar a páginas específicas si es relevante.`,
          },
          {
            role: "user",
            content: `Pregunta: ${message}\n\nDatos obtenidos:\n${resultsText}\n\nResponde la pregunta del usuario usando estos datos.`,
          },
        ],
        temperature: 0.7,
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

