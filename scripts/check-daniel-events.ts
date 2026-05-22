/**
 * Inspecciona TODOS los eventos de Daniel y Marcela para entender qué opción del
 * menú eligieron y por qué no se detectó.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const orgId = "586bca09-029e-4cc9-8762-2ad01d468428"
  const targets = ["5492995189991", "5492616640330"] // Daniel, Marcela (sin + prefix)

  for (const phone of targets) {
    console.log(`\n=== Phone ${phone} ===`)
    const { data: events } = await admin
      .from("webhook_event_log")
      .select("id, event_type, payload, processed_at")
      .eq("org_id", orgId)
      .eq("integration", "callbell-in")
      .order("processed_at", { ascending: true })

    const matching = (events ?? []).filter((e: any) => {
      const p = e.payload
      const text = JSON.stringify(p)
      return text.includes(phone)
    })

    for (const e of matching as any[]) {
      const p = e.payload
      // Detectar from + text del shape Callbell
      const inner = p?.payload ?? p
      const from = inner?.from ?? p?.from ?? "?"
      const to = inner?.to ?? p?.to ?? "?"
      const text =
        inner?.text ??
        p?.text ??
        inner?.contact?.phoneNumber ??
        "(sin text)"
      const isFromClient =
        typeof from === "string" && !from.startsWith("5492617")
      console.log(
        `  ${e.processed_at?.slice(0, 19)} | ${e.event_type.padEnd(30)} | from=${from} ${isFromClient ? "[CLIENTE]" : "[BOT]"} | text="${typeof text === "string" ? text.slice(0, 80) : text}"`
      )
    }
  }
})()
