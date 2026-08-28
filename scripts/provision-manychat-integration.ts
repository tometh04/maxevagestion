#!/usr/bin/env tsx
/**
 * Provisioning / rotacion del webhook por token de ManyChat (tambien lo usa
 * Agente Blanco, que habla el mismo payload).
 *
 * Por que existe: el endpoint legacy `/api/webhooks/manychat` usa una API key
 * GLOBAL y resuelve la agencia por `ilike` sobre el nombre, sin scope de org.
 * Cuando el nombre no matchea cae a un fallback "rosario" que puede meter el
 * lead en OTRO tenant. El endpoint por token resuelve la org desde
 * `org_integrations.webhook_token`, que es autoritativa, y ese modo de falla
 * desaparece.
 *
 * Genera:
 *   - webhook_token (32 bytes hex) -> va en la URL
 *   - webhook_secret (32 bytes hex) -> firma HMAC-SHA256 del body crudo
 *   - el SQL para insertar/rotar el row en `org_integrations`
 *
 * Imprime el token y el secret EN CLARO una sola vez. No escribe en la base:
 * deja el SQL listo para revisar y correr.
 *
 * Uso RECOMENDADO (inyecta las variables de prod sin escribirlas a disco):
 *   railway link --project "Vibook - Sistema de Gestion" --environment production
 *   railway run npx tsx scripts/provision-manychat-integration.ts <org_id | email>
 *
 * La clave de cifrado NUNCA tiene que quedar en un archivo local: con
 * `railway run` vive solo en el proceso. `dotenv` no pisa variables que ya
 * existen en el entorno, asi que lo que inyecta Railway gana sobre .env.local.
 *
 * Uso alternativo (requiere las tres variables en .env.local):
 *   npx tsx scripts/provision-manychat-integration.ts <org_id | email>
 *
 * Variables necesarias:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   WEBHOOK_SECRET_ENCRYPTION_KEY  (la MISMA que usa prod, si no el secret no
 *                                   se puede desencriptar al verificar la firma
 *                                   y el endpoint devuelve 500 en cada request)
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import crypto from "node:crypto"
import { encryptSecret } from "../lib/integrations/secrets"

dotenv.config({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai"

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}

const target = process.argv[2]
if (!target) {
  console.error("Uso: npx tsx scripts/provision-manychat-integration.ts <org_id | email_de_un_usuario>")
  process.exit(1)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function main() {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })

  // 1. Resolver la org (por id directo o por email de un usuario)
  let orgId: string
  if (UUID_RE.test(target)) {
    orgId = target
  } else {
    const { data: user } = await (admin as any)
      .from("users")
      .select("id, email, org_id")
      .eq("email", target)
      .maybeSingle()
    if (!user?.org_id) {
      console.error(`No encontre un usuario con email ${target}, o no tiene org_id`)
      process.exit(1)
    }
    orgId = user.org_id
  }

  const { data: org } = await (admin as any)
    .from("organizations")
    .select("id, name, crm_mode")
    .eq("id", orgId)
    .maybeSingle()

  if (!org) {
    console.error(`No existe la organizacion ${orgId}`)
    process.exit(1)
  }
  console.log(`Org: ${org.name} (${org.id}) crm_mode=${org.crm_mode}`)

  // 2. Agencias de la org. El body sigue mandando `agency`, pero ahora el match
  //    se hace SOLO dentro de esta org, y el fallback es la agencia mas antigua
  //    de la org (nunca un "rosario" global).
  const { data: agencies } = await (admin as any)
    .from("agencies")
    .select("id, name, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })

  if (!agencies?.length) {
    console.error(`La org ${orgId} no tiene agencias`)
    process.exit(1)
  }
  console.log(`Agencias (el valor de \`agency\` del payload matchea por nombre dentro de esta org):`)
  for (const a of agencies) {
    console.log(`   "${a.name}"  ag=${a.id}${a.id === agencies[0].id ? "   <- fallback si no matchea ninguna" : ""}`)
  }

  // 3. Credenciales
  const webhook_token = crypto.randomBytes(32).toString("hex")
  const webhook_secret_plain = crypto.randomBytes(32).toString("hex")
  let webhook_secret_encrypted: string
  try {
    webhook_secret_encrypted = encryptSecret(webhook_secret_plain)
  } catch (err: any) {
    console.error(`Error encriptando el secret: ${err.message}`)
    console.error("Falta WEBHOOK_SECRET_ENCRYPTION_KEY, o no es la de produccion.")
    console.error("Camino recomendado, sin dejar la clave en disco:")
    console.error('  railway link --project "Vibook - Sistema de Gestion" --environment production')
    console.error("  railway run npx tsx scripts/provision-manychat-integration.ts <org_id>")
    process.exit(1)
  }

  // 4. UNIQUE (org_id, integration): si ya existe, esto es una ROTACION
  const { data: existing } = await (admin as any)
    .from("org_integrations")
    .select("id, is_active")
    .eq("org_id", orgId)
    .eq("integration", "manychat")
    .maybeSingle()

  const url = `${APP_URL}/api/integrations/manychat/${webhook_token}/webhook`

  console.log("\n" + "=".repeat(72))
  console.log("CREDENCIALES (se muestran UNA SOLA VEZ)")
  console.log("=".repeat(72))
  console.log(`Webhook URL:    ${url}`)
  console.log(`Webhook Secret: ${webhook_secret_plain}`)
  console.log("=".repeat(72))

  console.log("\nSQL para revisar y correr:\n")
  if (existing) {
    console.log(`-- ROTACION: ya existia una integracion manychat para esta org.
-- El token viejo deja de funcionar apenas corras esto (404). Coordinar la
-- ventana con el integrador antes de rotar.
UPDATE org_integrations
SET webhook_token = '${webhook_token}',
    webhook_secret = '${webhook_secret_encrypted}',
    is_active = TRUE,
    updated_at = NOW()
WHERE id = '${existing.id}';`)
  } else {
    console.log(`INSERT INTO org_integrations (
  org_id, integration, webhook_token, webhook_secret, is_active
) VALUES (
  '${orgId}',
  'manychat',
  '${webhook_token}',
  '${webhook_secret_encrypted}',
  TRUE
);`)
  }

  // Pre-carga del smoke test de Agente Blanco. Su boton "Probar conexion" manda
  // SIEMPRE event_id = "agenteblanco-smoke-test" (constante, igual para todos
  // los clientes). Al existir la fila, el insert de idempotencia choca contra
  // UNIQUE (org_id, integration, event_id) y el endpoint corta con
  // 200 {"status":"duplicate"} ANTES de crear el lead: valida token, firma y
  // secreto sin ensuciar el tablero, y es repetible.
  // La unicidad es por org, asi que cada cliente necesita su propia fila.
  console.log(`
-- Pre-carga del smoke test (sin esto, "Probar conexion" CREA un lead real)
INSERT INTO webhook_event_log (org_id, integration, event_id, event_type, payload, result)
VALUES ('${orgId}', 'manychat', 'agenteblanco-smoke-test', 'lead', '{}'::jsonb, 'ignored')
ON CONFLICT (org_id, integration, event_id) DO NOTHING;`)

  console.log("\nSmoke test (firma el body crudo con HMAC-SHA256, digest hex):\n")
  console.log(`BODY='{"event_id":"agenteblanco-smoke-test","source":"agenteblanco","agency":"${agencies[0].name}"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac '${webhook_secret_plain}' -hex | sed 's/^.*= //')
curl -X POST '${url}' \
  -H 'Content-Type: application/json' \
  -H "x-vibook-signature: $SIG" \
  -d "$BODY"`)

  console.log(`
Notas para el integrador:
  - Header de firma: x-vibook-signature = HMAC-SHA256(body crudo, secret), hex.
    Se firma el body EXACTO que se manda; cualquier re-serializacion rompe la firma.
  - El payload es el MISMO que el del endpoint legacy. Se agrega \`event_id\`
    (opcional): es la clave de idempotencia. Si falta se usa \`manychat_user_id\`.
    Un event_id repetido devuelve 200 {"status":"duplicate"} sin reprocesar.
  - Un token por ORG. No mezclar clientes en un mismo token: la org sale del
    token y el \`agency\` del body solo elige entre las agencias de ESA org.
  - Respuestas: 201 creado, 200 actualizado, 401 firma invalida, 404 token
    desconocido o inactivo.
  - Smoke test con event_id "agenteblanco-smoke-test", una vez pre-cargada la
    fila de arriba: 200 {"status":"duplicate"} = token + firma + secreto OK y
    sin crear lead. 401 = firma o secreto mal. 404 = token mal.`)
}

main().catch((err) => {
  console.error("Provisioning failed:", err)
  process.exit(1)
})
