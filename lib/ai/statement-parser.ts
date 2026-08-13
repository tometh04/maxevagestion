import type OpenAI from "openai"
import { z } from "zod"
import { roundMoney } from "@/lib/currency"

/**
 * Parser de resúmenes de tarjeta de crédito (PDF → consumos).
 *
 * Produce DATOS CANDIDATOS para precargar el diálogo "Pago Tarjeta". NO escribe
 * contabilidad ni toma decisiones financieras: el usuario revisa y confirma con
 * el POST validado existente. (Regla .claude/rules/ai-cerebro.md: output de OCR
 * = dato no confiable, validado server-side.)
 *
 * Estrategia: los resúmenes AR casi siempre tienen capa de texto → se extrae el
 * texto con unpdf y se manda como TEXTO a gpt-4o (más confiable y barato que
 * visión, y multi-página trivial). Fallback a visión (render de páginas a PNG)
 * sólo si el PDF es un escaneo sin texto.
 */

const LLM_MODEL = "gpt-4o"
const MAX_VISION_PAGES = 10
const MIN_TEXT_LENGTH = 60 // menos que esto → asumimos escaneado, vamos a visión

export type StatementCurrency = "ARS" | "USD"

export interface StatementLineItem {
  description: string
  amount: number
  date: string // "YYYY-MM-DD" o ""
  currency: StatementCurrency
}

export interface ParseStatementResult {
  ocr_extracted: boolean
  ocr_error: string | null
  detected: {
    statement_date: string | null
    currencies: StatementCurrency[]
    totals_by_currency: Record<string, number>
  }
  items_by_currency: Record<string, StatementLineItem[]>
  warnings: string[]
  /** Sólo para logs/diagnóstico: "text" | "vision". */
  mode?: "text" | "vision"
}

// ---------------------------------------------------------------------------
// Normalización de números en formato argentino
// ---------------------------------------------------------------------------

/**
 * Normaliza un monto que puede venir como número o string en formato AR
 * ("2.951,19" → 2951.19). Devuelve el valor absoluto redondeado, o null si no
 * es parseable. Regla: si hay coma y punto, el ÚLTIMO separador es el decimal.
 */
export function normalizeARNumber(raw: number | string | null | undefined): number | null {
  if (raw == null) return null
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? roundMoney(Math.abs(raw)) : null
  }

  let s = String(raw).replace(/[^\d.,-]/g, "").trim()
  if (!s) return null

  const hasComma = s.includes(",")
  const hasDot = s.includes(".")

  if (hasComma && hasDot) {
    // El último separador es el decimal; el otro es separador de miles.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".")
    } else {
      s = s.replace(/,/g, "")
    }
  } else if (hasComma) {
    // Sólo coma → decimal AR.
    s = s.replace(",", ".")
  } else if (hasDot) {
    // Sólo puntos. Varios puntos = miles (1.234.567). Uno solo se deja como
    // decimal para no inflar montos x1000 en el caso ambiguo "2.951".
    if (s.split(".").length > 2) {
      s = s.replace(/\./g, "")
    }
  }

  const n = Number(s)
  return Number.isFinite(n) ? roundMoney(Math.abs(n)) : null
}

function normalizeCurrency(raw: unknown): StatementCurrency | null {
  const s = String(raw ?? "").trim().toLowerCase()
  if (!s) return null
  if (/(usd|u\$s|u\$d|d[oó]lar|dolar)/.test(s)) return "USD"
  if (/(ars|\$|peso)/.test(s)) return "ARS"
  return null
}

function normalizeDate(raw: unknown): string {
  const s = String(raw ?? "").trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return ""
}

// ---------------------------------------------------------------------------
// Extracción de texto / render de páginas (unpdf)
// ---------------------------------------------------------------------------

export async function extractStatementText(fileBuffer: ArrayBuffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf")
  const pdf = await getDocumentProxy(new Uint8Array(fileBuffer))
  const res: any = await extractText(pdf, { mergePages: true })
  const text = res?.text
  if (Array.isArray(text)) return text.join("\n")
  return typeof text === "string" ? text : ""
}

