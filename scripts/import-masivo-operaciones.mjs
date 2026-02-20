/**
 * =============================================================================
 * SCRIPT DE IMPORTACIÓN MASIVA DE OPERACIONES - ERP LOZADA
 * =============================================================================
 *
 * Este script importa operaciones desde un CSV completado por Maxi.
 * Por cada fila crea:
 *
 *   1. Cliente (si no existe, deduplicado por email o nombre)
 *   2. Operador 1, 2, 3 (si no existen, deduplicados por nombre)
 *   3. Operación completa con márgenes calculados
 *   4. operation_customers (vinculación cliente ↔ operación)
 *   5. operation_operators (vinculación operador ↔ operación con costos)
 *   6. Ledger Movement INCOME → Cuentas por Cobrar (1.1.03)
 *   7. Ledger Movement EXPENSE → Cuentas por Pagar (2.1.01)
 *   8. IVA Venta (21% sobre margen)
 *   9. IVA Compra (por cada operador, sobre su costo)
 *  10. Operator Payments (deuda pendiente con cada operador)
 *  11. Payment INCOME PAID (si Monto Cobrado > 0)
 *  12. Payment EXPENSE PAID (si Pagado a Operador > 0)
 *  13. Payment INCOME PENDING (si queda pendiente de cobrar)
 *  14. Ledger movements para cobros/pagos ya realizados
 *
 * USO:
 *   npx tsx scripts/import-masivo-operaciones.ts <ruta-csv> [--dry-run] [--clear]
 *
 * OPCIONES:
 *   --dry-run   Valida todo sin insertar nada en la BD
 *   --clear     Elimina TODAS las operaciones antes de importar (PELIGROSO)
 *
 * COLUMNAS ESPERADAS DEL CSV:
 *   Código, Fecha Operación, Nombre del Cliente, Email Cliente, Destino,
 *   Fecha Salida, Fecha Regreso, Adultos, Niños, Monto Venta, Monto Cobrado,
 *   Pendiente de Cobrar, Monto Operador, Pagado a Operador, Pendiente a Operador,
 *   Operador 1, Costo Operador 1, Operador 2, Costo Operador 2,
 *   Operador 3, Costo Operador 3, Moneda, Estado, Nombre Vendedor
 * =============================================================================
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))
import { config } from 'dotenv'

// ─── Config ──────────────────────────────────────────────────────────────────

config({ path: join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// ─── Configuración de importación ────────────────────────────────────────────

const CONFIG = {
  // Tipo de cambio USD → ARS (Maxi define este valor)
  EXCHANGE_RATE_USD: 1450,

  // Cuenta financiera para cobros/pagos realizados
  // Se usa "Banco Principal" (tipo BANK). Si no existe, se crea.
  DEFAULT_PAYMENT_METHOD: 'Transferencia',
  DEFAULT_LEDGER_METHOD: 'BANK',

  // Nombre de agencia para buscar
  AGENCY_NAME: 'rosario',

  // Estado por defecto si no viene en el Excel
  DEFAULT_STATUS: 'CONFIRMED',

  // Tipo de operación por defecto
  DEFAULT_TYPE: 'PACKAGE',
  DEFAULT_PRODUCT_TYPE: 'PAQUETE',

  // Adultos/niños por defecto
  DEFAULT_ADULTS: 1,
  DEFAULT_CHILDREN: 0,
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

// ─── Parseo de CSV ───────────────────────────────────────────────────────────

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  // Remover BOM si existe
  const cleanContent = content.replace(/^\uFEFF/, '')
  const lines = cleanContent.split('\n').filter(line => line.trim())

  if (lines.length < 2) {
    throw new Error('CSV vacío o sin datos')
  }

  // Parsear header
  const headers = parseCSVLine(lines[0]).map(h =>
    h.trim()
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
  )

  // Mapeo flexible de columnas
  const columnMap = {
    'codigo': 'codigo',
    'codigo_operacion': 'codigo',
    'fecha_operacion': 'fecha_operacion',
    'fecha_de_operacion': 'fecha_operacion',
    'nombre_del_cliente': 'nombre_del_cliente',
    'nombre_cliente': 'nombre_del_cliente',
    'cliente': 'nombre_del_cliente',
    'email_cliente': 'email_cliente',
    'email': 'email_cliente',
    'destino': 'destino',
    'fecha_salida': 'fecha_salida',
    'fecha_de_salida': 'fecha_salida',
    'salida': 'fecha_salida',
    'fecha_regreso': 'fecha_regreso',
    'fecha_de_regreso': 'fecha_regreso',
    'regreso': 'fecha_regreso',
    'adultos': 'adultos',
    'ninos': 'ninos',
    'ninos_': 'ninos',
    'monto_venta': 'monto_venta',
    'venta': 'monto_venta',
    'monto_cobrado': 'monto_cobrado',
    'cobrado': 'monto_cobrado',
    'pendiente_de_cobrar': 'pendiente_de_cobrar',
    'pendiente_cobrar': 'pendiente_de_cobrar',
    'monto_operador': 'monto_operador',
    'costo_operador': 'monto_operador',
    'operador': 'monto_operador',
    'pagado_a_operador': 'pagado_a_operador',
    'pagado_operador': 'pagado_a_operador',
    'pendiente_a_operador': 'pendiente_a_operador',
    'pendiente_operador': 'pendiente_a_operador',
    'operador_1': 'operador_1',
    'costo_operador_1': 'costo_operador_1',
    'operador_2': 'operador_2',
    'costo_operador_2': 'costo_operador_2',
    'operador_3': 'operador_3',
    'costo_operador_3': 'costo_operador_3',
    'moneda': 'moneda',
    'currency': 'moneda',
    'estado': 'estado',
    'status': 'estado',
    'nombre_vendedor': 'nombre_vendedor',
    'vendedor': 'nombre_vendedor',
  }

  const rows = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const row = {}

    headers.forEach((header, index) => {
      const mappedKey = columnMap[header] || header
      const value = values[index]?.replace(/^"|"$/g, '').trim() || ''
      row[mappedKey] = value || undefined
    })

    // Solo agregar si tiene al menos destino o cliente
    if (row.destino || row.nombre_del_cliente) {
      rows.push(row)
    }
  }

  return rows
}

function parseCSVLine(line) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else if (char !== '\r') {
      current += char
    }
  }
  values.push(current.trim())

  return values
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

function cleanAmount(amount) {
  if (!amount) return 0
  // El CSV usa formato USD americano: "$13,680" donde la coma es separador de miles
  // NO es formato argentino (donde la coma sería decimal)
  const cleaned = amount
    .replace(/[$\s"]/g, '') // Remover $, espacios, comillas
    .replace(/,/g, '')      // Remover comas (separador de miles en formato US)
  // Si tiene un punto, es decimal (ej: 1500.50)
  return parseFloat(cleaned) || 0
}

function parseDate(dateStr) {
  if (!dateStr || !dateStr.trim()) return null

  let str = dateStr.trim().replace(/\/\/+/g, '/').replace(/\s+/g, '')

  // Formato YYYY-MM-DD o YYYY/MM/DD
  if (/^\d{4}[-\/]/.test(str)) {
    const parts = str.split(/[\/\-]/)
    if (parts.length >= 3) {
      const year = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10)
      const day = parseInt(parts[2], 10)
      if (!isNaN(year) && !isNaN(month) && !isNaN(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      }
    }
  }

  // Formato DD/MM/YYYY o DD-MM-YYYY
  const parts = str.split(/[\/\-]/)
  if (parts.length >= 3) {
    const day = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10)
    const year = parseInt(parts[2], 10)

    if (!isNaN(day) && !isNaN(month) && !isNaN(year) && day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      // Si el año es de 2 dígitos, asumir 2000+
      const fullYear = year < 100 ? 2000 + year : year
      return `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // Formato DD/MM (sin año) → asumir 2026
  if (parts.length === 2) {
    const day = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10)
    if (!isNaN(day) && !isNaN(month) && day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  return null
}

function splitName(fullName) {
  if (!fullName || !fullName.trim()) {
    return { first_name: 'Sin nombre', last_name: '-' }
  }
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: '-' }
  }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' ')
  }
}

function normalizeString(str) {
  return str.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remover acentos
}

function mapStatus(estado) {
  if (!estado || !estado.trim()) return CONFIG.DEFAULT_STATUS

  const normalized = normalizeString(estado)

  const statusMap = {
    'confirmada': 'CONFIRMED',
    'confirmed': 'CONFIRMED',
    'reservada': 'RESERVED',
    'reserved': 'RESERVED',
    'pre-reserva': 'RESERVED',
    'pre_reserva': 'RESERVED',
    'prereserva': 'RESERVED',
    'pre_reservation': 'RESERVED',
    'cancelada': 'CANCELLED',
    'cancelled': 'CANCELLED',
    'canceled': 'CANCELLED',
    'viajado': 'TRAVELLED',
    'travelled': 'TRAVELLED',
    'viajando': 'TRAVELLED',
    'travelling': 'TRAVELLED',
    'cerrada': 'TRAVELLED',
    'closed': 'TRAVELLED',
    'en curso': 'CONFIRMED',
    'pendiente': 'RESERVED',
  }

  return statusMap[normalized] || CONFIG.DEFAULT_STATUS
}

function generateFileCode() {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `OP-${dateStr}-${random}`
}

// ─── Funciones de BD ─────────────────────────────────────────────────────────

// Mapeo de apodos/aliases → nombre real del vendedor en el sistema
const SELLER_ALIASES = {
  'rama': 'Ramiro Airaldi',
  'naza': 'Yamil Isnaldo',  // TODO: confirmar con usuario
  'pau': 'Martina Schiriatti', // TODO: confirmar con usuario
  'ana': 'Julieta Suarez', // TODO: confirmar con usuario
  'ana silva': 'Julieta Suarez', // TODO: confirmar con usuario
  'nico trip': 'Santiago Nader', // TODO: confirmar con usuario
  'yama': 'Yamil Isnaldo',
  'emi roca': 'Emilia Roca',
  'emi di vito': 'Emilia Di Vito',
  'emi di Vito': 'Emilia Di Vito',
  'emi Di Vito': 'Emilia Di Vito',
  'emi Di vito': 'Emilia Di Vito',
}

async function findSellerByName(sellerName, sellerCache) {
  if (!sellerName) return null

  // Normalizar: "Cande - Rama" → buscar "Cande" y "Rama"
  const parts = sellerName.split(/[-–—]/).map(p => normalizeString(p))

  for (const part of parts) {
    if (!part) continue

    // Primero buscar en aliases
    const aliasTarget = SELLER_ALIASES[part]
    if (aliasTarget) {
      for (const [key, seller] of sellerCache.entries()) {
        if (normalizeString(key) === normalizeString(aliasTarget)) return seller.id
      }
    }

    // Buscar exacto
    for (const [key, seller] of sellerCache.entries()) {
      if (normalizeString(key) === part) return seller.id
    }
    // Buscar parcial (contiene)
    for (const [key, seller] of sellerCache.entries()) {
      const normalizedKey = normalizeString(key)
      if (normalizedKey.includes(part) || part.includes(normalizedKey)) {
        return seller.id
      }
    }
  }

  // Buscar el nombre completo por alias
  const fullNormalized = normalizeString(sellerName)
  const fullAliasTarget = SELLER_ALIASES[fullNormalized]
  if (fullAliasTarget) {
    for (const [key, seller] of sellerCache.entries()) {
      if (normalizeString(key) === normalizeString(fullAliasTarget)) return seller.id
    }
  }

  // También buscar el nombre completo por parcial
  for (const [key, seller] of sellerCache.entries()) {
    const normalizedKey = normalizeString(key)
    if (normalizedKey.includes(fullNormalized) || fullNormalized.includes(normalizedKey)) {
      return seller.id
    }
  }

  return null
}

// Corregir typos conocidos en nombres de operadores
function fixOperatorName(name) {
  const fixes = {
    'asisst card': 'Assist Card',
    'assist card': 'Assist Card',
    'asist card': 'Assist Card',
    'universal': 'Universal',
    'delfos': 'Delfos',
    'lozada': 'Lozada',
    'eurovips': 'Eurovips',
    'tucano': 'Tucano',
  }
  const lower = name.trim().toLowerCase()
  return fixes[lower] || name.trim()
}

async function findOrCreateOperator(operatorName, operatorCache, supabase, dryRun, stats) {
  if (!operatorName || !operatorName.trim()) return null

  // Corregir typos conocidos
  const fixedName = fixOperatorName(operatorName)
  const normalized = normalizeString(fixedName)

  // Buscar en cache
  for (const [key, id] of operatorCache.entries()) {
    if (normalizeString(key) === normalized) return id
  }

  if (dryRun) {
    // En dry run, simular creación
    const fakeId = `dry-run-operator-${normalized}`
    operatorCache.set(fixedName, fakeId)
    stats.operatorsCreated++
    return fakeId
  }

  // Crear nuevo operador
  const { data: newOperator, error } = await supabase
    .from('operators')
    .insert({ name: fixedName })
    .select('id')
    .single()

  if (error || !newOperator) {
    console.error(`   ❌ Error creando operador "${fixedName}":`, error?.message)
    return null
  }

  operatorCache.set(fixedName, (newOperator).id)
  stats.operatorsCreated++
  return (newOperator).id
}

async function findOrCreateCustomer(customerName, customerEmail, customerCache, supabase, dryRun, stats) {
  if (!customerName || !customerName.trim()) return null

  // 1. Buscar por email
  if (customerEmail && customerEmail.trim()) {
    const emailKey = customerEmail.toLowerCase().trim()
    for (const [key, cust] of customerCache.entries()) {
      if (key === emailKey) return cust.id
    }
  }

  // 2. Buscar por nombre exacto
  const { first_name, last_name } = splitName(customerName)
  const nameKey = `${first_name}|${last_name}`.toLowerCase()
  for (const [key, cust] of customerCache.entries()) {
    if (key === nameKey) return cust.id
  }

  if (dryRun) {
    const fakeId = `dry-run-customer-${nameKey}`
    const emailKey = customerEmail?.toLowerCase().trim()
    if (emailKey) customerCache.set(emailKey, { id: fakeId, email: emailKey })
    customerCache.set(nameKey, { id: fakeId })
    stats.customersCreated++
    return fakeId
  }

  // 3. Buscar en BD por email
  if (customerEmail && customerEmail.trim()) {
    const { data: existingByEmail } = await supabase
      .from('customers')
      .select('id')
      .eq('email', customerEmail.trim().toLowerCase())
      .maybeSingle()

    if (existingByEmail) {
      const id = (existingByEmail).id
      customerCache.set(customerEmail.toLowerCase().trim(), { id })
      customerCache.set(nameKey, { id })
      return id
    }
  }

  // 4. Buscar en BD por nombre
  const { data: existingByName } = await supabase
    .from('customers')
    .select('id')
    .eq('first_name', first_name)
    .eq('last_name', last_name)
    .maybeSingle()

  if (existingByName) {
    const id = (existingByName).id
    if (customerEmail) customerCache.set(customerEmail.toLowerCase().trim(), { id })
    customerCache.set(nameKey, { id })
    return id
  }

  // 5. Crear cliente
  const email = customerEmail?.trim() || `${first_name.toLowerCase().replace(/\s/g, '')}.${last_name.toLowerCase().replace(/\s/g, '')}@importado.temp`

  const { data: newCustomer, error } = await supabase
    .from('customers')
    .insert({
      first_name,
      last_name,
      email,
      phone: '-',
    })
    .select('id')
    .single()

  if (error || !newCustomer) {
    console.error(`   ❌ Error creando cliente "${customerName}":`, error?.message)
    return null
  }

  const id = (newCustomer).id
  if (customerEmail) customerCache.set(customerEmail.toLowerCase().trim(), { id, email })
  customerCache.set(nameKey, { id })
  stats.customersCreated++
  return id
}

// ─── Obtener o crear cuentas financieras ─────────────────────────────────────

async function getOrCreateFinancialAccount(supabase, chartAccountCode, accountName, currency, userId) {
  // Buscar chart_of_accounts por código
  const { data: chartAccount } = await (supabase.from('chart_of_accounts'))
    .select('id')
    .eq('account_code', chartAccountCode)
    .eq('is_active', true)
    .maybeSingle()

  if (!chartAccount) {
    throw new Error(`Cuenta contable ${chartAccountCode} (${accountName}) no encontrada en chart_of_accounts`)
  }

  // Buscar financial_account asociada
  const { data: existing } = await (supabase.from('financial_accounts'))
    .select('id')
    .eq('chart_account_id', chartAccount.id)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) return existing.id

  // Crear si no existe
  const { data: newAccount, error } = await (supabase.from('financial_accounts'))
    .insert({
      name: accountName,
      type: 'ASSETS',
      currency,
      chart_account_id: chartAccount.id,
      initial_balance: 0,
      is_active: true,
      created_by: userId,
    })
    .select('id')
    .single()

  if (error || !newAccount) {
    throw new Error(`Error creando financial_account para ${accountName}: ${error?.message}`)
  }

  return newAccount.id
}

async function getOrCreateBankAccount(supabase, currency, userId) {
  const type = currency === 'ARS' ? 'CHECKING_ARS' : 'CHECKING_USD'
  const name = currency === 'ARS' ? 'Banco Principal ARS' : 'Banco Principal USD'

  // Buscar cuenta existente
  const { data: existing } = await (supabase.from('financial_accounts'))
    .select('id')
    .eq('type', type)
    .eq('currency', currency)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existing) return existing.id

  // Crear si no existe
  const { data: newAccount, error } = await (supabase.from('financial_accounts'))
    .insert({
      name,
      type,
      currency,
      initial_balance: 0,
      is_active: true,
      created_by: userId,
    })
    .select('id')
    .single()

  if (error || !newAccount) {
    throw new Error(`Error creando cuenta bancaria ${name}: ${error?.message}`)
  }

  console.log(`   ✅ Cuenta bancaria creada: ${name}`)
  return newAccount.id
}

// ─── Limpieza masiva ─────────────────────────────────────────────────────────

async function clearAllData(supabase) {
  console.log('\n🗑️  ELIMINANDO TODOS LOS DATOS EXISTENTES...')

  const tables = [
    'commission_records',
    'iva_sales',
    'iva_purchases',
    'operator_payments',
    'ledger_movements',
    'payments',
    'operation_operators',
    'operation_customers',
    'operations',
  ]

  for (const table of tables) {
    const { error } = await (supabase.from(table))
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (error) {
      console.error(`   ⚠️  Error eliminando ${table}: ${error.message}`)
    } else {
      console.log(`   ✅ ${table} limpio`)
    }
  }

  console.log('✅ Limpieza completada\n')
}

// ─── Función principal de importación ────────────────────────────────────────

async function importOperations(csvFilePath, dryRun, clearExisting) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  IMPORTACIÓN MASIVA DE OPERACIONES - ERP LOZADA')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`📂 Archivo: ${csvFilePath}`)
  console.log(`🔧 Modo: ${dryRun ? '🟡 DRY-RUN (sin insertar)' : '🟢 REAL (inserta en BD)'}`)
  console.log(`🗑️  Limpiar existentes: ${clearExisting ? 'SÍ' : 'NO'}`)
  console.log(`💱 Tipo de cambio USD: ${CONFIG.EXCHANGE_RATE_USD}`)
  console.log('')

  // Verificar que el archivo existe
  if (!fs.existsSync(csvFilePath)) {
    console.error(`❌ Archivo no encontrado: ${csvFilePath}`)
    process.exit(1)
  }

  // Parsear CSV
  const rows = parseCSV(csvFilePath)
  console.log(`📊 Filas encontradas: ${rows.length}`)

  if (rows.length === 0) {
    console.error('❌ No se encontraron filas válidas en el CSV')
    process.exit(1)
  }

  // Mostrar preview de columnas detectadas
  const firstRow = rows[0]
  console.log(`📋 Columnas detectadas:`)
  Object.keys(firstRow).forEach(key => {
    const value = (firstRow)[key]
    if (value) console.log(`   • ${key}: "${value}"`)
  })
  console.log('')

  // Conectar a Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Limpiar datos si se solicita
  if (clearExisting && !dryRun) {
    await clearAllData(supabase)
  }

  // ─── Obtener agencia ─────────────────────────────────────────────────────

  const { data: agency } = await supabase
    .from('agencies')
    .select('id, name')
    .ilike('name', `%${CONFIG.AGENCY_NAME}%`)
    .single()

  if (!agency) {
    console.error(`❌ Agencia no encontrada: "${CONFIG.AGENCY_NAME}"`)
    console.log('   Agencias disponibles:')
    const { data: allAgencies } = await supabase.from('agencies').select('id, name')
    allAgencies?.forEach((a) => console.log(`   • ${a.name} (${a.id})`))
    process.exit(1)
  }

  console.log(`✅ Agencia: ${(agency).name} (${(agency).id})`)

  // ─── Cargar caches ────────────────────────────────────────────────────────

  const { data: sellers } = await supabase.from('users').select('id, name, email')
  const { data: operators } = await supabase.from('operators').select('id, name')
  const { data: customers } = await supabase.from('customers').select('id, email, first_name, last_name')

  const sellerCache = new Map()
  ;(sellers || []).forEach((s) => {
    if (s.name) sellerCache.set(s.name, { id: s.id, name: s.name })
  })

  const operatorCache = new Map()
  ;(operators || []).forEach((o) => {
    if (o.name) operatorCache.set(o.name, o.id)
  })

  const customerCache = new Map()
  ;(customers || []).forEach((c) => {
    if (c.email) customerCache.set(c.email.toLowerCase(), { id: c.id, email: c.email })
    const nameKey = `${c.first_name}|${c.last_name}`.toLowerCase()
    customerCache.set(nameKey, { id: c.id })
  })

  console.log(`📋 Cache cargado:`)
  console.log(`   • ${sellerCache.size} vendedores`)
  console.log(`   • ${operatorCache.size} operadores`)
  console.log(`   • ${customerCache.size} clientes`)

  // Mostrar vendedores disponibles
  console.log(`\n👥 Vendedores en el sistema:`)
  sellerCache.forEach((seller, name) => console.log(`   • ${name} (${seller.id.slice(0, 8)})`))

  // ─── Cuentas financieras: NO SE TOCAN ───────────────────────────────────
  // Los saldos de cuentas ya reflejan el estado real del negocio.
  // Este import solo crea registros de datos (operaciones, payments, etc.)
  // sin generar ledger_movements que muevan saldos.
  console.log('\n💰 Cuentas financieras: NO se generarán movimientos contables')

  // ─── Procesar filas ───────────────────────────────────────────────────────

  console.log('\n🚀 Iniciando importación...\n')

  const stats = {
    total: rows.length,
    success: 0,
    errors: 0,
    warnings: 0,
    skipped: 0,
    customersCreated: 0,
    operatorsCreated: 0,
    paymentsCreated: 0,
    ledgerMovementsCreated: 0,
  }

  const results = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2 // +2 porque fila 1 es header y arrays empiezan en 0

    try {
      // ─── Validaciones básicas ─────────────────────────────────────────

      if (!row.destino && !row.nombre_del_cliente) {
        stats.skipped++
        results.push({ row: rowNum, status: 'skipped', message: 'Sin destino ni cliente' })
        continue
      }

      let departureDate = parseDate(row.fecha_salida)
      const returnDate = parseDate(row.fecha_regreso)
      const operationDate = parseDate(row.fecha_operacion) || departureDate

      // Si no hay fecha de salida, usar hoy como fallback (operaciones sin destino/fecha definida)
      if (!departureDate) {
        if (row.fecha_salida && row.fecha_salida.trim()) {
          // Había algo escrito pero no se pudo parsear → warning
          stats.warnings++
          results.push({ row: rowNum, status: 'warning', message: `Fecha de salida inválida: "${row.fecha_salida}" → se usa fecha de hoy` })
        }
        departureDate = new Date().toISOString().split('T')[0]
      }

      // ─── Parsear montos ───────────────────────────────────────────────

      const saleAmount = cleanAmount(row.monto_venta)
      const amountCollected = cleanAmount(row.monto_cobrado)
      const operatorCostTotal = cleanAmount(row.monto_operador)
      const paidToOperator = cleanAmount(row.pagado_a_operador)

      const currency = (row.moneda?.toUpperCase().trim() === 'ARS' ? 'ARS' : 'USD')

      if (saleAmount <= 0) {
        stats.warnings++
        results.push({ row: rowNum, status: 'warning', message: `Monto venta = 0, se importa igual. Cliente: ${row.nombre_del_cliente}` })
      }

      // ─── Operadores ──────────────────────────────────────────────────

      const operatorsList = []

      // Operador 1
      if (row.operador_1 && row.operador_1.trim()) {
        const opId = await findOrCreateOperator(row.operador_1, operatorCache, supabase, dryRun, stats)
        const opCost = cleanAmount(row.costo_operador_1)
        if (opId) {
          operatorsList.push({ operator_id: opId, cost: opCost, name: row.operador_1.trim() })
        }
      }

      // Operador 2
      if (row.operador_2 && row.operador_2.trim()) {
        const opId = await findOrCreateOperator(row.operador_2, operatorCache, supabase, dryRun, stats)
        const opCost = cleanAmount(row.costo_operador_2)
        if (opId) {
          operatorsList.push({ operator_id: opId, cost: opCost, name: row.operador_2.trim() })
        }
      }

      // Operador 3
      if (row.operador_3 && row.operador_3.trim()) {
        const opId = await findOrCreateOperator(row.operador_3, operatorCache, supabase, dryRun, stats)
        const opCost = cleanAmount(row.costo_operador_3)
        if (opId) {
          operatorsList.push({ operator_id: opId, cost: opCost, name: row.operador_3.trim() })
        }
      }

      // Si no hay operadores pero hay costo, crear uno genérico
      if (operatorsList.length === 0 && operatorCostTotal > 0) {
        const genericId = await findOrCreateOperator('Operador Importado', operatorCache, supabase, dryRun, stats)
        if (genericId) {
          operatorsList.push({ operator_id: genericId, cost: operatorCostTotal, name: 'Operador Importado' })
        }
      }

      const sumOfIndividualCosts = operatorsList.reduce((sum, op) => sum + op.cost, 0)
      // Usar columna M (Monto Operador) como costo real total.
      // La suma de costos individuales (Q+S+U) puede ser menor que M.
      // Si M > suma individual, M es la fuente de verdad.
      const calculatedOperatorCost = operatorCostTotal > 0 ? operatorCostTotal : sumOfIndividualCosts

      // ─── Cliente ──────────────────────────────────────────────────────

      const customerId = await findOrCreateCustomer(
        row.nombre_del_cliente,
        row.email_cliente,
        customerCache,
        supabase,
        dryRun,
        stats
      )

      // ─── Vendedor ─────────────────────────────────────────────────────

      const sellerId = await findSellerByName(row.nombre_vendedor, sellerCache)
      if (!sellerId && row.nombre_vendedor) {
        stats.warnings++
        results.push({ row: rowNum, status: 'warning', message: `Vendedor no encontrado: "${row.nombre_vendedor}". Se usa el primero disponible.` })
      }
      const finalSellerId = sellerId || (sellers)?.[0]?.id

      if (!finalSellerId) {
        stats.errors++
        results.push({ row: rowNum, status: 'error', message: 'No hay vendedores en el sistema' })
        continue
      }

      // ─── Calcular márgenes ────────────────────────────────────────────

      const marginAmount = saleAmount - calculatedOperatorCost
      const marginPercentage = saleAmount > 0 ? (marginAmount / saleAmount) * 100 : 0
      const status = mapStatus(row.estado)
      const fileCode = row.codigo?.trim() || generateFileCode()

      // ─── Calcular exchange rate ───────────────────────────────────────

      const exchangeRate = currency === 'USD' ? CONFIG.EXCHANGE_RATE_USD : null
      const saleAmountARS = currency === 'USD' ? saleAmount * CONFIG.EXCHANGE_RATE_USD : saleAmount
      const operatorCostARS = currency === 'USD' ? calculatedOperatorCost * CONFIG.EXCHANGE_RATE_USD : calculatedOperatorCost

      // ─── DRY RUN: solo validar ────────────────────────────────────────

      if (dryRun) {
        stats.success++
        results.push({
          row: rowNum,
          status: 'success',
          message: `✅ [DRY] ${row.nombre_del_cliente || 'Sin cliente'} → ${row.destino || 'Sin destino'} | Venta: ${saleAmount} ${currency} | Cobrado: ${amountCollected} | Operador: ${calculatedOperatorCost} | Pagado: ${paidToOperator} | Vendedor: ${row.nombre_vendedor || '?'} → ${sellerId ? '✅' : '⚠️ fallback'}`,
          fileCode,
        })
        continue
      }

      // ═══════════════════════════════════════════════════════════════════
      // MODO REAL: CREAR TODO EN LA BD
      // ═══════════════════════════════════════════════════════════════════

      // 1. CREAR OPERACIÓN
      const operationData = {
        agency_id: (agency).id,
        seller_id: finalSellerId,
        operator_id: operatorsList[0]?.operator_id || null,
        type: CONFIG.DEFAULT_TYPE,
        product_type: CONFIG.DEFAULT_PRODUCT_TYPE,
        destination: row.destino || 'Sin destino',
        operation_date: operationDate,
        departure_date: departureDate,
        return_date: returnDate || null,
        adults: parseInt(row.adultos || '') || CONFIG.DEFAULT_ADULTS,
        children: parseInt(row.ninos || '') || CONFIG.DEFAULT_CHILDREN,
        infants: 0,
        status,
        sale_amount_total: saleAmount,
        sale_currency: currency,
        operator_cost: calculatedOperatorCost,
        operator_cost_currency: currency,
        currency,
        margin_amount: marginAmount,
        margin_percentage: marginPercentage,
        billing_margin_amount: marginAmount,
        billing_margin_percentage: marginPercentage,
        file_code: fileCode,
      }

      const { data: newOperation, error: opError } = await (supabase.from('operations'))
        .insert(operationData)
        .select('id')
        .single()

      if (opError || !newOperation) {
        stats.errors++
        results.push({ row: rowNum, status: 'error', message: `Error creando operación: ${opError?.message}` })
        continue
      }

      const operationId = newOperation.id

      // 2. OPERATION_CUSTOMERS
      if (customerId) {
        await (supabase.from('operation_customers'))
          .insert({
            operation_id: operationId,
            customer_id: customerId,
            role: 'MAIN',
          })
      }

      // 3. OPERATION_OPERATORS
      // Si hay 1 solo operador, asignarle el costo total (columna M)
      if (operatorsList.length > 0) {
        await (supabase.from('operation_operators'))
          .insert(operatorsList.map((op, idx) => ({
            operation_id: operationId,
            operator_id: op.operator_id,
            cost: operatorsList.length === 1 ? calculatedOperatorCost : op.cost,
            cost_currency: currency,
          })))
      }

      // 4-5. LEDGER MOVEMENTS: NO SE CREAN EN IMPORT INICIAL
      // Los saldos de cuentas financieras ya reflejan el estado real.
      // Solo se crean payments como registro de deudas y cobros históricos.

      // 6. IVA VENTA (21% sobre margen)
      if (saleAmount > 0) {
        const margin = saleAmount - calculatedOperatorCost
        const ivaAmount = margin * 0.21
        const netAmount = margin - ivaAmount

        await (supabase.from('iva_sales'))
          .insert({
            operation_id: operationId,
            sale_amount_total: saleAmount,
            net_amount: Math.round(netAmount * 100) / 100,
            iva_amount: Math.round(ivaAmount * 100) / 100,
            currency,
            sale_date: departureDate,
          })
      }

      // 7. IVA COMPRA (por cada operador)
      for (const op of operatorsList) {
        if (op.cost > 0) {
          const netAmount = op.cost / 1.21
          const ivaAmount = op.cost - netAmount

          await (supabase.from('iva_purchases'))
            .insert({
              operation_id: operationId,
              operator_id: op.operator_id,
              operator_cost_total: op.cost,
              net_amount: Math.round(netAmount * 100) / 100,
              iva_amount: Math.round(ivaAmount * 100) / 100,
              currency,
              purchase_date: departureDate,
            })
        }
      }

      // 8. OPERATOR PAYMENTS (deuda con cada operador)
      // Si hay 1 solo operador, su costo real es el total (columna M).
      // Si hay múltiples, cada uno tiene su costo individual (Q, S, U).
      for (let opIdx = 0; opIdx < operatorsList.length; opIdx++) {
        const op = operatorsList[opIdx]
        // Si es el único operador, usar el costo total (M) como amount
        const opAmount = operatorsList.length === 1 ? calculatedOperatorCost : op.cost
        if (opAmount > 0) {
          const dueDate = departureDate
          // Distribuir pagos proporcionalmente si hay múltiples operadores
          let opPaidAmount = 0
          if (operatorsList.length === 1) {
            opPaidAmount = paidToOperator
          } else if (calculatedOperatorCost > 0) {
            opPaidAmount = Math.round((op.cost / calculatedOperatorCost) * paidToOperator * 100) / 100
          }
          await (supabase.from('operator_payments'))
            .insert({
              operation_id: operationId,
              operator_id: op.operator_id,
              amount: opAmount,
              currency,
              due_date: dueDate,
              status: paidToOperator >= calculatedOperatorCost ? 'PAID' : 'PENDING',
              paid_amount: opPaidAmount,
              notes: 'Generado por importación masiva',
            })
        }
      }

      // 9. PAYMENT: Cobro al cliente (si Monto Cobrado > 0)
      // Solo registro, SIN ledger_movement (saldos bancarios ya son correctos)
      if (amountCollected > 0) {
        await (supabase.from('payments'))
          .insert({
            operation_id: operationId,
            payer_type: 'CUSTOMER',
            direction: 'INCOME',
            method: CONFIG.DEFAULT_PAYMENT_METHOD,
            amount: amountCollected,
            currency,
            exchange_rate: exchangeRate,
            date_paid: operationDate || departureDate,
            date_due: operationDate || departureDate,
            status: 'PAID',
            reference: 'Importación masiva - cobro registrado',
          })
        stats.paymentsCreated++
      }

      // 10. PAYMENT: Pendiente de cobrar al cliente
      const pendingFromClient = saleAmount - amountCollected
      if (pendingFromClient > 0) {
        await (supabase.from('payments'))
          .insert({
            operation_id: operationId,
            payer_type: 'CUSTOMER',
            direction: 'INCOME',
            method: CONFIG.DEFAULT_PAYMENT_METHOD,
            amount: pendingFromClient,
            currency,
            date_due: departureDate,
            status: 'PENDING',
            reference: 'Importación masiva - pendiente de cobro',
          })
        stats.paymentsCreated++
      }

      // 11. PAYMENT: Pago a operador (si Pagado a Operador > 0)
      // Solo registro, SIN ledger_movement (saldos bancarios ya son correctos)
      if (paidToOperator > 0) {
        await (supabase.from('payments'))
          .insert({
            operation_id: operationId,
            payer_type: 'OPERATOR',
            direction: 'EXPENSE',
            method: CONFIG.DEFAULT_PAYMENT_METHOD,
            amount: paidToOperator,
            currency,
            exchange_rate: exchangeRate,
            date_paid: operationDate || departureDate,
            date_due: operationDate || departureDate,
            status: 'PAID',
            reference: 'Importación masiva - pago a operador registrado',
          })
        stats.paymentsCreated++
      }

      // 12. PAYMENT: Pendiente a operador (usando costo total de columna M)
      const pendingToOperator = operatorCostTotal - paidToOperator
      if (pendingToOperator > 0) {
        await (supabase.from('payments'))
          .insert({
            operation_id: operationId,
            payer_type: 'OPERATOR',
            direction: 'EXPENSE',
            method: CONFIG.DEFAULT_PAYMENT_METHOD,
            amount: pendingToOperator,
            currency,
            date_due: departureDate,
            status: 'PENDING',
            reference: 'Importación masiva - pendiente de pago a operador',
          })
        stats.paymentsCreated++
      }

      // ─── Éxito ────────────────────────────────────────────────────────

      stats.success++
      results.push({
        row: rowNum,
        status: 'success',
        message: `${row.nombre_del_cliente} → ${row.destino} | ${saleAmount} ${currency}`,
        operationId,
        fileCode,
      })

      // Log de progreso
      if (stats.success % 10 === 0) {
        console.log(`   ⏳ Progreso: ${stats.success}/${rows.length} operaciones...`)
      }

    } catch (error) {
      stats.errors++
      results.push({ row: rowNum, status: 'error', message: `Error inesperado: ${error.message}` })
      console.error(`   ❌ Fila ${rowNum}: ${error.message}`)
    }
  }

  // ─── Reporte final ──────────────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  REPORTE DE IMPORTACIÓN')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(``)
  console.log(`   📊 Total filas:           ${stats.total}`)
  console.log(`   ✅ Exitosas:              ${stats.success}`)
  console.log(`   ⚠️  Advertencias:          ${stats.warnings}`)
  console.log(`   ❌ Errores:               ${stats.errors}`)
  console.log(`   ⏭️  Saltadas:              ${stats.skipped}`)
  console.log(``)
  console.log(`   👤 Clientes creados:      ${stats.customersCreated}`)
  console.log(`   🏢 Operadores creados:    ${stats.operatorsCreated}`)
  console.log(`   💳 Pagos creados:         ${stats.paymentsCreated}`)
  console.log(`   📒 Mov. contables:        ${stats.ledgerMovementsCreated}`)
  console.log(``)

  // Mostrar errores
  const errorResults = results.filter(r => r.status === 'error')
  if (errorResults.length > 0) {
    console.log('─── ERRORES ────────────────────────────────────────────')
    errorResults.forEach(r => console.log(`   Fila ${r.row}: ${r.message}`))
  }

  // Mostrar warnings
  const warningResults = results.filter(r => r.status === 'warning')
  if (warningResults.length > 0) {
    console.log('─── ADVERTENCIAS ───────────────────────────────────────')
    warningResults.slice(0, 20).forEach(r => console.log(`   Fila ${r.row}: ${r.message}`))
    if (warningResults.length > 20) {
      console.log(`   ... y ${warningResults.length - 20} más`)
    }
  }

  // En dry run, mostrar todas las operaciones que se importarían
  if (dryRun) {
    console.log('─── OPERACIONES A IMPORTAR ──────────────────────────────')
    const successResults = results.filter(r => r.status === 'success')
    successResults.slice(0, 30).forEach(r => console.log(`   Fila ${r.row}: ${r.message}`))
    if (successResults.length > 30) {
      console.log(`   ... y ${successResults.length - 30} más`)
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log(dryRun
    ? '  🟡 DRY-RUN COMPLETADO - No se insertó nada en la BD'
    : '  🟢 IMPORTACIÓN COMPLETADA')
  console.log('═══════════════════════════════════════════════════════════\n')

  return stats
}

// ─── Ejecutar ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const csvPath = args.find(a => !a.startsWith('--')) || ''
const dryRun = args.includes('--dry-run')
const clearExisting = args.includes('--clear')

if (!csvPath) {
  console.log('Uso: npx tsx scripts/import-masivo-operaciones.ts <ruta-csv> [--dry-run] [--clear]')
  console.log('')
  console.log('Opciones:')
  console.log('  --dry-run   Valida sin insertar (recomendado primero)')
  console.log('  --clear     Elimina datos existentes antes de importar')
  console.log('')
  console.log('Ejemplo:')
  console.log('  npx tsx scripts/import-masivo-operaciones.ts ~/Downloads/operaciones.csv --dry-run')
  console.log('  npx tsx scripts/import-masivo-operaciones.ts ~/Downloads/operaciones.csv')
  process.exit(0)
}

importOperations(csvPath, dryRun, clearExisting)
  .then((stats) => {
    if (stats.errors > 0) {
      process.exit(1)
    }
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💀 ERROR FATAL:', error)
    process.exit(1)
  })
