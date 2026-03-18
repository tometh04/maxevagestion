/**
 * Script para arreglar movimientos del ledger que no tienen account_id
 * (causados por bug de destructuring en operations/route.ts)
 *
 * Los movimientos "Venta - Operación..." deben ir a Cuentas por Cobrar
 * Los movimientos "Costo de Operadores..." deben ir a Cuentas por Pagar
 *
 * Ejecutar: npx tsx scripts/fix-orphan-ledger-movements.ts
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function fixOrphanMovements() {
  console.log("🔍 Buscando movimientos huérfanos (sin account_id)...")

  // 1. Buscar movimientos sin account_id
  const { data: orphans, error: orphanError } = await supabase
    .from("ledger_movements")
    .select("id, type, concept, currency, amount_original")
    .is("account_id", null)

  if (orphanError) {
    console.error("❌ Error buscando huérfanos:", orphanError)
    return
  }

  console.log(`📊 Encontrados ${orphans?.length || 0} movimientos huérfanos`)

  if (!orphans || orphans.length === 0) {
    console.log("✅ No hay movimientos huérfanos. Nada que arreglar.")
    return
  }

  // 2. Buscar cuenta de Cuentas por Cobrar (chart_account_code: 1.1.03)
  const { data: cpcChart } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("account_code", "1.1.03")
    .eq("is_active", true)
    .maybeSingle()

  let cpcAccountId: string | null = null
  if (cpcChart) {
    const { data: cpcFA } = await supabase
      .from("financial_accounts")
      .select("id")
      .eq("chart_account_id", cpcChart.id)
      .eq("is_active", true)
      .maybeSingle()
    cpcAccountId = cpcFA?.id || null
  }

  // 3. Buscar cuenta de Cuentas por Pagar (chart_account_code: 2.1.01)
  const { data: cppChart } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("account_code", "2.1.01")
    .eq("is_active", true)
    .maybeSingle()

  let cppAccountId: string | null = null
  if (cppChart) {
    const { data: cppFA } = await supabase
      .from("financial_accounts")
      .select("id")
      .eq("chart_account_id", cppChart.id)
      .eq("is_active", true)
      .maybeSingle()
    cppAccountId = cppFA?.id || null
  }

  console.log(`📌 Cuentas por Cobrar ID: ${cpcAccountId || "NO ENCONTRADA"}`)
  console.log(`📌 Cuentas por Pagar ID: ${cppAccountId || "NO ENCONTRADA"}`)

  if (!cpcAccountId && !cppAccountId) {
    console.error("❌ No se encontraron cuentas CpC ni CpP. Abortando.")
    return
  }

  // 4. Clasificar y actualizar
  const ventas = orphans.filter(m => m.concept?.startsWith("Venta"))
  const costos = orphans.filter(m => m.concept?.startsWith("Costo de Operadores"))
  const otros = orphans.filter(m => !m.concept?.startsWith("Venta") && !m.concept?.startsWith("Costo de Operadores"))

  console.log(`  📈 Ventas (→ CpC): ${ventas.length}`)
  console.log(`  📉 Costos (→ CpP): ${costos.length}`)
  console.log(`  ❓ Otros: ${otros.length}`)

  // Actualizar Ventas → Cuentas por Cobrar
  if (ventas.length > 0 && cpcAccountId) {
    const ventaIds = ventas.map(m => m.id)
    const { error } = await supabase
      .from("ledger_movements")
      .update({ account_id: cpcAccountId })
      .in("id", ventaIds)

    if (error) {
      console.error("❌ Error actualizando ventas:", error)
    } else {
      console.log(`✅ ${ventas.length} movimientos de Venta asignados a Cuentas por Cobrar`)
    }
  }

  // Actualizar Costos → Cuentas por Pagar
  if (costos.length > 0 && cppAccountId) {
    const costoIds = costos.map(m => m.id)
    const { error } = await supabase
      .from("ledger_movements")
      .update({ account_id: cppAccountId })
      .in("id", costoIds)

    if (error) {
      console.error("❌ Error actualizando costos:", error)
    } else {
      console.log(`✅ ${costos.length} movimientos de Costo asignados a Cuentas por Pagar`)
    }
  }

  if (otros.length > 0) {
    console.log("⚠️ Movimientos sin clasificar:")
    otros.forEach(m => console.log(`  - ${m.concept} (${m.type}, ${m.currency} ${m.amount_original})`))
  }

  console.log("\n🎉 Corrección completada")
}

fixOrphanMovements().catch(console.error)