/**
 * Renderiza hasta MAX_VISION_PAGES páginas a PNG (data URLs) para el fallback de
 * visión. Reusa el mismo enfoque que renderPdfFirstPageToPng de purchase-invoices.
 */
export async function renderStatementPagesToPng(
  fileBuffer: ArrayBuffer
): Promise<{ images: string[]; truncated: boolean; totalPages: number }> {
  const { renderPageAsImage, getDocumentProxy } = await import("unpdf")
  const canvasMod = await import("@napi-rs/canvas")

  const pdf = await getDocumentProxy(new Uint8Array(fileBuffer))
  const totalPages = (pdf as any).numPages ?? 1
  const pagesToRender = Math.min(totalPages, MAX_VISION_PAGES)

  const images: string[] = []
  for (let page = 1; page <= pagesToRender; page++) {
    const ab = await renderPageAsImage(new Uint8Array(fileBuffer), page, {
      scale: 3,
      canvasImport: () => Promise.resolve(canvasMod),
    })
    images.push(`data:image/png;base64,${Buffer.from(ab).toString("base64")}`)
  }

  return { images, truncated: totalPages > pagesToRender, totalPages }
}

// ---------------------------------------------------------------------------
// Prompt + llamada al LLM
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Sos un experto en resúmenes (estados de cuenta) de tarjetas de crédito argentinas. Recibís el contenido de un resumen y tenés que devolver los CONSUMOS (cada línea de gasto) en JSON.

Devolvé SOLO JSON válido con este formato exacto:
{"statement_date":"YYYY-MM-DD"|null,"items":[{"description":string,"amount":number|string,"date":"YYYY-MM-DD"|"","currency":"ARS"|"USD"}]}

