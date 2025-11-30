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
import {
  getSalesThisWeek,
  getTopSellers,
  getMonthComparison,
  getNegativeMarginOperations,
  getSalesByChannel,
  getConversionRate,
  getCustomerDuePaymentsToday,
  getOperationsWithPendingPaymentBeforeTravel,
  getOperationsTravelingThisWeek,
  getMyCommissions,
  getFinancialHealth,
  getSharedCommissions,
  getMarginByProductType,
  getOperatorPaymentsDueThisWeek,
  getOperationsWithPendingHotelPayment,
  getSellerProfitability,
  getMonthSummary,
} from "@/lib/ai/tools-extended"
import { withRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { validateRequest, aiCopilotSchema } from "@/lib/validation"
import { createAuditLog, getRequestMetadata } from "@/lib/audit-log"
import { createServerClient } from "@/lib/supabase/server"

// Helper para limpiar JSON de markdown
function cleanJsonString(jsonString: string): string {
  if (!jsonString) return "{}"
  let cleaned = jsonString.trim()
  if (cleaned.startsWith("```json")) cleaned = cleaned.substring(7)
  if (cleaned.startsWith("```")) cleaned = cleaned.substring(3)
  if (cleaned.endsWith("```")) cleaned = cleaned.substring(0, cleaned.length - 3)
  return cleaned.trim()
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

    // Calcular fechas
    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonth = today.getMonth() + 1
    const currentDay = today.getDate()
    
    const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const lastMonthLastDay = new Date(today.getFullYear(), today.getMonth(), 0)
    const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`
    const lastMonthEnd = `${lastMonthLastDay.getFullYear()}-${String(lastMonthLastDay.getMonth() + 1).padStart(2, '0')}-${String(lastMonthLastDay.getDate()).padStart(2, '0')}`
    
    const currentMonthStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
    const currentMonthEnd = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`

    // Prompt mejorado para decidir herramientas
    const toolsPrompt = `Eres un asistente de una agencia de viajes argentina. Analiza la pregunta y determina qué herramientas usar.

FECHA HOY: ${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}
MES PASADO: ${lastMonthStart} a ${lastMonthEnd}
MES ACTUAL (hasta hoy): ${currentMonthStart} a ${currentMonthEnd}

HERRAMIENTAS DISPONIBLES:

📊 VENTAS Y RENDIMIENTO:
1. getSalesSummary(from?, to?, agencyId?) - Resumen de ventas (total, margen, operaciones)
2. getSalesThisWeek() - Ventas de esta semana
3. getMonthSummary() - Resumen del mes actual
4. getTopSellers(from?, to?, limit?) - Top vendedores por ventas
5. getSellerProfitability(from?, to?) - Rentabilidad promedio por vendedor
6. getMonthComparison() - Comparar mes actual vs mes pasado a la misma fecha
7. getTopDestinations(from?, to?, limit?) - Destinos más vendidos
8. getMarginByProductType(from?, to?) - Margen por tipo de producto (aéreos, hoteles, paquetes)
9. getNegativeMarginOperations() - Operaciones con margen negativo
10. getSalesByChannel(from?, to?) - Ventas por canal (Instagram, WhatsApp, etc.)
11. getConversionRate(from?, to?) - Tasa de conversión de lead a venta
12. getSellerPerformance(sellerId, from?, to?) - Performance de un vendedor específico

💰 PAGOS Y COBRANZAS:
13. getDuePayments(date?, type?) - Pagos vencidos (type: "CUSTOMER" o "OPERATOR")
14. getCustomerDuePaymentsToday() - Clientes con pagos vencidos HOY
15. getOperatorPaymentsDueThisWeek() - Pagos a operadores vencidos esta semana
16. getOperationsWithPendingPaymentBeforeTravel() - Operaciones con cobro pendiente antes del viaje
17. getOperationsWithPendingHotelPayment(days?) - Operaciones con hotelería pendiente de pago (próximos X días)

📈 CONTABILIDAD:
18. getIVAStatus(year?, month?) - Estado de IVA (débito fiscal, crédito fiscal, a pagar)
19. getCashBalances() - Saldos de caja (ARS, USD, MP, bancos)
20. getFXStatus(days?) - Ganancias/pérdidas por tipo de cambio
21. getOperatorBalances(onlyOverdue?) - Balances de operadores
22. getOverdueOperatorPayments() - Pagos vencidos a operadores
23. getOperationMargin(operationId) - Margen detallado de una operación

🧳 OPERACIONES:
24. getOperationsTravelingThisWeek() - Operaciones que viajan esta semana

💵 COMISIONES:
25. getMyCommissions(from?, to?) - Mis comisiones del período
26. getSharedCommissions(from?, to?) - Comisiones compartidas entre vendedores

🏥 SALUD GENERAL:
27. getFinancialHealth() - Resumen completo de salud financiera

INSTRUCCIONES DE MAPEO:
- "¿cuánto vendimos esta semana?" → getSalesThisWeek
- "¿cuánto llevamos vendido este mes?" → getMonthSummary
- "¿qué vendedor vendió más?" → getTopSellers
- "¿cuál es el margen total?" → getSalesSummary o getMonthSummary
- "¿cómo estamos vs el mes pasado?" → getMonthComparison
- "¿cuáles destinos fueron los más vendidos?" → getTopDestinations
- "¿qué productos tienen mejor margen?" → getMarginByProductType
- "operaciones con margen negativo" → getNegativeMarginOperations
- "¿cuántas por Instagram/WhatsApp?" → getSalesByChannel
- "tasa de conversión" → getConversionRate
- "¿qué clientes tienen pagos vencidos hoy?" → getCustomerDuePaymentsToday
- "¿qué operadores tienen pagos vencidos?" → getOverdueOperatorPayments o getOperatorPaymentsDueThisWeek
- "operaciones con cobro pendiente antes del viaje" → getOperationsWithPendingPaymentBeforeTravel
- "¿cuánto tengo que pagar de IVA?" → getIVAStatus
- "saldo de caja" → getCashBalances
- "diferencias de tipo de cambio" → getFXStatus
- "pagos a proveedores próximos 7 días" → getOperatorPaymentsDueThisWeek
- "operaciones que viajan esta semana" → getOperationsTravelingThisWeek
- "hotelería pendiente de pago" → getOperationsWithPendingHotelPayment
- "mi comisión" → getMyCommissions
- "comisiones compartidas" → getSharedCommissions
- "salud financiera" → getFinancialHealth
- "rentabilidad por vendedor" → getSellerProfitability

Pregunta del usuario: "${message}"

Responde ÚNICAMENTE con JSON válido (sin markdown):
{"tools": [{"name": "nombreHerramienta", "params": {...}}]}`

    let toolCalls: any[] = []

    try {
      const toolDecision = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Responde SOLO con JSON válido, sin markdown ni explicaciones." },
          { role: "user", content: toolsPrompt },
        ],
        temperature: 0.1,
      })

      const toolDecisionText = toolDecision.choices[0]?.message?.content || "{}"
      const cleanedText = cleanJsonString(toolDecisionText)
      console.log(`[AI] Herramientas decididas:`, cleanedText.substring(0, 500))

      try {
        const parsed = JSON.parse(cleanedText)
        toolCalls = parsed.tools || []
      } catch (e) {
        console.error("[AI] Error parsing tools:", e)
      }
    } catch (openaiError: any) {
      console.error("[AI] OpenAI error:", openaiError)
    }

    // Ejecutar herramientas
    const toolResults: any = {}
    console.log(`[AI] Ejecutando ${toolCalls.length} herramientas:`, toolCalls.map((t: any) => t.name))

    for (const toolCall of toolCalls) {
      try {
        const p = toolCall.params || {}
        switch (toolCall.name) {
          case "getSalesSummary":
            toolResults.salesSummary = await getSalesSummary(user, p.from, p.to, agencyId || p.agencyId)
            break
          case "getSalesThisWeek":
            toolResults.salesThisWeek = await getSalesThisWeek(user, agencyId)
            break
          case "getMonthSummary":
            toolResults.monthSummary = await getMonthSummary(user, agencyId)
            break
          case "getTopSellers":
            toolResults.topSellers = await getTopSellers(user, p.from, p.to, p.limit || 5)
            break
          case "getSellerProfitability":
            toolResults.sellerProfitability = await getSellerProfitability(user, p.from, p.to)
            break
          case "getMonthComparison":
            toolResults.monthComparison = await getMonthComparison(user, agencyId)
            break
          case "getDuePayments":
            toolResults.duePayments = await getDuePayments(user, p.date, p.type)
            break
          case "getCustomerDuePaymentsToday":
            toolResults.customerDuePaymentsToday = await getCustomerDuePaymentsToday(user)
            break
          case "getOperatorPaymentsDueThisWeek":
            toolResults.operatorPaymentsDueThisWeek = await getOperatorPaymentsDueThisWeek(user)
            break
          case "getSellerPerformance":
            if (p.sellerId) toolResults.sellerPerformance = await getSellerPerformance(user, p.sellerId, p.from, p.to)
            break
          case "getTopDestinations":
            toolResults.topDestinations = await getTopDestinations(user, p.from, p.to, p.limit || 5)
            break
          case "getMarginByProductType":
            toolResults.marginByProductType = await getMarginByProductType(user, p.from, p.to)
            break
          case "getOperatorBalances":
            toolResults.operatorBalances = await getOperatorBalances(user, p.onlyOverdue || false)
            break
          case "getIVAStatus":
            toolResults.ivaStatus = await getIVAStatus(user, p.year, p.month)
            break
          case "getCashBalances":
            toolResults.cashBalances = await getCashBalances(user)
            break
          case "getFXStatus":
            toolResults.fxStatus = await getFXStatus(user, p.days || 30)
            break
          case "getOverdueOperatorPayments":
            toolResults.overdueOperatorPayments = await getOverdueOperatorPayments(user)
            break
          case "getOperationMargin":
            if (p.operationId) toolResults.operationMargin = await getOperationMargin(user, p.operationId)
            break
          case "getNegativeMarginOperations":
            toolResults.negativeMarginOperations = await getNegativeMarginOperations(user, agencyId)
            break
          case "getSalesByChannel":
            toolResults.salesByChannel = await getSalesByChannel(user, p.from, p.to)
            break
          case "getConversionRate":
            toolResults.conversionRate = await getConversionRate(user, p.from, p.to)
            break
          case "getOperationsWithPendingPaymentBeforeTravel":
            toolResults.pendingBeforeTravel = await getOperationsWithPendingPaymentBeforeTravel(user)
            break
          case "getOperationsWithPendingHotelPayment":
            toolResults.pendingHotelPayment = await getOperationsWithPendingHotelPayment(user, p.days || 30)
            break
          case "getOperationsTravelingThisWeek":
            toolResults.travelingThisWeek = await getOperationsTravelingThisWeek(user)
            break
          case "getMyCommissions":
            toolResults.myCommissions = await getMyCommissions(user, p.from, p.to)
            break
          case "getFinancialHealth":
            toolResults.financialHealth = await getFinancialHealth(user)
            break
          case "getSharedCommissions":
            toolResults.sharedCommissions = await getSharedCommissions(user, p.from, p.to)
            break
        }
        console.log(`[AI] ✅ ${toolCall.name} completado`)
      } catch (error) {
        console.error(`[AI] ❌ Error en ${toolCall.name}:`, error)
        toolResults[`${toolCall.name}_error`] = { error: String(error) }
      }
    }

    const resultsText = JSON.stringify(toolResults, null, 2)
    console.log(`[AI] Resultados (preview):`, resultsText.substring(0, 500))

    // Generar respuesta
    let response = "No pude procesar tu consulta."

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Eres el asistente ejecutivo de MAXEVA GESTION, una agencia de viajes argentina con sede en Rosario y Madero.

