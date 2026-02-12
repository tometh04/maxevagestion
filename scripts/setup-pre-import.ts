/**
 * =============================================================================
 * SCRIPT DE SETUP PRE-IMPORTACIÓN - ERP LOZADA (Rosario)
 * =============================================================================
 *
 * Este script prepara el sistema antes de la importación masiva:
 *
 *   1. Crea los vendedores con sus comisiones y roles
 *   2. Crea las cuentas financieras con saldos iniciales
 *   3. Limpia datos existentes (operaciones, clientes, pagos, contabilidad)
 *      SIN tocar leads de Trello/ManyChat
 *
 * USO:
 *   npx tsx scripts/setup-pre-import.ts [--dry-run] [--sellers] [--accounts] [--clean]
 *
 * OPCIONES:
 *   --dry-run    Muestra lo que haría sin ejecutar
 *   --sellers    Solo crear vendedores
 *   --accounts   Solo crear cuentas financieras
 *   --clean      Solo limpiar datos
 *   (sin flags)  Ejecuta todo: sellers + accounts + clean
 * =============================================================================
 */

import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import { config } from 'dotenv'

config({ path: path.join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// ─── VENDEDORES A CREAR ─────────────────────────────────────────────────────

interface SellerConfig {
  name: string
  email: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'CONTABLE' | 'SELLER' | 'VIEWER'
  commission: number // porcentaje
}

const SELLERS: SellerConfig[] = [
  { name: 'Maximiliano Di Franco', email: 'maximiliano@agencialozada.com', role: 'SUPER_ADMIN', commission: 50 },
  { name: 'Santiago Nader', email: 'santiago@agencialozada.com', role: 'SUPER_ADMIN', commission: 35 },
  { name: 'Ramiro Airaldi', email: 'ramiro@agencialozada.com', role: 'SELLER', commission: 45 },
  { name: 'Micaela Nader', email: 'micaela@agencialozada.com', role: 'SELLER', commission: 35 },
  { name: 'Josefina Giordano', email: 'josefina@agencialozada.com', role: 'SELLER', commission: 20 },
  { name: 'Candela Bertolotto', email: 'candela@agencialozada.com', role: 'SELLER', commission: 15 },
  { name: 'Emilia Roca', email: 'emiliaroca@agencialozada.com', role: 'SELLER', commission: 15 },
  { name: 'Emilia Di Vito', email: 'emiliadivito@agencialozada.com', role: 'SELLER', commission: 13 },
  { name: 'Malena Rodriguez', email: 'malena@agencialozada.com', role: 'SELLER', commission: 13 },
  { name: 'Yamil Isnaldo', email: 'yamil@agencialozada.com', role: 'ADMIN', commission: 20 },
  { name: 'Martina Schiriatti', email: 'martina@agencialozada.com', role: 'SELLER', commission: 10 },
  { name: 'Julieta Suarez', email: 'julieta@agencialozada.com', role: 'SELLER', commission: 50 },
]

// ─── CUENTAS FINANCIERAS A CREAR ────────────────────────────────────────────

interface AccountConfig {
  name: string
  type: string
  currency: 'ARS' | 'USD'
  initial_balance: number
}

// Nota: Los saldos en ARS con puntos como separador de miles y coma como decimal
// ya están convertidos aquí a números
const FINANCIAL_ACCOUNTS: AccountConfig[] = [
  // USD
  { name: 'Caja USD', type: 'CASH_USD', currency: 'USD', initial_balance: 58784 },
  { name: 'Banco Galicia USD', type: 'CHECKING_USD', currency: 'USD', initial_balance: 37878.30 },
  { name: 'FTA Banco USD', type: 'CHECKING_USD', currency: 'USD', initial_balance: 1800 },
  { name: 'Delfos USD', type: 'CHECKING_USD', currency: 'USD', initial_balance: 560 },
  { name: 'Fiwind USD', type: 'CHECKING_USD', currency: 'USD', initial_balance: 0 },
  { name: 'Banco Maxeva USD', type: 'CHECKING_USD', currency: 'USD', initial_balance: 764 },
  { name: 'MSC Cruceros USD', type: 'CHECKING_USD', currency: 'USD', initial_balance: 4108 },
  { name: 'Fifteen USD', type: 'CHECKING_USD', currency: 'USD', initial_balance: 1614 },
  // ARS
  { name: 'Caja Pesos', type: 'CASH_ARS', currency: 'ARS', initial_balance: 4119515 },
  { name: 'Banco Galicia Pesos', type: 'CHECKING_ARS', currency: 'ARS', initial_balance: 4091293.44 },
  { name: 'Banco Santi Pesos', type: 'CHECKING_ARS', currency: 'ARS', initial_balance: 8614336 },
  { name: 'FTA Banco Pesos', type: 'CHECKING_ARS', currency: 'ARS', initial_balance: 0 },
  { name: 'Tarj. de Credito', type: 'CREDIT_CARD', currency: 'ARS', initial_balance: 377500 },
  { name: 'Banco Maxeva Pesos', type: 'CHECKING_ARS', currency: 'ARS', initial_balance: 12908599 },
]

// ─── Mapeo tipo → chart_of_accounts code ────────────────────────────────────

const TYPE_TO_CHART_CODE: Record<string, string> = {
  CASH_ARS: '1.1.01',
  CASH_USD: '1.1.01',
  CHECKING_ARS: '1.1.02',
  CHECKING_USD: '1.1.02',
  SAVINGS_ARS: '1.1.02',
  SAVINGS_USD: '1.1.02',
  CREDIT_CARD: '1.1.04',
  ASSETS: '1.1.05',
}

// ─── FUNCIONES ──────────────────────────────────────────────────────────────

async function getAgencyId(): Promise<string> {
  const { data: agency } = await supabase
    .from('agencies')
    .select('id, name')
    .ilike('name', '%rosario%')
    .single()

  if (!agency) {
    console.error('Agencia "Rosario" no encontrada')
    const { data: all } = await supabase.from('agencies').select('id, name')
    all?.forEach((a: any) => console.log(`   - ${a.name} (${a.id})`))
    process.exit(1)
  }

  console.log(`Agencia: ${(agency as any).name} (${(agency as any).id})`)
  return (agency as any).id
}

// ─── CREAR VENDEDORES ───────────────────────────────────────────────────────

async function createSellers(dryRun: boolean) {
  console.log('\n' + '='.repeat(60))
  console.log('  CREANDO VENDEDORES')
  console.log('='.repeat(60))

  const agencyId = await getAgencyId()

  // Verificar vendedores existentes
  const { data: existingUsers } = await supabase.from('users').select('id, name, email')
  const existingEmails = new Set((existingUsers || []).map((u: any) => u.email.toLowerCase()))

  console.log(`\nVendedores existentes: ${existingUsers?.length || 0}`)
  existingUsers?.forEach((u: any) => console.log(`   - ${u.name} (${u.email})`))

  let created = 0
  let skipped = 0

  for (const seller of SELLERS) {
    if (existingEmails.has(seller.email.toLowerCase())) {
      console.log(`   SKIP: ${seller.name} (${seller.email}) - ya existe`)
      skipped++
      continue
    }

    if (dryRun) {
      console.log(`   [DRY] Crear: ${seller.name} | ${seller.email} | ${seller.role} | Comision: ${seller.commission}%`)
      created++
      continue
    }

    try {
      // 1. Crear usuario en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: seller.email,
        password: 'lozada123', // Password temporal
        email_confirm: true, // Confirmar email automáticamente
        user_metadata: {
          name: seller.name,
          role: seller.role,
        },
      })

      if (authError || !authData.user) {
        console.error(`   ERROR Auth ${seller.name}: ${authError?.message}`)
        continue
      }

      // 2. Crear registro en tabla users
      const { data: userData, error: userError } = await (supabase.from('users') as any)
        .insert({
          auth_id: authData.user.id,
          name: seller.name,
          email: seller.email,
          role: seller.role,
          is_active: true,
          default_commission_percentage: seller.commission,
        })
        .select('id')
        .single()

      if (userError || !userData) {
        console.error(`   ERROR Users table ${seller.name}: ${userError?.message}`)
        // Cleanup: eliminar de auth si falla la tabla users
        await supabase.auth.admin.deleteUser(authData.user.id)
        continue
      }

      // 3. Vincular con agencia
      await (supabase.from('user_agencies') as any)
        .insert({
          user_id: (userData as any).id,
          agency_id: agencyId,
        })

      console.log(`   OK: ${seller.name} | ${seller.role} | ${seller.commission}% | ID: ${(userData as any).id.slice(0, 8)}`)
      created++
    } catch (err: any) {
      console.error(`   ERROR ${seller.name}: ${err.message}`)
    }
  }

  console.log(`\nResultado: ${created} creados, ${skipped} ya existian`)
}

