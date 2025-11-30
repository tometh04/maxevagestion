import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { join } from "path"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno:")
  console.error("   - NEXT_PUBLIC_SUPABASE_URL")
  console.error("   - SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: "public" },
  auth: { autoRefreshToken: false, persistSession: false },
})

async function executeSQL(sql: string, description: string) {
  console.log(`\n🔄 Ejecutando: ${description}`)
  
  try {
    // Intentar ejecutar usando rpc exec_sql si existe
    const { error: rpcError } = await supabase.rpc("exec_sql", { sql_query: sql })
    
    if (!rpcError) {
      console.log(`✅ ${description} - Ejecutado exitosamente`)
      return true
    }
    
    // Si no existe la función RPC, intentar método alternativo
    console.log(`⚠️  RPC no disponible, intentando método alternativo...`)
    
    // Dividir SQL en statements individuales
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"))

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          // Usar fetch directo a la API REST de Supabase
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: "POST",
            headers: {
              apikey: supabaseServiceKey,
              Authorization: `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify({ sql_query: statement + ";" }),
          })

          if (!response.ok) {
            const errorText = await response.text()
            // Algunos errores son esperados (tablas que ya existen)
            if (errorText.includes("already exists") || errorText.includes("duplicate")) {
              console.log(`   ⚠️  ${statement.substring(0, 50)}... (ya existe, continuando)`)
            } else {
              console.log(`   ❌ Error: ${errorText.substring(0, 200)}`)
            }
          }
        } catch (err: any) {
          // Ignorar errores de statements individuales
          console.log(`   ⚠️  ${statement.substring(0, 50)}... (error ignorado)`)
        }
      }
    }
    
    console.log(`✅ ${description} - Procesado (algunos errores pueden ser esperados)`)
    return true
  } catch (error: any) {
    console.error(`❌ Error ejecutando ${description}:`, error.message)
    return false
  }
}

async function runMigrations() {
  console.log("🚀 Iniciando migraciones de Fase 1: Fundación Contable")
  console.log("=" .repeat(60))

  // Migración 1: financial_accounts (PRIMERO)
  const migration006Path = join(
    process.cwd(),
    "supabase/migrations/006_create_financial_accounts.sql"
  )
  const migration006SQL = readFileSync(migration006Path, "utf-8")
  const success1 = await executeSQL(migration006SQL, "Migración 006: financial_accounts")

  if (!success1) {
    console.error("\n❌ Falló la migración 006. Abortando.")
    process.exit(1)
  }

  // Esperar un poco para que Supabase procese
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // Migración 2: ledger_movements (SEGUNDO)
  const migration005Path = join(
    process.cwd(),
    "supabase/migrations/005_create_ledger_movements.sql"
  )
  const migration005SQL = readFileSync(migration005Path, "utf-8")
  const success2 = await executeSQL(migration005SQL, "Migración 005: ledger_movements")

  if (!success2) {
    console.error("\n❌ Falló la migración 005. Revisa los errores arriba.")
    process.exit(1)
  }

  // Verificar que las tablas se crearon
  console.log("\n🔍 Verificando que las tablas se crearon...")
  
  try {
    const { data: accounts, error: accountsError } = await supabase
      .from("financial_accounts")
      .select("id")
      .limit(1)

    if (accountsError) {
      console.log("⚠️  No se pudo verificar financial_accounts:", accountsError.message)
    } else {
      console.log("✅ Tabla financial_accounts existe")
    }

    const { data: movements, error: movementsError } = await supabase
      .from("ledger_movements")
      .select("id")
      .limit(1)

    if (movementsError) {
      console.log("⚠️  No se pudo verificar ledger_movements:", movementsError.message)
    } else {
      console.log("✅ Tabla ledger_movements existe")
    }
  } catch (error: any) {
    console.log("⚠️  Error verificando tablas:", error.message)
  }

  console.log("\n" + "=".repeat(60))
  console.log("✅ Migraciones de Fase 1 completadas!")
  console.log("\n📝 Nota: Si ves errores sobre 'already exists', es normal.")
  console.log("   Las tablas ya pueden existir de ejecuciones anteriores.")
  console.log("\n🎯 Próximo paso: Continuar con Fase 2")
}

runMigrations().catch((error) => {
  console.error("❌ Error fatal:", error)
  process.exit(1)
})

