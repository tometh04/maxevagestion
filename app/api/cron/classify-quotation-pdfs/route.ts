import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { classifyPdf } from "@/lib/wha-control/classify-quotation"

const BATCH_LIMIT = 200
const LOOKBACK_DAYS = 30

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 })
  }

  const supabase = createAdminClient() as any
  const since = new Date()
  since.setDate(since.getDate() - LOOKBACK_DAYS)
  const sinceIso = since.toISOString()

  const { data: rows, error } = await supabase
    .from("wa_messages")
    .select("id, media_file_name")
    .eq("message_type", "document")
    .eq("direction", "outbound")
    .is("is_quotation", null)
    .gte("sent_at", sinceIso)
    .order("sent_at", { ascending: false })
    .limit(BATCH_LIMIT)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const stats = { processed: 0, llm_calls: 0, heuristic_positive: 0, heuristic_negative: 0, errors: 0 }

  for (const row of (rows || []) as Array<{ id: string; media_file_name: string | null }>) {
    try {
      const result = await classifyPdf(row.media_file_name, openaiKey)
      if (result.source === "llm" || result.source === "llm_low_confidence") stats.llm_calls++
      if (result.source === "heuristic_positive") stats.heuristic_positive++
      if (result.source === "heuristic_negative") stats.heuristic_negative++

      const { error: updError } = await supabase
        .from("wa_messages")
        .update({ is_quotation: result.is_quotation })
        .eq("id", row.id)
      if (updError) {
        stats.errors++
        console.warn(`[classify-quotation-pdfs] update failed for ${row.id}:`, updError.message)
      } else {
        stats.processed++
      }
    } catch (err: any) {
      stats.errors++
      console.warn(`[classify-quotation-pdfs] classify failed for ${row.id}:`, err?.message)
    }
  }

  return NextResponse.json({ ok: true, stats, batch_size: rows?.length || 0 })
}

export async function POST(request: Request) {
  return GET(request)
}
