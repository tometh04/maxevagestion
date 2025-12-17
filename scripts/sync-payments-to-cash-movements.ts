/**
 * Script para sincronizar pagos pagados con movimientos de caja
 * 
 * Este script busca todos los pagos que están marcados como pagados (status='PAID')
 * pero que no tienen un cash_movement asociado, y crea los movimientos faltantes.
 * 
 * Uso: npx tsx scripts/sync-payments-to-cash-movements.ts
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function syncPaymentsToCashMovements() {
  console.log("🔄 Iniciando sincronización de pagos a movimientos de caja...\n")

  try {
    // 1. Obtener todos los pagos pagados
    const { data: paidPayments, error: paymentsError } = await supabase
      .from("payments")
      .select(`
        id,
        operation_id,
        amount,
        currency,
        direction,
        payer_type,
        method,
        date_paid,
        reference,
        status,
        operations:operation_id(
          id,
          agency_id,
          seller_id,
          operator_id
        )
      `)
      .eq("status", "PAID")
      .not("date_paid", "is", null)

    if (paymentsError) {
      throw new Error(`Error obteniendo pagos: ${paymentsError.message}`)
    }

    if (!paidPayments || paidPayments.length === 0) {
      console.log("✅ No hay pagos pagados para sincronizar")
      return
    }

    console.log(`📊 Encontrados ${paidPayments.length} pagos pagados\n`)

    // 2. Obtener todos los cash_movements existentes con payment_id
    const { data: existingMovements, error: movementsError } = await supabase
      .from("cash_movements")
      .select("payment_id")
      .not("payment_id", "is", null)

    if (movementsError) {
      throw new Error(`Error obteniendo movimientos: ${movementsError.message}`)
    }

    const existingPaymentIds = new Set(
      (existingMovements || []).map((m: any) => m.payment_id)
    )

    // 3. Filtrar pagos que no tienen movimiento
    const paymentsToSync = paidPayments.filter(
      (p: any) => !existingPaymentIds.has(p.id)
    )

    if (paymentsToSync.length === 0) {
      console.log("✅ Todos los pagos ya tienen movimientos de caja asociados")
      return
    }

    console.log(`📝 ${paymentsToSync.length} pagos necesitan movimientos de caja\n`)

    // 4. Para cada pago, crear el movimiento de caja
    let successCount = 0
    let errorCount = 0

    for (const payment of paymentsToSync) {
      try {
        const operation = (payment as any).operations || null

        // Obtener agency_id
        let agencyId = operation?.agency_id
        if (!agencyId) {
          // Intentar obtener de user_agencies (usar el primer usuario que encontremos)
          const { data: users } = await supabase
            .from("users")
            .select("id")
            .limit(1)
            .single()

          if (users) {
            const { data: userAgencies } = await supabase
              .from("user_agencies")
              .select("agency_id")
              .eq("user_id", users.id)
              .limit(1)

            agencyId = (userAgencies as any)?.[0]?.agency_id
          }
        }

        // Obtener cash_box_id por defecto
        let cashBoxId = null
        if (agencyId) {
          const { data: defaultCashBox } = await supabase
            .from("cash_boxes")
            .select("id")
            .eq("agency_id", agencyId)
            .eq("currency", payment.currency)
            .eq("is_default", true)
            .eq("is_active", true)
            .maybeSingle()

          cashBoxId = (defaultCashBox as any)?.id || null
        }

        // Si no hay cash_box, intentar obtener uno sin agency_id
        if (!cashBoxId) {
          const { data: defaultCashBox } = await supabase
            .from("cash_boxes")
            .select("id")
            .eq("currency", payment.currency)
            .eq("is_default", true)
            .eq("is_active", true)
            .maybeSingle()

          cashBoxId = (defaultCashBox as any)?.id || null
        }

        // Obtener user_id (usar el primer usuario admin o el que creó la operación)
        let userId = null
        if (operation?.seller_id) {
          userId = operation.seller_id
        } else {
          const { data: adminUser } = await supabase
            .from("users")
            .select("id")
            .in("role", ["SUPER_ADMIN", "ADMIN"])
            .limit(1)
            .single()

          userId = (adminUser as any)?.id || null
        }

        if (!userId) {
          console.warn(`⚠️  No se pudo encontrar user_id para pago ${payment.id}`)
          errorCount++
          continue
        }

        // Crear el movimiento de caja
        const movementData = {
          operation_id: payment.operation_id,
          payment_id: payment.id,
          cash_box_id: cashBoxId,
          user_id: userId,
          type: payment.direction === "INCOME" ? "INCOME" : "EXPENSE",
          category: payment.direction === "INCOME" ? "SALE" : "OPERATOR_PAYMENT",
          amount: parseFloat(payment.amount),
          currency: payment.currency,
          movement_date: payment.date_paid,
          notes: payment.reference || `Pago ${payment.id}`,
          is_touristic: true,
        }

        const { error: insertError } = await supabase
          .from("cash_movements")
          .insert(movementData)

        if (insertError) {
          console.error(`❌ Error creando movimiento para pago ${payment.id}:`, insertError.message)
          errorCount++
        } else {
          console.log(`✅ Creado movimiento para pago ${payment.id} (${payment.direction}, ${payment.currency} ${payment.amount})`)
          successCount++
        }
      } catch (error: any) {
        console.error(`❌ Error procesando pago ${payment.id}:`, error.message)
        errorCount++
      }
    }

    console.log(`\n📊 Resumen:`)
    console.log(`   ✅ Creados: ${successCount}`)
    console.log(`   ❌ Errores: ${errorCount}`)
    console.log(`   📝 Total procesados: ${paymentsToSync.length}`)

    if (successCount > 0) {
      console.log(`\n✅ Sincronización completada. ${successCount} movimientos de caja creados.`)
    }
  } catch (error: any) {
    console.error("❌ Error en sincronización:", error.message)
    process.exit(1)
  }
}

// Ejecutar
syncPaymentsToCashMovements()
  .then(() => {
    console.log("\n✨ Proceso finalizado")
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Error fatal:", error)
    process.exit(1)
  })

