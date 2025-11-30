/**
 * Script para generar pagos recurrentes automáticamente
 * Este script debe ejecutarse diariamente (cron job)
 * 
 * Uso:
 *   npx tsx scripts/generate-recurring-payments.ts
 * 
 * O configurar como cron job:
 *   0 0 * * * cd /path/to/project && npx tsx scripts/generate-recurring-payments.ts
 */

import { createServerClient } from "@/lib/supabase/server"
import { generateAllRecurringPayments } from "@/lib/accounting/recurring-payments"

async function main() {
  console.log("🔄 Iniciando generación de pagos recurrentes...")
  console.log(`📅 Fecha: ${new Date().toISOString()}`)

  try {
    const supabase = await createServerClient()
    
    // Usar un usuario del sistema o crear uno especial para cron jobs
    // Por ahora, usamos un ID temporal - en producción deberías tener un usuario específico
    const systemUserId = "00000000-0000-0000-0000-000000000000"

    const result = await generateAllRecurringPayments(supabase, systemUserId)

    console.log(`✅ Proceso completado:`)
    console.log(`   - Pagos generados: ${result.generated}`)
    
    if (result.errors.length > 0) {
      console.log(`   - Errores: ${result.errors.length}`)
      result.errors.forEach((error) => {
        console.error(`   ❌ ${error}`)
      })
    } else {
      console.log(`   - Sin errores`)
    }

    process.exit(0)
  } catch (error: any) {
    console.error("❌ Error fatal:", error.message)
    console.error(error)
    process.exit(1)
  }
}

main()