// ─── CREAR CUENTAS FINANCIERAS ──────────────────────────────────────────────

async function createFinancialAccounts(dryRun: boolean) {
  console.log('\n' + '='.repeat(60))
  console.log('  CREANDO CUENTAS FINANCIERAS')
  console.log('='.repeat(60))

  const agencyId = await getAgencyId()

  // Obtener primer usuario como created_by
  const { data: users } = await supabase.from('users').select('id').limit(1)
  const createdBy = (users as any)?.[0]?.id

  // Cargar chart_of_accounts para mapear tipos
  const { data: chartAccounts } = await (supabase.from('chart_of_accounts') as any)
    .select('id, account_code')
    .eq('is_active', true)

  const chartMap = new Map<string, string>()
  ;(chartAccounts || []).forEach((ca: any) => chartMap.set(ca.account_code, ca.id))

  // Verificar cuentas existentes
  const { data: existingAccounts } = await (supabase.from('financial_accounts') as any)
    .select('id, name, currency, initial_balance')
    .eq('agency_id', agencyId)
    .eq('is_active', true)

  const existingNames = new Set((existingAccounts || []).map((a: any) => a.name.toLowerCase()))

  console.log(`\nCuentas existentes: ${existingAccounts?.length || 0}`)
  existingAccounts?.forEach((a: any) => console.log(`   - ${a.name} (${a.currency}) $${a.initial_balance}`))

  let created = 0
  let skipped = 0

  for (const account of FINANCIAL_ACCOUNTS) {
    if (existingNames.has(account.name.toLowerCase())) {
      console.log(`   SKIP: ${account.name} - ya existe`)
      skipped++
      continue
    }

    const chartCode = TYPE_TO_CHART_CODE[account.type]
    const chartAccountId = chartCode ? chartMap.get(chartCode) : null

    if (dryRun) {
      console.log(`   [DRY] Crear: ${account.name} | ${account.type} | ${account.currency} | Saldo: ${account.initial_balance.toLocaleString('es-AR')} | Chart: ${chartCode || 'N/A'}`)
      created++
      continue
    }

    try {
      const { data: newAccount, error } = await (supabase.from('financial_accounts') as any)
        .insert({
          name: account.name,
          type: account.type,
          currency: account.currency,
          initial_balance: account.initial_balance,
          agency_id: agencyId,
          is_active: true,
          created_by: createdBy,
          chart_account_id: chartAccountId || null,
        })
        .select('id')
        .single()

      if (error || !newAccount) {
        console.error(`   ERROR ${account.name}: ${error?.message}`)
        continue
      }

      console.log(`   OK: ${account.name} | ${account.currency} | Saldo: ${account.initial_balance.toLocaleString('es-AR')} | ID: ${(newAccount as any).id.slice(0, 8)}`)
      created++
    } catch (err: any) {
      console.error(`   ERROR ${account.name}: ${err.message}`)
    }
  }

  console.log(`\nResultado: ${created} creadas, ${skipped} ya existian`)
}

