import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function verifyTables() {
  console.log("🔍 Verificando tablas en la base de datos...")
  console.log("")
  
  const tables = [
    'users',
    'agencies',
    'user_agencies',
    'operators',
    'customers',
    'leads',
    'operations',
    'payments',
    'cash_movements',
    'commission_rules',
    'documents',
    'alerts',
    'settings_trello'
  ]
  
  const results: { table: string; exists: boolean; error?: string }[] = []
  
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('id').limit(1)
      
      if (error) {
        if (error.code === 'PGRST205') {
          results.push({ table, exists: false, error: 'Tabla no existe' })
        } else {
          results.push({ table, exists: true, error: error.message })
        }
      } else {
        results.push({ table, exists: true })
      }
    } catch (err: any) {
      results.push({ table, exists: false, error: err.message })
    }
  }
  
  console.log("📊 Resultados:")
  console.log("─".repeat(60))
  
  const missing = results.filter(r => !r.exists)
  const existing = results.filter(r => r.exists)
  
  if (existing.length > 0) {
    console.log("\n✅ Tablas existentes:")
    existing.forEach(r => console.log(`   ✓ ${r.table}`))
  }
  
  if (missing.length > 0) {
    console.log("\n❌ Tablas faltantes:")
    missing.forEach(r => {
      console.log(`   ✗ ${r.table}`)
      if (r.error) console.log(`     Error: ${r.error}`)
    })
    
    console.log("")
    console.log("📝 Para crear las tablas faltantes:")
    console.log("1. Ve a: https://supabase.com/dashboard/project/pmqvplyyxiobkllapgjp/sql/new")
    console.log("2. Copia el contenido de: supabase/migrations/001_initial_schema.sql")
    console.log("3. Pégalo en el editor SQL")
    console.log("4. Presiona Cmd+Enter (Mac) o Ctrl+Enter (Windows/Linux)")
    console.log("5. Espera a que termine de ejecutarse")
  }
  
  console.log("")
  
  if (missing.length === 0) {
    console.log("🎉 Todas las tablas existen!")
  } else {
    console.log(`⚠️  Faltan ${missing.length} de ${tables.length} tablas`)
    process.exit(1)
  }
}

verifyTables().catch(console.error)
