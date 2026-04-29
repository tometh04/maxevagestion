/**
 * Script para ejecutar la migración de conversaciones de Emilia
 * Run: npx tsx scripts/run-emilia-migration.ts
 */

import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("❌ Error: Faltan variables de entorno")
    console.error("   NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✓" : "✗")
    console.error("   SUPABASE_SERVICE_ROLE_KEY:", supabaseServiceKey ? "✓" : "✗")
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
})

async function runMigration() {
    console.log("🚀 Ejecutando migración de Emilia...")

    try {
        // Leer el archivo de migración
        const migrationPath = path.join(
            process.cwd(),
            "supabase",
            "migrations",
            "050_create_emilia_conversations.sql"
        )

        console.log("📄 Leyendo archivo de migración:", migrationPath)

        if (!fs.existsSync(migrationPath)) {
            throw new Error(`No se encontró el archivo de migración: ${migrationPath}`)
        }

        const migrationSQL = fs.readFileSync(migrationPath, "utf8")

        console.log("📊 Ejecutando SQL en Supabase...")

        // Ejecutar la migración
        const { error } = await supabase.rpc("exec_sql", { sql: migrationSQL })

        if (error) {
            // Si no existe la función exec_sql, intentar con raw query
            console.log("⚠️  exec_sql no disponible, intentando método alternativo...")

            // Dividir el SQL en statements individuales
            const statements = migrationSQL
                .split(";")
                .map((s) => s.trim())
                .filter((s) => s.length > 0 && !s.startsWith("--"))

            for (const statement of statements) {
                if (statement.trim()) {
                    const { error: stmtError } = await supabase.rpc("exec_sql", {
                        sql: statement + ";",
                    })
                    if (stmtError) {
                        console.error("❌ Error ejecutando statement:", stmtError)
                        throw stmtError
                    }
                }
            }
        }

        console.log("✅ Migración ejecutada exitosamente!")
        console.log("")
        console.log("📋 Tablas creadas:")
        console.log("   - conversations")
        console.log("   - messages")
        console.log("")
        console.log("🎉 ¡Listo! Ahora podés usar Emilia con conversaciones persistentes.")
    } catch (error: any) {
        console.error("❌ Error ejecutando migración:")
        console.error(error)
        console.log("")
        console.log("💡 Alternativa: Ejecutá el SQL manualmente en el Dashboard de Supabase")
        console.log("   1. Andá a https://supabase.com/dashboard")
        console.log("   2. SQL Editor")
        console.log("   3. Copiá el contenido de supabase/migrations/050_create_emilia_conversations.sql")
        console.log("   4. Pegalo y ejecutalo")
        process.exit(1)
    }
}

runMigration()



