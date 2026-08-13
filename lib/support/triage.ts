/**
 * Triage de tickets de soporte con IA.
 *
 * Recibe el tipo elegido por el usuario (pista fuerte) + texto libre y devuelve
 * la clasificación final: categoría, severidad técnica y prioridad de negocio.
 * Patrón copiado de lib/wha-control/classify-quotation.ts (gpt-4o-mini +
 * response_format json_object + JSON.parse defensivo con fallback seguro).
 *
 * Diseñado para correr SÍNCRONO dentro del POST del ticket. Si falla el LLM o
 * no está OPENAI_API_KEY, cae a un fallback derivado del tipo del usuario para
 * NO romper el submit.
 */

export type TicketCategory = "bug" | "improvement" | "question"
export type TicketSeverity = "low" | "medium" | "high" | "critical"
export type TicketPriority = "low" | "normal" | "high" | "urgent"

export type TicketClassification = {
  category: TicketCategory
  severity: TicketSeverity
  priority: TicketPriority
  rationale: string
  /** true si la clasificación salió del LLM; false si es fallback heurístico */
  ai: boolean
}

const LLM_MODEL = "gpt-4o-mini"

const VALID_CATEGORY: TicketCategory[] = ["bug", "improvement", "question"]
const VALID_SEVERITY: TicketSeverity[] = ["low", "medium", "high", "critical"]
const VALID_PRIORITY: TicketPriority[] = ["low", "normal", "high", "urgent"]

const SYSTEM_PROMPT = `Sos el triage de un sistema de tickets de una agencia de viajes que usa un ERP SaaS (vibook). Clasificás pedidos que cargan los usuarios desde la app.

Devolvés SOLO JSON válido en este formato exacto:
{"category": "bug|improvement|question", "severity": "low|medium|high|critical", "priority": "low|normal|high|urgent", "rationale": "<una línea breve en español>"}

Definiciones:
- category: "bug" = algo roto o que no funciona; "improvement" = pedido de mejora o nueva funcionalidad; "question" = duda de uso, no requiere código.
- severity: qué tan roto/impacto técnico. "critical" = bloquea trabajar o hay pérdida/error de datos/plata; "high" = falla importante con workaround; "medium" = molesto pero operable; "low" = menor/cosmético. Para question usá "low".
- priority: urgencia de negocio para el desarrollador. "urgent" = atender ya; "high" = pronto; "normal" = cola normal; "low" = cuando se pueda.
- rationale: una sola línea justificando la clasificación.

El usuario elige un tipo como pista. Respetalo salvo que el texto claramente indique otra cosa (ej: eligió "improvement" pero describe un error → corregí a "bug").`

function coerce<T>(value: unknown, valid: readonly T[], fallback: T): T {
  return valid.includes(value as T) ? (value as T) : fallback
}

/** Fallback sin LLM: deriva todo del tipo elegido por el usuario. */
function fallbackClassification(userType: TicketCategory): TicketClassification {
  return {
    category: userType,
    severity: userType === "bug" ? "medium" : "low",
    priority: "normal",
    rationale: "Clasificación por defecto (sin IA disponible).",
    ai: false,
  }
}

export async function classifyTicket(input: {
  subject: string
  description?: string | null
  userType: TicketCategory
  apiKey?: string
}): Promise<TicketClassification> {
  const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) {
    return fallbackClassification(input.userType)
  }

  try {
    // Import dinámico: la SDK de OpenAI solo se carga si realmente vamos a
    // llamar al LLM (evita cargar su runtime en el fallback / en tests).
    const { default: OpenAI } = await import("openai")
    const openai = new OpenAI({ apiKey })
    const userContent = [
      `Tipo elegido por el usuario: ${input.userType}`,
      `Asunto: ${input.subject}`,
      input.description ? `Descripción: ${input.description}` : "Descripción: (sin descripción)",
    ].join("\n")

    const completion = await openai.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 150,
    })

    const raw = completion.choices[0]?.message?.content || ""
    const parsed = JSON.parse(raw) as Partial<TicketClassification>

    return {
      category: coerce(parsed.category, VALID_CATEGORY, input.userType),
      severity: coerce(parsed.severity, VALID_SEVERITY, "medium"),
      priority: coerce(parsed.priority, VALID_PRIORITY, "normal"),
      rationale:
        typeof parsed.rationale === "string" && parsed.rationale.trim()
          ? parsed.rationale.trim().slice(0, 300)
          : "Sin justificación.",
      ai: true,
    }
  } catch (err) {
    console.error("[support/triage] classifyTicket falló, usando fallback:", err)
    return fallbackClassification(input.userType)
  }
}
