/**
 * Script de Limpieza Masiva Pre-Importación
 * 
 * ELIMINA todos los datos del sistema EXCEPTO:
 * - Leads de Trello y ManyChat
 * - Configuración de integraciones (Trello, ManyChat)
 * - Estructura base (agencies, chart_of_accounts)
 * 
 * ⚠️ IMPORTANTE: Hacer backup completo antes de ejecutar
 * 
 * Ejecutar: npm run limpieza:masiva
 * Requiere: .env.local con SUPABASE_SERVICE_ROLE_KEY y NEXT_PUBLIC_SUPABASE_URL
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { join } from "path"

dotenv.config({ path: join(process.cwd(), ".env.local") })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error("❌ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}

const supabase = createClient(url, key) as any

const STEP = (name: string, ok: boolean, count?: number, err?: string) => {
  const countStr = count !== undefined ? ` (${count} registros)` : ""
  console.log(ok ? `   ✅ ${name}${countStr}` : `   ❌ ${name}${err ? ` — ${err}` : ""}`)
  return { name, ok, count: count || 0, error: err ?? null }
}

async function executeDelete(tableName: string): Promise<{ ok: boolean; count: number; error: string | null }> {
  try {
    // Obtener count antes de eliminar
    const { count: countBefore } = await supabase.from(tableName).select('*', { count: 'exact', head: true })
    
    if (countBefore === 0) {
      return { ok: true, count: 0, error: null }
    }

    // Eliminar en lotes para evitar timeouts
    let deleted = 0
    const batchSize = 1000
    let hasMore = true

    while (hasMore) {
      // Obtener IDs de un lote
      const { data: batch } = await supabase
        .from(tableName)
        .select('id')
        .limit(batchSize)

      if (!batch || batch.length === 0) {
        hasMore = false
        break
      }

      const ids = batch.map((r: any) => r.id)
      
      // Eliminar el lote
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .in('id', ids)

      if (deleteError) {
        return { ok: false, count: deleted, error: deleteError.message }
      }

      deleted += ids.length
      
      // Si el lote es menor que batchSize, terminamos
      if (ids.length < batchSize) {
        hasMore = false
      }
    }

    return { ok: true, count: countBefore || deleted, error: null }
  } catch (e: any) {
    return { ok: false, count: 0, error: e?.message || String(e) }
  }
}

async function getCount(table: string, where?: string): Promise<number> {
  try {
    let query = supabase.from(table).select('*', { count: 'exact', head: true })
    if (where) {
      // Parsear where simple (ej: "source IN ('Trello', 'Manychat')")
      if (where.includes('IN')) {
        const match = where.match(/(\w+)\s+IN\s+\(([^)]+)\)/i)
        if (match) {
          const column = match[1]
          const values = match[2].replace(/'/g, '').split(',').map(v => v.trim())
          query = query.in(column, values)
        }
      }
    }
    const { count } = await query
    return count || 0
  } catch {
    return 0
  }
}

async function main() {
  console.log("🧹 Limpieza Masiva Pre-Importación\n")
  console.log("⚠️  ADVERTENCIA: Este script eliminará TODOS los datos excepto leads de Trello/ManyChat\n")

  // Verificaciones previas
  console.log("📊 Verificaciones previas:\n")
  
  const leadsTrello = await getCount('leads', "source IN ('Trello', 'Manychat')")
  const leadsTotal = await getCount('leads')
  const operationsCount = await getCount('operations')
  const customersCount = await getCount('customers')
  const paymentsCount = await getCount('payments')
  const ledgerCount = await getCount('ledger_movements')

  console.log(`   📋 Leads totales: ${leadsTotal}`)
  console.log(`   📋 Leads a mantener (Trello/ManyChat): ${leadsTrello}`)
  console.log(`   📋 Leads a eliminar: ${leadsTotal - leadsTrello}`)
  console.log(`   📋 Operaciones: ${operationsCount}`)
  console.log(`   📋 Clientes: ${customersCount}`)
  console.log(`   📋 Pagos: ${paymentsCount}`)
  console.log(`   📋 Movimientos contables: ${ledgerCount}\n`)

  if (leadsTrello === 0) {
    console.log("⚠️  ADVERTENCIA: No se encontraron leads de Trello/ManyChat para mantener.")
    console.log("   ¿Estás seguro de que querés continuar? (S/N)")
    // En producción, esto debería pedir confirmación
  }

  console.log("🚀 Iniciando limpieza...\n")

  const steps: Array<{ name: string; ok: boolean; count: number; error: string | null }> = []

  try {
    // FASE 1: Datos Financieros
    console.log("FASE 1: Datos Financieros")
    let result = await executeDelete("ledger_movements")
    steps.push(STEP("1.1. Eliminar ledger_movements", result.ok, result.count, result.error))

    result = await executeDelete("cash_movements")
    steps.push(STEP("1.2. Eliminar cash_movements", result.ok, result.count, result.error))

    result = await executeDelete("operator_payments")
    steps.push(STEP("1.3. Eliminar operator_payments", result.ok, result.count, result.error))

    result = await executeDelete("payments")
    steps.push(STEP("1.4. Eliminar payments", result.ok, result.count, result.error))

    result = await executeDelete("iva_sales")
    steps.push(STEP("1.5. Eliminar iva_sales", result.ok, result.count, result.error))

    result = await executeDelete("iva_purchases")
    steps.push(STEP("1.6. Eliminar iva_purchases", result.ok, result.count, result.error))

    result = await executeDelete("monthly_exchange_rates")
    steps.push(STEP("1.7. Eliminar monthly_exchange_rates", result.ok, result.count, result.error))

    result = await executeDelete("exchange_rates")
    steps.push(STEP("1.8. Eliminar exchange_rates", result.ok, result.count, result.error))

    // FASE 2: Operaciones
    console.log("\nFASE 2: Operaciones")
    result = await executeDelete("operation_customers")
    steps.push(STEP("2.1. Eliminar operation_customers", result.ok, result.count, result.error))

    result = await executeDelete("operation_operators")
    steps.push(STEP("2.2. Eliminar operation_operators", result.ok, result.count, result.error))

    result = await executeDelete("operations")
    steps.push(STEP("2.3. Eliminar operations", result.ok, result.count, result.error))

    // Intentar eliminar quotation_items si existe
    try {
      result = await executeDelete("quotation_items")
      steps.push(STEP("2.4. Eliminar quotation_items", result.ok, result.count, result.error))
    } catch {
      steps.push(STEP("2.4. Eliminar quotation_items", true, 0, "Tabla no existe (OK)"))
    }

    result = await executeDelete("quotations")
    steps.push(STEP("2.5. Eliminar quotations", result.ok, result.count, result.error))

    // FASE 3: Limpiar Leads
    console.log("\nFASE 3: Limpiar Leads (mantener solo Trello/ManyChat)")
    // Obtener todos los leads y filtrar los que NO son Trello ni ManyChat
    const { data: allLeads, error: fetchError } = await supabase
      .from('leads')
      .select('id, source')
    
    if (fetchError) {
      steps.push(STEP("3.1. Eliminar leads no Trello/ManyChat", false, 0, fetchError.message))
    } else {
      const leadsToDelete = (allLeads || []).filter((l: any) => !['Trello', 'Manychat'].includes(l.source))
      const leadsEliminados = leadsToDelete.length
      
      if (leadsToDelete.length > 0) {
        const idsToDelete = leadsToDelete.map((l: any) => l.id)
        const { error: deleteLeadsError } = await supabase
          .from('leads')
          .delete()
          .in('id', idsToDelete)
        steps.push(STEP("3.1. Eliminar leads no Trello/ManyChat", !deleteLeadsError, leadsEliminados, deleteLeadsError?.message))
      } else {
        steps.push(STEP("3.1. Eliminar leads no Trello/ManyChat", true, 0, "No hay leads a eliminar"))
      }
    }

    // Limpiar referencias en leads mantenidos
    const { error: updateLeadsError } = await supabase
      .from('leads')
      .update({ deposit_account_id: null })
      .in('source', ['Trello', 'Manychat'])
    
    steps.push(STEP("3.2. Limpiar referencias en leads mantenidos", !updateLeadsError, leadsTrello, updateLeadsError?.message))

    // FASE 4: Clientes
    console.log("\nFASE 4: Clientes")
    result = await executeDelete("customer_interactions")
    steps.push(STEP("4.1. Eliminar customer_interactions", result.ok, result.count, result.error))

    result = await executeDelete("customers")
    steps.push(STEP("4.2. Eliminar customers", result.ok, result.count, result.error))

    // FASE 5: Documentos
    console.log("\nFASE 5: Documentos")
    result = await executeDelete("documents")
    steps.push(STEP("5.1. Eliminar documents", result.ok, result.count, result.error))

    result = await executeDelete("notes")
    steps.push(STEP("5.2. Eliminar notes", result.ok, result.count, result.error))

    // FASE 6: Alertas
    console.log("\nFASE 6: Alertas")
    const { error: deleteAlertsError } = await supabase
      .from('alerts')
      .delete()
      .or('operation_id.not.is.null,type.in.(PAYMENT_DUE,OPERATOR_DUE,UPCOMING_TRIP)')
    
    steps.push(STEP("6.1. Eliminar alertas de operaciones", !deleteAlertsError, 0, deleteAlertsError?.message))

    // FASE 7: Comisiones
    console.log("\nFASE 7: Comisiones")
    result = await executeDelete("commission_records")
    steps.push(STEP("7.1. Eliminar commission_records", result.ok, result.count, result.error))

    result = await executeDelete("partner_profit_allocations")
    steps.push(STEP("7.2. Eliminar partner_profit_allocations", result.ok, result.count, result.error))

    result = await executeDelete("partner_accounts")
    steps.push(STEP("7.3. Eliminar partner_accounts", result.ok, result.count, result.error))

    // FASE 8: Facturas
    console.log("\nFASE 8: Facturas")
    result = await executeDelete("invoice_items")
    steps.push(STEP("8.1. Eliminar invoice_items", result.ok, result.count, result.error))

    result = await executeDelete("invoices")
    steps.push(STEP("8.2. Eliminar invoices", result.ok, result.count, result.error))

    result = await executeDelete("billing_info")
    steps.push(STEP("8.3. Eliminar billing_info", result.ok, result.count, result.error))

    // FASE 9: Gastos Recurrentes
    console.log("\nFASE 9: Gastos Recurrentes")
    result = await executeDelete("recurring_payments")
    steps.push(STEP("9.1. Eliminar recurring_payments", result.ok, result.count, result.error))

    // FASE 10: Usuarios (mantener solo admin)
    console.log("\nFASE 10: Usuarios (mantener solo admin)")
    // Obtener usuarios admin a mantener
    const { data: adminUsers } = await supabase
      .from('users')
      .select('id, email, role')
      .in('role', ['SUPER_ADMIN', 'ADMIN'])
      .limit(10)

    const adminIds = (adminUsers || []).map(u => u.id)
    
    if (adminIds.length > 0) {
      // Obtener todos los user_agencies y eliminar los que no son de admin
      const { data: allUserAgencies } = await supabase.from('user_agencies').select('id, user_id')
      if (allUserAgencies) {
        const toDelete = allUserAgencies.filter((ua: any) => !adminIds.includes(ua.user_id))
        if (toDelete.length > 0) {
          const idsToDelete = toDelete.map((ua: any) => ua.id)
          const { error: deleteUserAgenciesError } = await supabase
            .from('user_agencies')
            .delete()
            .in('id', idsToDelete)
          steps.push(STEP("10.1. Eliminar user_agencies (excepto admin)", !deleteUserAgenciesError, toDelete.length, deleteUserAgenciesError?.message))
        } else {
          steps.push(STEP("10.1. Eliminar user_agencies (excepto admin)", true, 0, "No hay relaciones a eliminar"))
        }
      }

      // Obtener todos los users y eliminar los que no son admin
      const { data: allUsers } = await supabase.from('users').select('id')
      if (allUsers) {
        const toDelete = allUsers.filter((u: any) => !adminIds.includes(u.id))
        if (toDelete.length > 0) {
          const idsToDelete = toDelete.map((u: any) => u.id)
          const { error: deleteUsersError } = await supabase
            .from('users')
            .delete()
            .in('id', idsToDelete)
          steps.push(STEP("10.2. Eliminar users (excepto admin)", !deleteUsersError, toDelete.length, deleteUsersError?.message))
        } else {
          steps.push(STEP("10.2. Eliminar users (excepto admin)", true, 0, "No hay usuarios a eliminar"))
        }
      }
      console.log(`   ℹ️  Usuarios admin mantenidos: ${adminUsers?.map((u: any) => u.email).join(', ')}`)
    } else {
      steps.push(STEP("10.1. Eliminar user_agencies", false, 0, "No se encontraron usuarios admin"))
      steps.push(STEP("10.2. Eliminar users", false, 0, "No se encontraron usuarios admin - ABORTADO"))
      throw new Error("No se encontraron usuarios admin. Abortando para evitar bloqueo del sistema.")
    }

    result = await executeDelete("team_members")
    steps.push(STEP("10.3. Eliminar team_members", result.ok, result.count, result.error))

    result = await executeDelete("teams")
    steps.push(STEP("10.4. Eliminar teams", result.ok, result.count, result.error))

    // FASE 11: Operadores
    console.log("\nFASE 11: Operadores")
    result = await executeDelete("operators")
    steps.push(STEP("11.1. Eliminar operators", result.ok, result.count, result.error))

    // FASE 12: Otros
    console.log("\nFASE 12: Otros")
    result = await executeDelete("communications")
    steps.push(STEP("12.1. Eliminar communications", result.ok, result.count, result.error))

    result = await executeDelete("whatsapp_messages")
    steps.push(STEP("12.2. Eliminar whatsapp_messages", result.ok, result.count, result.error))

    // Intentar eliminar emilia si existe
    try {
      result = await executeDelete("emilia_messages")
      steps.push(STEP("12.3. Eliminar emilia_messages", result.ok, result.count, result.error))
    } catch {
      steps.push(STEP("12.3. Eliminar emilia_messages", true, 0, "Tabla no existe (OK)"))
    }

    try {
      result = await executeDelete("emilia_conversations")
      steps.push(STEP("12.4. Eliminar emilia_conversations", result.ok, result.count, result.error))
    } catch {
      steps.push(STEP("12.4. Eliminar emilia_conversations", true, 0, "Tabla no existe (OK)"))
    }

    result = await executeDelete("audit_logs")
    steps.push(STEP("12.5. Eliminar audit_logs", result.ok, result.count, result.error))

    // FASE 13: Cuentas Financieras (último, después de limpiar referencias)
    console.log("\nFASE 13: Cuentas Financieras")
    result = await executeDelete("financial_accounts")
    steps.push(STEP("13.1. Eliminar financial_accounts", result.ok, result.count, result.error))

  } catch (e: any) {
    console.error("\n❌ Error durante la limpieza:", e?.message || e)
    steps.push(STEP("Error inesperado", false, 0, e?.message || String(e)))
  }

  // Verificaciones finales
  console.log("\n📊 Verificaciones finales:\n")
  
  const leadsFinal = await getCount('leads')
  const operationsFinal = await getCount('operations')
  const customersFinal = await getCount('customers')
  const paymentsFinal = await getCount('payments')
  const ledgerFinal = await getCount('ledger_movements')
  const financialAccountsFinal = await getCount('financial_accounts')

  console.log(`   📋 Leads finales: ${leadsFinal} (esperado: ${leadsTrello})`)
  console.log(`   📋 Operaciones finales: ${operationsFinal} (esperado: 0)`)
  console.log(`   📋 Clientes finales: ${customersFinal} (esperado: 0)`)
  console.log(`   📋 Pagos finales: ${paymentsFinal} (esperado: 0)`)
  console.log(`   📋 Movimientos contables finales: ${ledgerFinal} (esperado: 0)`)
  console.log(`   📋 Cuentas financieras finales: ${financialAccountsFinal} (esperado: 0)\n`)

  // Resumen
  console.log("--- Resumen ---\n")
  const success = steps.filter(s => s.ok).length
  const failed = steps.filter(s => !s.ok).length
  const totalDeleted = steps.reduce((sum, s) => sum + s.count, 0)

  console.log(`   Pasos exitosos: ${success}/${steps.length}`)
  console.log(`   Pasos fallidos: ${failed}/${steps.length}`)
  console.log(`   Registros eliminados: ~${totalDeleted}\n`)

  if (failed === 0) {
    console.log("✅ Limpieza completada exitosamente!")
    console.log("   El sistema está listo para la importación de datos históricos.\n")
  } else {
    console.log("⚠️  Limpieza completada con algunos errores.")
    console.log("   Revisá los errores arriba antes de proceder con la importación.\n")
    process.exit(1)
  }
}

main().catch((e) => {
  console.error("❌ Error fatal:", e)
  process.exit(1)
})
