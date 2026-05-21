#!/usr/bin/env tsx
/**
 * Provisioning de una integración Chatsell para un org/agencia.
 *
 * Genera:
 *   - webhook_token (32 bytes hex)
 *   - webhook_secret (32 bytes hex), encriptado con WEBHOOK_SECRET_ENCRYPTION_KEY
 *   - SQL para insertar el row en `org_integrations`
 *
 * Imprime el token + secret EN CLARO una sola vez (para mandar a Chatsell)
 * y el SQL para pegar en Supabase SQL Editor.
 *
 * Uso (desde root del repo):
 *   bun scripts/provision-chatsell-integration.ts <user_email> [agency_slug]
 *   # o
 *   npx tsx scripts/provision-chatsell-integration.ts <user_email> [agency_slug]
 *
 * Ejemplo (testing con mypupybox):
 *   bun scripts/provision-chatsell-integration.ts mypupybox@gmail.com
 *
 * Requiere .env.local con:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   WEBHOOK_SECRET_ENCRYPTION_KEY  (igual a la de prod)
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import crypto from "node:crypto"
import { encryptSecret } from "../lib/integrations/secrets"

dotenv.config({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}

const userEmail = process.argv[2]
const agencySlug = process.argv[3] // opcional

if (!userEmail) {
  console.error("Uso: tsx scripts/provision-chatsell-integration.ts <user_email> [agency_slug]")
  process.exit(1)
}

async function main() {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })

  // 1. Buscar user → org → agencies
  console.log(`📥 Buscando user ${userEmail}...`)
  const { data: user, error: userErr } = await (admin as any)
    .from("users")
    .select("id, name, email, org_id")
    .eq("email", userEmail)
    .single()

  if (userErr || !user) {
    console.error(`❌ User no encontrado: ${userErr?.message || "no rows"}`)
    process.exit(1)
  }
  if (!user.org_id) {
    console.error(`❌ User ${userEmail} no tiene org_id asociada`)
    process.exit(1)
  }
  console.log(`   → org_id: ${user.org_id}`)

  // 2. Buscar agencias del org
  const { data: agencies } = await (admin as any)
    .from("agencies")
    .select("id, name, slug")
    .eq("org_id", user.org_id)
    .order("name")

  if (!agencies || agencies.length === 0) {
    console.error(`❌ El org ${user.org_id} no tiene agencias`)
    process.exit(1)
  }

  // 3. Resolver agencia destino
  let targetAgency = agencies[0]
  if (agencySlug) {
    const found = agencies.find((a: any) => a.slug === agencySlug)
    if (!found) {
      console.error(
        `❌ Agencia con slug='${agencySlug}' no encontrada. Disponibles: ${agencies.map((a: any) => a.slug).join(", ")}`
      )
      process.exit(1)
    }
    targetAgency = found
  } else if (agencies.length > 1) {
    console.warn(
      `⚠️  El org tiene ${agencies.length} agencias. Usando la primera (${targetAgency.name}). Pasá agency_slug para elegir otra.`
    )
  }
  console.log(`   → agency: ${targetAgency.name} (${targetAgency.id})`)

  // 4. Generar credenciales
  const webhook_token = crypto.randomBytes(32).toString("hex")
  const webhook_secret_plain = crypto.randomBytes(32).toString("hex")
  let webhook_secret_encrypted: string
  try {
    webhook_secret_encrypted = encryptSecret(webhook_secret_plain)
  } catch (err: any) {
    console.error(`❌ Error encriptando secret: ${err.message}`)
    console.error(`   Asegurate de tener WEBHOOK_SECRET_ENCRYPTION_KEY en .env.local`)
    console.error(`   (la MISMA que usa Railway en prod, sino el secret no se va a poder desencriptar al verificar webhooks)`)
    process.exit(1)
  }

  // 5. Chequear si ya existe la integración (UNIQUE org_id+integration)
  const { data: existing } = await (admin as any)
    .from("org_integrations")
    .select("id, webhook_token, is_active")
    .eq("org_id", user.org_id)
    .eq("integration", "chatsell")
    .maybeSingle()

  if (existing) {
    console.warn(
      `⚠️  Ya existe una integración Chatsell para este org (id=${existing.id}). Voy a generar el SQL de UPDATE en lugar de INSERT.`
    )
  }

  // 6. Imprimir resultado
  console.log("\n" + "=".repeat(70))
  console.log("✅ CREDENCIALES GENERADAS (guardalas ahora — se muestran UNA SOLA VEZ)")
  console.log("=".repeat(70))
  console.log(`Webhook URL:    https://app.vibook.ai/api/integrations/chatsell/${webhook_token}/webhook`)
  console.log(`Webhook Token:  ${webhook_token}`)
  console.log(`Webhook Secret: ${webhook_secret_plain}`)
  console.log("=".repeat(70))

  console.log("\n📋 SQL para correr en Supabase SQL Editor:\n")

  if (existing) {
    console.log(`UPDATE org_integrations
SET webhook_token = '${webhook_token}',
    webhook_secret = '${webhook_secret_encrypted}',
    is_active = TRUE,
    config = '${JSON.stringify({ agency_id: targetAgency.id, auto_create_leads: true }).replace(/'/g, "''")}',
    updated_at = NOW()
WHERE id = '${existing.id}';`)
  } else {
    console.log(`INSERT INTO org_integrations (
  org_id, integration, webhook_token, webhook_secret, is_active, config
) VALUES (
  '${user.org_id}',
  'chatsell',
  '${webhook_token}',
  '${webhook_secret_encrypted}',
  TRUE,
  '${JSON.stringify({ agency_id: targetAgency.id, auto_create_leads: true }).replace(/'/g, "''")}'::jsonb
);`)
  }

  console.log("\n💡 Después de correr el SQL, podés probar con este curl:\n")
  console.log(`curl -X POST 'https://app.vibook.ai/api/integrations/chatsell/${webhook_token}/webhook' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "event_id": "test-'$(date +%s)'",
    "nombre": "Test Cliente",
    "telefono": "+5491111111111",
    "destino": "Cancún",
    "calidad": "caliente",
    "notas": "Test inicial desde curl"
  }'`)

  console.log("\n📨 Lo que le mandás a Chatsell:")
  console.log(`  URL:    https://app.vibook.ai/api/integrations/chatsell/${webhook_token}/webhook`)
  console.log(`  Secret: ${webhook_secret_plain}`)
  console.log(`  Header HMAC: x-chatsell-signature  (opcional pero recomendado)`)
}

main().catch((err) => {
  console.error("❌ Provisioning failed:", err)
  process.exit(1)
})