// ─── LIMPIAR SISTEMA ────────────────────────────────────────────────────────

async function cleanSystem(dryRun: boolean) {
  console.log('\n' + '='.repeat(60))
  console.log('  LIMPIANDO SISTEMA (sin tocar leads)')
  console.log('='.repeat(60))

  // Tablas a limpiar en orden (por dependencias FK)
  // NO incluye: leads, agencies, users, user_agencies, chart_of_accounts,
  //             financial_accounts, settings_trello, manychat_list_order
  const tablesToClean = [
    'commission_records',
    'commission_details',
    'commissions',
    'iva_sales',
    'iva_purchases',
    'operator_payments',
    'ledger_movements',
    'cash_movements',
    'cash_transfers',
    'card_transactions',
    'payments',
    'operation_operators',
    'operation_customers',
    'operation_passengers',
    'operations',
    'quotation_items',
    'quotations',
    'customers',
    'operators',
  ]

  for (const table of tablesToClean) {
    if (dryRun) {
      // Contar registros
      const { count } = await (supabase.from(table) as any)
        .select('*', { count: 'exact', head: true })
      console.log(`   [DRY] Limpiar: ${table} (${count || 0} registros)`)
      continue
    }

    try {
      const { error } = await (supabase.from(table) as any)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      if (error) {
        console.error(`   ERROR ${table}: ${error.message}`)
      } else {
        console.log(`   OK: ${table} limpio`)
      }
    } catch (err: any) {
      console.error(`   ERROR ${table}: ${err.message}`)
    }
  }

  // También limpiar financial_accounts existentes (excepto las que acabamos de crear)
  // NO - las cuentas financieras las creamos nuevas, no las limpiamos
  // El usuario quiere limpiar datos transaccionales, no las cuentas en sí

  console.log('\n   Tablas NO tocadas (preservadas):')
  console.log('   - leads (Trello + ManyChat)')
  console.log('   - agencies')
  console.log('   - users + user_agencies')
  console.log('   - chart_of_accounts')
  console.log('   - financial_accounts')
  console.log('   - settings_trello')
  console.log('   - manychat_list_order')
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const onlySellers = args.includes('--sellers')
  const onlyAccounts = args.includes('--accounts')
  const onlyClean = args.includes('--clean')
  const runAll = !onlySellers && !onlyAccounts && !onlyClean

  console.log('='.repeat(60))
  console.log('  SETUP PRE-IMPORTACION - ERP LOZADA (Rosario)')
  console.log('='.repeat(60))
  console.log(`Modo: ${dryRun ? 'DRY-RUN (sin ejecutar)' : 'REAL'}`)
  console.log(`Tareas: ${runAll ? 'TODAS' : [onlySellers && 'sellers', onlyAccounts && 'accounts', onlyClean && 'clean'].filter(Boolean).join(', ')}`)

  if (runAll || onlySellers) {
    await createSellers(dryRun)
  }

  if (runAll || onlyAccounts) {
    await createFinancialAccounts(dryRun)
  }

  if (runAll || onlyClean) {
    await cleanSystem(dryRun)
  }

  console.log('\n' + '='.repeat(60))
  console.log(dryRun ? '  DRY-RUN COMPLETADO' : '  SETUP COMPLETADO')
  console.log('='.repeat(60) + '\n')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nERROR FATAL:', err)
    process.exit(1)
  })
