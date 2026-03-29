/**
 * Script: fix-cpc-currency-split.ts
 *
 * Problema: La cuenta "Cuentas por Cobrar" (1.1.03) fue creada solo en ARS,
 * pero contiene movimientos de ventas en USD. Esto infla el balance en ARS
 * porque usa amount_ars_equivalent para todo.
 *
 * Solución:
 * 1. Crear cuenta CpC USD si no existe
 * 2. Mover los ledger_movements con currency=USD a la nueva cuenta CpC USD
 * 3. Mismo fix para CpP (Cuentas por Pagar, 2.1.01)
 *
 * Uso: npx tsx scripts/fix-cpc-currency-split.ts [--dry-run]
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import * as path from "path"

dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const isDryRun = process.argv.includes("--dry-run")

async function fixCurrencySplit(accountNamePattern: string) {
  console.log(`\n${"═".repeat(60)}`)
  console.log(`📋 Procesando: ${accountNamePattern}`)
  console.log(`${"═".repeat(60)}`)

  // Buscar financial_accounts por nombre (funciona aunque no haya chart_of_accounts)
  const { data: financialAccounts } = await (supabase.from("financial_accounts") as any)
    .select("id, name, currency, chart_account_id, type, is_active")
    .ilike("name", `%${accountNamePattern}%`)
    .eq("is_active", true)

  if (!financialAccounts || financialAccounts.length === 0) {
    console.log(`⚠️  No se encontraron financial_accounts con nombre "${accountNamePattern}"`)
    return
  }

  console.log(`\n📊 Financial accounts encontradas: ${financialAccounts.length}`)
  for (const fa of financialAccounts) {
    console.log(`   - ${fa.name} (${fa.currency}) → ${fa.id.slice(0, 8)} | chart_account_id: ${fa.chart_account_id || 'NULL'}`)
  }

  // Buscar la cuenta ARS (la que tiene todos los movimientos mezclados)
  const arsAccount = financialAccounts.find((fa: any) => fa.currency === "ARS")
  if (!arsAccount) {
    console.log(`⚠️  No hay cuenta ARS para ${accountNamePattern}, nada que migrar`)
    return
  }

  // Buscar movimientos USD en la cuenta ARS
  const { data: usdMovements, error: movError } = await (supabase.from("ledger_movements") as any)
    .select("id, concept, currency, amount_original, amount_ars_equivalent, operation_id, type")
    .eq("account_id", arsAccount.id)
    .eq("currency", "USD")

  if (movError) {
    console.error(`❌ Error buscando movimientos: ${movError.message}`)
    return
  }

  console.log(`\n🔍 Movimientos USD en cuenta ARS "${arsAccount.name}": ${usdMovements?.length || 0}`)

  if (!usdMovements || usdMovements.length === 0) {
    console.log(`✅ No hay movimientos USD en la cuenta ARS, todo limpio`)
    return
  }

  // Mostrar resumen por tipo
  const byType: Record<string, { count: number; totalUSD: number; totalARS: number }> = {}
  for (const m of usdMovements) {
    if (!byType[m.type]) byType[m.type] = { count: 0, totalUSD: 0, totalARS: 0 }
    byType[m.type].count++
    byType[m.type].totalUSD += parseFloat(m.amount_original) || 0
    byType[m.type].totalARS += parseFloat(m.amount_ars_equivalent) || 0
  }

  console.log(`\n   Desglose por tipo:`)
  for (const [type, stats] of Object.entries(byType)) {
    console.log(`   - ${type}: ${stats.count} movimientos | USD ${stats.totalUSD.toLocaleString("es-AR", { minimumFractionDigits: 2 })} | ARS equiv: ${stats.totalARS.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`)
  }

  const totalOriginal = usdMovements.reduce((sum: number, m: any) => sum + (parseFloat(m.amount_original) || 0), 0)
  const totalARS = usdMovements.reduce((sum: number, m: any) => sum + (parseFloat(m.amount_ars_equivalent) || 0), 0)
  console.log(`\n   TOTAL USD original: USD ${totalOriginal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`)
  console.log(`   TOTAL ARS equivalente (inflando balance): ARS ${totalARS.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`)

  // También mostrar cuántos movimientos ARS quedan en la cuenta
  const { data: arsMovements } = await (supabase.from("ledger_movements") as any)
    .select("id, amount_original, type")
    .eq("account_id", arsAccount.id)
    .eq("currency", "ARS")

  if (arsMovements) {
    const arsTotal = arsMovements.reduce((sum: number, m: any) => sum + (parseFloat(m.amount_original) || 0), 0)
    console.log(`\n   Movimientos ARS que quedarían en cuenta ARS: ${arsMovements.length} | ARS ${arsTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`)
  }

  // Obtener o crear cuenta USD
  let usdAccount = financialAccounts.find((fa: any) => fa.currency === "USD")

  if (!usdAccount) {
    console.log(`\n🆕 Creando cuenta ${accountNamePattern} USD...`)
    if (!isDryRun) {
      const { data: newFA, error: createError } = await (supabase.from("financial_accounts") as any)
        .insert({
          name: `${accountNamePattern} USD`,
          type: arsAccount.type || "ASSETS",
          currency: "USD",
          chart_account_id: arsAccount.chart_account_id, // Mismo chart_account_id que la ARS
          initial_balance: 0,
          is_active: true,
        })
        .select("id, name, currency")
        .single()

      if (createError) {
        console.error(`❌ Error creando cuenta: ${createError.message}`)
        return
      }
      usdAccount = newFA
      console.log(`   ✅ Creada: ${newFA.name} → ${newFA.id.slice(0, 8)}`)
    } else {
      console.log(`   [DRY RUN] Se crearía "${accountNamePattern} USD" con chart_account_id: ${arsAccount.chart_account_id}`)
    }
  } else {
    console.log(`\n✓ Cuenta USD ya existe: ${usdAccount.name} → ${usdAccount.id.slice(0, 8)}`)
  }

  // Mover movimientos USD a la cuenta USD
  if (!isDryRun && usdAccount) {
    const movementIds = usdMovements.map((m: any) => m.id)

    const { error: updateError } = await (supabase.from("ledger_movements") as any)
      .update({ account_id: usdAccount.id })
      .in("id", movementIds)

    if (updateError) {
      console.error(`❌ Error moviendo movimientos: ${updateError.message}`)
      return
    }

    console.log(`\n✅ ${movementIds.length} movimientos USD reasignados a cuenta "${accountNamePattern} USD"`)
  } else if (isDryRun) {
    console.log(`\n[DRY RUN] Se moverían ${usdMovements.length} movimientos USD a la cuenta USD`)
  }

  // Renombrar la cuenta ARS si se llama genérico (sin " ARS")
  if (!arsAccount.name.includes("ARS") && !isDryRun) {
    await (supabase.from("financial_accounts") as any)
      .update({ name: `${arsAccount.name} ARS` })
      .eq("id", arsAccount.id)
    console.log(`📝 Renombrada cuenta: "${arsAccount.name}" → "${arsAccount.name} ARS"`)
  }
}

async function main() {
  console.log("🔧 Fix: Separar CpC y CpP por moneda (ARS / USD)")
  console.log(`   Modo: ${isDryRun ? "🔍 DRY RUN (sin cambios)" : "⚡ EJECUCIÓN REAL"}`)

  await fixCurrencySplit("Cuentas por Cobrar")
  await fixCurrencySplit("Cuentas por Pagar")

  console.log(`\n${"═".repeat(60)}`)
  console.log("✅ Proceso completado")
  if (isDryRun) {
    console.log("💡 Ejecutar sin --dry-run para aplicar los cambios")
  }
}

main().catch(console.error)