CONTEXTO DEL NEGOCIO:
- Vendemos paquetes turísticos, aéreos, hoteles y servicios de viaje
- Trabajamos con operadores mayoristas
- Cobramos a clientes y pagamos a operadores
- Ganamos por el margen entre precio de venta y costo del operador
- Manejamos ARS y USD

FORMATO DE RESPUESTA:
1. Responde siempre en español argentino
2. Montos en formato argentino: $1.234.567,89 (punto para miles, coma para decimales)
3. Fechas en formato DD/MM/YYYY
4. Sé conciso pero completo
5. Usa emojis para destacar información importante:
   - 📈 para datos positivos
   - 📉 para datos negativos
   - ⚠️ para alertas
   - 💰 para montos
   - 📊 para estadísticas
6. Si hay riesgos o alertas, menciónalos claramente
7. Si no hay datos suficientes, dilo honestamente
8. Incluye números exactos de los datos

USUARIO ACTUAL:
- Rol: ${user.role}
- Puede ver datos según su nivel de acceso

Los datos que recibes son REALES de la base de datos Supabase de producción.`,
          },
          {
            role: "user",
            content: `Pregunta: "${message}"

Datos consultados de la base de datos:
${resultsText}

Responde la pregunta de forma clara y profesional usando estos datos:`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      })

      response = completion.choices[0]?.message?.content || "No pude procesar tu consulta."
    } catch (openaiError: any) {
      console.error("[AI] Error generando respuesta:", openaiError)
      if (Object.keys(toolResults).length > 0) {
        response = "Aquí tienes los datos:\n\n" + JSON.stringify(toolResults, null, 2)
      }
    }

    return NextResponse.json({ response })
  } catch (error: any) {
    console.error("[AI] Error general:", error)
    return NextResponse.json({ error: error?.message || "Error al procesar la consulta" }, { status: 500 })
  }
}