Reglas:
- Un item por cada consumo/compra. NO incluyas: saldo anterior, pagos recibidos, totales, subtotales, mínimos, límites, intereses acumulados ni líneas de resumen.
- amount: SIEMPRE positivo. Omití créditos/notas de crédito/devoluciones (montos negativos).
- Formato argentino de números: "2.951,19" significa 2951.19 (la coma es el decimal, los puntos son miles). Podés devolver el número como string tal cual aparece.
- currency: mirá la sección. "Consumos en pesos"/"$"/ARS → "ARS". "Consumos en dólares"/"U$S"/USD → "USD". NO asumas ARS por defecto: fijate en qué sección está cada consumo.
- date: la fecha del consumo en formato YYYY-MM-DD (convertí DD/MM/AA sin invertir día y mes). Si no la ves, "".
- description: el comercio/concepto, limpio y corto.
- NO inventes consumos ni montos. Si una línea es ilegible, omitila.`

async function callLLM(
  openai: OpenAI,
  userContent: any
): Promise<{ raw: string }> {
  const response = await openai.chat.completions.create({
    model: LLM_MODEL,
    temperature: 0.1,
    max_tokens: 4000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  })
  return { raw: response.choices[0]?.message?.content || "" }
}

// Schema laxo para la salida del modelo (amount puede venir number o string).
const modelOutputSchema = z.object({
  statement_date: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        description: z.string().optional(),
        amount: z.union([z.number(), z.string()]).optional(),
        date: z.union([z.string(), z.null()]).optional(),
        currency: z.string().optional(),
      })
    )
    .default([]),
})

// ---------------------------------------------------------------------------
// Orquestador
// ---------------------------------------------------------------------------

function emptyResult(error: string | null, warnings: string[] = []): ParseStatementResult {
  return {
    ocr_extracted: false,
    ocr_error: error,
    detected: { statement_date: null, currencies: [], totals_by_currency: {} },
    items_by_currency: {},
    warnings,
  }
}

/**
 * Punto de entrada: recibe el PDF y devuelve los consumos agrupados por moneda.
 * Nunca lanza por fallas de OCR (devuelve ocr_extracted:false + ocr_error).
 */
export async function parseStatement(fileBuffer: ArrayBuffer): Promise<ParseStatementResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return emptyResult(
      "El OCR no está configurado (falta la API key de OpenAI). Cargá el resumen a mano."
    )
  }

  const OpenAIClient = (await import("openai")).default
  const openai = new OpenAIClient({ apiKey })
  const warnings: string[] = []
  let mode: "text" | "vision" = "text"

  // 1. Intentar texto (más confiable/barato). Fallback a visión si no hay texto.
  let raw: string
  try {
    let text = ""
    try {
      text = await extractStatementText(fileBuffer)
    } catch (err) {
      console.error("[statement-parser] extractText failed:", err)
    }

    if (text.trim().length >= MIN_TEXT_LENGTH) {
      mode = "text"
      raw = (await callLLM(openai, `Contenido del resumen:\n\n${text}`)).raw
    } else {
      mode = "vision"
      const { images, truncated } = await renderStatementPagesToPng(fileBuffer)
      if (images.length === 0) {
        return emptyResult("No se pudo leer el PDF del resumen. Cargalo a mano.")
      }
      if (truncated) {
        warnings.push(
          `El resumen tiene más de ${MAX_VISION_PAGES} páginas; se leyeron las primeras ${MAX_VISION_PAGES}. Revisá que no falten consumos.`
        )
      }
      const content: any[] = [
        { type: "text", text: "Extraé los consumos de este resumen de tarjeta." },
        ...images.map((url) => ({ type: "image_url", image_url: { url, detail: "high" } })),
      ]
      raw = (await callLLM(openai, content)).raw
    }
  } catch (err: any) {
    console.error("[statement-parser] LLM call failed:", err)
    return emptyResult("No se pudo procesar el resumen con IA. Cargalo a mano.")
  }

  // 2. Parsear + validar la salida del modelo.
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    return emptyResult("La lectura del resumen no devolvió un resultado válido. Cargalo a mano.")
  }

  const modelResult = modelOutputSchema.safeParse(parsedJson)
  if (!modelResult.success) {
    return emptyResult("La lectura del resumen no tuvo el formato esperado. Cargalo a mano.")
  }

  // 3. Normalizar cada item; descartar (contar) los inválidos, nunca inventar.
  const items_by_currency: Record<string, StatementLineItem[]> = {}
  let dropped = 0

  for (const rawItem of modelResult.data.items) {
    const amount = normalizeARNumber(rawItem.amount ?? null)
    const currency = normalizeCurrency(rawItem.currency)
    const description = String(rawItem.description ?? "").trim().slice(0, 200)

    if (!amount || amount <= 0 || !currency || !description) {
      dropped++
      continue
    }

    const item: StatementLineItem = {
      description,
      amount,
      date: normalizeDate(rawItem.date),
      currency,
    }
    ;(items_by_currency[currency] ||= []).push(item)
  }

  if (dropped > 0) {
    warnings.push(`Se omitieron ${dropped} línea(s) que no se pudieron leer con claridad. Revisá el resumen.`)
  }

  const currencies = Object.keys(items_by_currency) as StatementCurrency[]
  if (currencies.length === 0) {
    return {
      ...emptyResult(null, warnings),
      ocr_extracted: true,
      ocr_error: null,
      mode,
    }
  }

  const totals_by_currency: Record<string, number> = {}
  for (const cur of currencies) {
    totals_by_currency[cur] = roundMoney(
      items_by_currency[cur].reduce((sum, it) => sum + it.amount, 0)
    )
  }

  if (currencies.length > 1) {
    warnings.push("Se detectaron consumos en más de una moneda. Registrá una moneda por vez.")
  }

  return {
    ocr_extracted: true,
    ocr_error: null,
    detected: {
      statement_date: normalizeDate(modelResult.data.statement_date) || null,
      currencies,
      totals_by_currency,
    },
    items_by_currency,
    warnings,
    mode,
  }
}
