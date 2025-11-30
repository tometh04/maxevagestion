/**
 * Script para generar recordatorios de pagos automáticamente
 * Este script debe ejecutarse diariamente (cron job)
 * 
 * Genera alertas para:
 * - Pagos que vencen en 7 días
 * - Pagos que vencen en 3 días
 * - Pagos que vencen hoy
 * - Pagos vencidos
 * 
 * Uso:
 *   npx tsx scripts/generate-payment-reminders.ts
 * 
 * O configurar como cron job:
 *   0 0 * * * cd /path/to/project && npx tsx scripts/generate-payment-reminders.ts
 */

import { generatePaymentReminders } from "@/lib/alerts/payment-reminders"

async function main() {
  console.log("🔄 Iniciando generación de recordatorios de pagos...")
  console.log(`📅 Fecha: ${new Date().toISOString()}`)

  try {
    const result = await generatePaymentReminders()

    console.log(`✅ Proceso completado:`)
    console.log(`   - Recordatorios creados: ${result.created}`)
    console.log(`   - Recordatorios de clientes encontrados: ${result.customerReminders}`)
    console.log(`   - Recordatorios de operadores encontrados: ${result.operatorReminders}`)

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

