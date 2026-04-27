export type ClassificationSource =
  | "heuristic_positive"
  | "heuristic_negative"
  | "llm"
  | "llm_low_confidence"

export type ClassificationResult = {
  is_quotation: boolean
  source: ClassificationSource
  confidence?: number
}

const POSITIVE_RX = /\b(cotiz|presupuesto|quotation|propuesta|cot[-_])/i
const NEGATIVE_RX = /\b(factura|invoice|voucher|recibo|receipt|comprobante|asistencia|seguro|itiner|boleto|ticket|pasaporte|dni|cartilla)/i

export function classifyByFilename(filename: string | null): ClassificationResult | null {
  if (!filename) return null
  if (POSITIVE_RX.test(filename)) {
    return { is_quotation: true, source: "heuristic_positive" }
  }
  if (NEGATIVE_RX.test(filename)) {
    return { is_quotation: false, source: "heuristic_negative" }
  }
  return null
}

import OpenAI from "openai"

const LLM_MODEL = "gpt-4o-mini"
const CONFIDENCE_THRESHOLD = 0.7

const SYSTEM_PROMPT = `Clasificás nombres de archivos PDF enviados por una agencia de viajes argentina por WhatsApp. Tu tarea es decidir si el filename sugiere que es una COTIZACIÓN/PRESUPUESTO de viaje (true) o cualquier otro tipo de documento — facturas, vouchers, asistencias, comprobantes, DNIs, pasaportes, itinerarios — (false).

Respondé SOLO con JSON válido en formato exacto:
{"is_quotation": boolean, "confidence": number}

confidence es de 0 a 1. Si el filename es ambiguo o genérico ("documento.pdf", "scan001.pdf"), confidence debe ser baja (<0.5).`

export async function classifyByLLM(
  filename: string,
  apiKey: string,
): Promise<ClassificationResult> {
  const openai = new OpenAI({ apiKey })
  const completion = await openai.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Filename: ${filename}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 50,
  })

  const raw = completion.choices[0]?.message?.content || ""
  let parsed: { is_quotation?: boolean; confidence?: number }
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { is_quotation: false, source: "llm_low_confidence", confidence: 0 }
  }

  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0
  const isQuot = !!parsed.is_quotation

  if (confidence < CONFIDENCE_THRESHOLD) {
    return { is_quotation: false, source: "llm_low_confidence", confidence }
  }
  return { is_quotation: isQuot, source: "llm", confidence }
}

export async function classifyPdf(
  filename: string | null,
  apiKey: string,
): Promise<ClassificationResult> {
  if (!filename) {
    return { is_quotation: false, source: "llm_low_confidence", confidence: 0 }
  }
  const heuristic = classifyByFilename(filename)
  if (heuristic) return heuristic
  return classifyByLLM(filename, apiKey)
}
