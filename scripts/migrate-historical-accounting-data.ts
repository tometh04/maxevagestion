/**
 * SCRIPT: Migración de Datos Históricos Contables
 * 
 * Este script genera registros de IVA y operator_payments para operaciones existentes
 * que no tienen estos registros pero deberían tenerlos.
 * 
 * USO:
 *   npx tsx scripts/migrate-historical-accounting-data.ts
 */

import { createClient } from "@supabase/supabase-js"
import { createSaleIVA, createPurchaseIVA } from "@/lib/accounting/iva"
import { createOperatorPayment, calculateDueDate } from "@/lib/accounting/operator-payments"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function migrateHistoricalData() {
  console.log("🔄 Iniciando migración de datos históricos contables...\n")

  // 1. Migrar IVA para operaciones sin registros de IVA
  console.log("📊 Paso 1: Generando registros de IVA para operaciones existentes...")
  
  const { data: operationsWithoutIVA, error: opsError } = await supabase
    .from("operations")
    .select("id, sale_amount_total, operator_cost, sale_currency, operator_cost_currency, departure_date, operator_id, created_at")
    .not("sale_amount_total", "is", null)
    .gt("sale_amount_total", 0)

  if (opsError) {
    console.error("❌ Error obteniendo operaciones:", opsError)
    return
  }

  let ivaCreated = 0
  let ivaErrors = 0

  for (const operation of operationsWithoutIVA || []) {
    try {
      // Verificar si ya existe IVA de venta
      const { data: existingSaleIVA } = await supabase
        .from("iva_sales")
        .select("id")
        .eq("operation_id", operation.id)
        .maybeSingle()

      // Verificar si ya existe IVA de compra
      const { data: existingPurchaseIVA } = await supabase
        .from("iva_purchases")
        .select("id")
        .eq("operation_id", operation.id)
        .maybeSingle()

      // Crear IVA de venta si no existe
      if (!existingSaleIVA && operation.sale_amount_total > 0) {
        await createSaleIVA(
          supabase,
          operation.id,
          operation.sale_amount_total,
          (operation.sale_currency || "ARS") as "ARS" | "USD",
          operation.departure_date || operation.created_at.split("T")[0]
        )
        ivaCreated++
        console.log(`  ✅ IVA venta creado para operación ${operation.id.slice(0, 8)}`)
      }

      // Crear IVA de compra si no existe y hay operator_id
      if (!existingPurchaseIVA && operation.operator_cost > 0 && operation.operator_id) {
        await createPurchaseIVA(
          supabase,
          operation.id,
          operation.operator_id,
          operation.operator_cost,
          (operation.operator_cost_currency || "ARS") as "ARS" | "USD",
          operation.departure_date || operation.created_at.split("T")[0]
        )
        ivaCreated++
        console.log(`  ✅ IVA compra creado para operación ${operation.id.slice(0, 8)}`)
      }
    } catch (error: any) {
      ivaErrors++
      console.error(`  ❌ Error procesando operación ${operation.id.slice(0, 8)}:`, error.message)
    }
  }

  console.log(`\n📊 IVA: ${ivaCreated} registros creados, ${ivaErrors} errores\n`)

  // 2. Migrar operator_payments para operaciones sin pagos a operadores
  console.log("💰 Paso 2: Generando operator_payments para operaciones existentes...")

  const { data: operationsWithoutPayments, error: paymentsError } = await supabase
    .from("operations")
    .select("id, operator_id, operator_cost, operator_cost_currency, product_type, departure_date, checkin_date, created_at")
    .not("operator_id", "is", null)
    .gt("operator_cost", 0)

  if (paymentsError) {
    console.error("❌ Error obteniendo operaciones para pagos:", paymentsError)
    return
  }

  let paymentsCreated = 0
  let paymentsErrors = 0

  for (const operation of operationsWithoutPayments || []) {
    try {
      // Verificar si ya existe operator_payment
      const { data: existingPayment } = await supabase
        .from("operator_payments")
        .select("id")
        .eq("operation_id", operation.id)
        .maybeSingle()

      if (!existingPayment && operation.operator_id && operation.operator_cost > 0) {
        // Calcular fecha de vencimiento
        const dueDate = calculateDueDate(
          operation.product_type as any,
          operation.created_at.split("T")[0],
          operation.checkin_date || undefined,
          operation.departure_date || undefined
        )

        await createOperatorPayment(
          supabase,
          operation.id,
          operation.operator_id,
          operation.operator_cost,
          (operation.operator_cost_currency || "ARS") as "ARS" | "USD",
          dueDate,
          `Pago automático generado para operación ${operation.id.slice(0, 8)} (migración histórica)`
        )
        paymentsCreated++
        console.log(`  ✅ Operator payment creado para operación ${operation.id.slice(0, 8)}`)
      }
    } catch (error: any) {
      paymentsErrors++
      console.error(`  ❌ Error procesando operación ${operation.id.slice(0, 8)}:`, error.message)
    }
  }

  console.log(`\n💰 Operator Payments: ${paymentsCreated} registros creados, ${paymentsErrors} errores\n`)

  console.log("✅ Migración de datos históricos completada!")
  console.log(`\n📊 Resumen:`)
  console.log(`   - IVA creados: ${ivaCreated}`)
  console.log(`   - Operator Payments creados: ${paymentsCreated}`)
  console.log(`   - Errores totales: ${ivaErrors + paymentsErrors}`)
}

// Ejecutar migración
migrateHistoricalData()
  .then(() => {
    console.log("\n✅ Script finalizado")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Error fatal:", error)
    process.exit(1)
  })

