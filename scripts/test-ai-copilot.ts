/**
 * Script de prueba para el AI Copilot
 * 
 * Este script prueba el endpoint /api/ai con diferentes consultas
 */

import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"

config({ path: ".env.local" })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno de Supabase")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testAICopilot() {
  console.log("🧪 Probando AI Copilot...\n")

  // Obtener un usuario de prueba
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, email, role")
    .limit(1)

  if (usersError || !users || users.length === 0) {
    console.error("❌ No se encontraron usuarios en la base de datos")
    process.exit(1)
  }

  const testUser = users[0]
  console.log(`✅ Usuario de prueba: ${testUser.email} (${testUser.role})\n`)

  // Obtener una agencia
  const { data: agencies } = await supabase
    .from("agencies")
    .select("id")
    .limit(1)

  const agencyId = agencies && agencies.length > 0 ? agencies[0].id : undefined

  // Consultas de prueba
  const testQueries = [
    "¿Cuánto vendimos este mes?",
    "¿Qué pagos están vencidos?",
    "¿Cuál es el balance de los operadores?",
  ]

  console.log("📝 Ejecutando consultas de prueba...\n")

  for (const query of testQueries) {
    console.log(`\n🔹 Consulta: "${query}"`)
    console.log("─".repeat(50))

    try {
      // Simular una petición al endpoint
      // Nota: Esto requiere que el servidor esté corriendo
      const response = await fetch("http://localhost:3044/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // En producción necesitarías un token de autenticación real
        },
        body: JSON.stringify({
          message: query,
          agencyId: agencyId,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Error ${response.status}: ${errorText}`)
        continue
      }

      const data = await response.json()

      if (data.error) {
        console.error(`❌ Error: ${data.error}`)
      } else {
        console.log(`✅ Respuesta:\n${data.response}\n`)
      }
    } catch (error: any) {
      console.error(`❌ Error al hacer la petición: ${error.message}`)
      console.log("\n💡 Asegúrate de que el servidor esté corriendo en el puerto 3044")
    }
  }

  console.log("\n✅ Pruebas completadas")
}

testAICopilot().catch(console.error)

