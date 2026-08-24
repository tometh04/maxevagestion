import { NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/cron/auth"
import { processNextQuotationConversionEffects } from "@/lib/quotations/conversion-effects"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const auth = checkCronAuth(request, "quotation-conversion-effects")
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized", reason: auth.reason }, { status: 401 })
  }

  try {
    const result = await processNextQuotationConversionEffects({
      supabase: createAdminClient(),
      limit: 20,
    })
    return NextResponse.json({ ok: result.processing === 0, ...result })
  } catch (error) {
    console.error("[cron:quotation-conversion-effects] processing failed", error)
    return NextResponse.json(
      { error: "No se pudo procesar el outbox de conversiones" },
      { status: 500 }
    )
  }
}
