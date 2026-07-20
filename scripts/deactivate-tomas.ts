/**
 * Desactiva y cierra sesión de tomas.sanchez04@gmail.com.
 *
 * Contexto de seguridad: cuenta sospechosa (ya removida de platform_admins).
 * NO borra la fila ni el auth user — preserva la evidencia/auditoría de lo que hizo.
 *
 * Acciones:
 *   1. users.is_active = false   → lib/auth.ts:76 lo redirige a /login en cada request.
 *   2. auth ban (ban_duration)   → invalida refresh tokens / bloquea re-login.
 *
 * Uso: npx tsx scripts/deactivate-tomas.ts
 */
import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { join } from "path"

dotenv.config({ path: join(process.cwd(), ".env.local") })

const TARGET_EMAIL = "tomas.sanchez04@gmail.com"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno de Supabase (.env.local)")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
  console.log(`🎯 Objetivo: ${TARGET_EMAIL}\n`)

  // 1. Buscar usuario
  const { data: user, error: fetchError } = await supabase
    .from("users")
    .select("id, auth_id, name, email, role, is_active, org_id")
    .eq("email", TARGET_EMAIL)
    .maybeSingle()

  if (fetchError) {
    console.error("❌ Error buscando usuario:", fetchError.message)
    process.exit(1)
  }
  if (!user) {
    console.error("❌ Usuario NO encontrado en tabla users. Nada que hacer.")
    process.exit(1)
  }

  console.log("👤 Estado actual:")
  console.log(`   id:       ${user.id}`)
  console.log(`   auth_id:  ${user.auth_id}`)
  console.log(`   nombre:   ${user.name}`)
  console.log(`   rol:      ${user.role}`)
  console.log(`   org_id:   ${user.org_id}`)
  console.log(`   activo:   ${user.is_active}\n`)

  // 2. Desactivar en tabla users
  if (user.is_active) {
    const { error: updErr } = await supabase
      .from("users")
      .update({ is_active: false })
      .eq("id", user.id)
    if (updErr) {
      console.error("❌ Error al desactivar en users:", updErr.message)
      process.exit(1)
    }
    console.log("✅ users.is_active = false (bloquea acceso en cada request)")
  } else {
    console.log("ℹ️  Ya estaba is_active=false, no se tocó users")
  }

  // 3. Ban en Supabase Auth (invalida sesiones / re-login)
  if (user.auth_id) {
    const { error: banErr } = await supabase.auth.admin.updateUserById(user.auth_id, {
      ban_duration: "876000h", // ~100 años
    })
    if (banErr) {
      console.error("⚠️  No se pudo banear en auth:", banErr.message)
      console.error("    (is_active=false igual bloquea el acceso a la app)")
    } else {
      console.log("✅ auth ban aplicado (refresh tokens invalidados, re-login bloqueado)")
    }
  } else {
    console.log("⚠️  Sin auth_id, no se pudo banear en auth (raro)")
  }

  console.log("\n🔒 Listo. Tomas queda sin acceso; su historial se conserva para auditoría.")
}

main().catch((e) => {
  console.error("❌ Error inesperado:", e)
  process.exit(1)
})
