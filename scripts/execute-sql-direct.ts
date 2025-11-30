import { readFileSync } from "fs"
import { join } from "path"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function executeSQL() {
  console.log("🔄 Ejecutando SQL de migración...")
  console.log("")
  
  const sqlPath = join(process.cwd(), "supabase/migrations/001_initial_schema.sql")
  const sql = readFileSync(sqlPath, "utf-8")
  
  // Supabase Management API endpoint
  const projectRef = supabaseUrl.split('//')[1].split('.')[0]
  const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`
  
  try {
    // Try using Management API
    const response = await fetch(managementUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: sql
      }),
    })
    
    if (response.ok) {
      const result = await response.json()
      console.log("✅ SQL ejecutado exitosamente!")
      console.log(result)
      return
    }
    
    const errorText = await response.text()
    console.log("⚠️  Management API no disponible, intentando método alternativo...")
    console.log("Error:", errorText.substring(0, 200))
  } catch (err: any) {
    console.log("⚠️  No se pudo usar Management API:", err.message)
  }
  
  // Alternative: Use PostgREST with a custom function
  // This won't work directly, so we'll provide instructions
  console.log("")
  console.log("📝 INSTRUCCIONES MANUALES:")
  console.log("")
  console.log("1. Abre este enlace en tu navegador:")
  console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new`)
  console.log("")
  console.log("2. Copia TODO este SQL y pégalo en el editor:")
  console.log("")
  console.log("─".repeat(60))
  console.log(sql)
  console.log("─".repeat(60))
  console.log("")
  console.log("3. Presiona Cmd+Enter (Mac) o Ctrl+Enter (Windows/Linux)")
  console.log("")
  console.log("4. Espera a ver 'Success' o 'Success. No rows returned'")
  console.log("")
  console.log("5. Luego ejecuta: npm run db:seed")
}

executeSQL().catch(console.error)
