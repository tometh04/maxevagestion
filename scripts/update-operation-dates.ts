import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { config } from 'dotenv'

// Cargar variables de entorno
config({ path: path.join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltan variables de entorno de Supabase')
  process.exit(1)
}

// ============================================================
// CONFIGURACIÓN
// ============================================================
const DRY_RUN = process.argv.includes('--execute') ? false : true
const CSV_PATH = path.join(__dirname, '../import-rosario.csv')

// ============================================================
// PARSEO DE CSV (mismo parser del import original)
// ============================================================

interface CSVRow {
  fecha_operacion?: string
  nombre_cliente?: string
  destino?: string
  fecha_salida?: string
  monto_venta?: string
}

function parseCSV(filePath: string): CSVRow[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim())

  if (lines.length < 2) {
    throw new Error('CSV vacío o sin datos')
  }

  // Parsear header
  const headerLine = lines[0]
  const headers: string[] = []
  let currentHeader = ''
  let inQuotes = false

  for (let i = 0; i < headerLine.length; i++) {
    const char = headerLine[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      headers.push(currentHeader.trim().toLowerCase().replace(/\s+/g, '_'))
      currentHeader = ''
    } else {
      currentHeader += char
    }
  }
  headers.push(currentHeader.trim().toLowerCase().replace(/\s+/g, '_'))

  const columnMap: Record<string, string> = {
    'código': 'codigo',
    'codigo': 'codigo',
    'fecha_operación': 'fecha_operacion',
    'fecha_operacion': 'fecha_operacion',
    'nombre_del_cliente': 'nombre_cliente',
    'nombre_cliente': 'nombre_cliente',
    'email_cliente': 'email_cliente',
    'destino': 'destino',
    'fecha_salida': 'fecha_salida',
    'fecha_regreso': 'fecha_regreso',
    'monto_venta': 'monto_venta',
  }

  const rows: CSVRow[] = []

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]
    const values: string[] = []
    let current = ''
    let inQ = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQ = !inQ
      } else if (char === ',' && !inQ) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim())

    const row: any = {}
    headers.forEach((header, idx) => {
      const mappedKey = columnMap[header] || header
      row[mappedKey] = values[idx] || ''
    })

    rows.push(row)
  }

  return rows
}

// ============================================================
// CONVERSIÓN DE MES A FECHA
// ============================================================

function monthToDate(monthStr: string | undefined): string | null {
  if (!monthStr || !monthStr.trim()) return null

  const months: Record<string, number> = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
    'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
    'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
  }

  const monthName = monthStr.trim().toLowerCase()
  const month = months[monthName]

  if (month === undefined) return null

  // Enero = 2026, todo lo demás = 2025
  const year = monthName === 'enero' ? 2026 : 2025

  return `${year}-${String(month).padStart(2, '0')}-01`
}

// ============================================================
// PARSEO DE FECHA dd/mm/yyyy → yyyy-mm-dd
// ============================================================

function parseDate(dateStr: string | undefined): string | null {
  if (!dateStr || !dateStr.trim()) return null

  let str = dateStr.trim().replace(/\/\/+/g, '/').replace(/\s+/g, '')

  // Formato dd/mm/yy o dd/mm/yyyy
  const parts = str.split(/[\/\-]/)
  if (parts.length >= 3) {
    const day = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10)
    let year = parseInt(parts[2], 10)

    // Si año tiene 2 dígitos, asumir 2000+
    if (year < 100) year += 2000

    if (!isNaN(day) && !isNaN(month) && !isNaN(year) && day > 0 && day <= 31 && month > 0 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  return null
}

// ============================================================
// EXTRAER APELLIDO DEL NOMBRE
// ============================================================

function extractLastName(name: string | undefined): string {
  if (!name || !name.trim()) return ''
  const parts = name.trim().split(/\s+/)
  // El nombre del CSV suele ser solo apellido o "Apellido Nombre"
  // Usamos la primera palabra como clave
  return parts[0].toLowerCase()
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('='.repeat(60))
  console.log(DRY_RUN
    ? '🔍 MODO DRY-RUN — No se hará ningún cambio'
    : '⚡ MODO EJECUCIÓN — Se actualizarán los registros')
  console.log('='.repeat(60))
  console.log()

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // 1. Leer CSV
  console.log('📄 Leyendo CSV...')
  const rows = parseCSV(CSV_PATH)
  console.log(`   ${rows.length} filas encontradas`)
  console.log()

  // 2. Obtener operaciones y clientes por separado (más eficiente)
  console.log('🔍 Obteniendo operaciones de la base de datos...')
  const { data: operations, error: opError } = await supabase
    .from('operations')
    .select('id, file_code, operation_date, departure_date, destination, sale_amount_total, created_at')
    .not('status', 'eq', 'CANCELLED')

  if (opError) {
    console.error('❌ Error obteniendo operaciones:', opError.message)
    process.exit(1)
  }

  console.log(`   ${operations?.length || 0} operaciones en la base de datos`)

  // Obtener clientes principales de cada operación
  console.log('🔍 Obteniendo clientes principales...')
  const { data: opCustomers, error: ocError } = await supabase
    .from('operation_customers')
    .select('operation_id, role, customer_id')
    .eq('role', 'MAIN')

  if (ocError) {
    console.error('❌ Error obteniendo operation_customers:', ocError.message)
    process.exit(1)
  }

  // Obtener todos los clientes
  const customerIds = [...new Set((opCustomers || []).map(oc => oc.customer_id))]
  const { data: customers, error: cError } = await supabase
    .from('customers')
    .select('id, first_name, last_name')
    .in('id', customerIds)

  if (cError) {
    console.error('❌ Error obteniendo clientes:', cError.message)
    process.exit(1)
  }

  // Crear maps para búsqueda rápida
  const customerMap = new Map((customers || []).map(c => [c.id, c]))
  const opCustomerMap = new Map((opCustomers || []).map(oc => [oc.operation_id, oc.customer_id]))

  console.log(`   ${customerMap.size} clientes, ${opCustomerMap.size} relaciones`)
  console.log()

  // 3. Procesar cada fila del CSV y matchear con operaciones
  let matched = 0
  let notFound = 0
  let skipped = 0
  let updated = 0
  let errors = 0

  const updates: Array<{
    id: string
    file_code: string
    cliente: string
    destino: string
    old_date: string
    new_date: string
  }> = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2 // +2 porque fila 1 es header

    // Validar datos mínimos
    if (!row.nombre_cliente?.trim() && !row.destino?.trim()) {
      skipped++
      continue
    }

    // Obtener fecha de operación del CSV
    const newOperationDate = monthToDate(row.fecha_operacion)
    if (!newOperationDate) {
      skipped++
      console.log(`   ⚠️  Fila ${rowNum}: Sin fecha de operación válida: "${row.fecha_operacion}"`)
      continue
    }

    // Parsear departure_date del CSV
    const csvDepartureDate = parseDate(row.fecha_salida)
    const csvLastName = extractLastName(row.nombre_cliente)
    const csvDestino = (row.destino || '').trim().toLowerCase()

    // Buscar match en operaciones
    // Criterio: apellido cliente + destino + departure_date
    const match = (operations || []).find(op => {
      // Match por departure_date
      const opDeparture = op.departure_date ? op.departure_date.split('T')[0] : null
      if (csvDepartureDate && opDeparture !== csvDepartureDate) return false

      // Match por destino (case insensitive, parcial)
      const opDestino = (op.destination || '').toLowerCase()
      if (csvDestino && opDestino && !opDestino.includes(csvDestino) && !csvDestino.includes(opDestino)) return false

      // Match por apellido del cliente principal
      const customerId = opCustomerMap.get(op.id)
      if (customerId) {
        const customer = customerMap.get(customerId)
        if (customer) {
          const opLastName = (customer.last_name || '').toLowerCase()
          const opFirstName = (customer.first_name || '').toLowerCase()

          if (csvLastName &&
              !opLastName.includes(csvLastName) &&
              !csvLastName.includes(opLastName) &&
              !opFirstName.includes(csvLastName) &&
              !csvLastName.includes(opFirstName)) {
            return false
          }
        }
      }

      return true
    })

    if (!match) {
      notFound++
      if (notFound <= 20) { // Mostrar solo los primeros 20 no encontrados
        console.log(`   ❓ Fila ${rowNum}: No encontrada — ${row.nombre_cliente} | ${row.destino} | ${row.fecha_salida}`)
      }
      continue
    }

    matched++

    // Verificar si ya tiene la fecha correcta
    const currentDate = match.operation_date ? match.operation_date.split('T')[0] : null
    if (currentDate === newOperationDate) {
      continue // Ya tiene la fecha correcta
    }

    const mainCustomerName = (() => {
      const custId = opCustomerMap.get(match.id)
      if (custId) {
        const cust = customerMap.get(custId)
        if (cust) return `${cust.first_name} ${cust.last_name}`
      }
      return row.nombre_cliente || '?'
    })()

    updates.push({
      id: match.id,
      file_code: match.file_code,
      cliente: mainCustomerName,
      destino: match.destination,
      old_date: currentDate || 'NULL',
      new_date: newOperationDate,
    })
  }

  // 4. Mostrar resumen
  console.log()
  console.log('='.repeat(60))
  console.log('📊 RESUMEN')
  console.log('='.repeat(60))
  console.log(`   Filas CSV:        ${rows.length}`)
  console.log(`   Matcheadas:       ${matched}`)
  console.log(`   No encontradas:   ${notFound}`)
  console.log(`   Saltadas:         ${skipped}`)
  console.log(`   A actualizar:     ${updates.length}`)
  console.log()

  if (updates.length === 0) {
    console.log('✅ No hay nada que actualizar. Todas las fechas ya están correctas.')
    return
  }

  // 5. Mostrar detalle de cambios
  console.log('📝 CAMBIOS A REALIZAR:')
  console.log('-'.repeat(100))
  console.log(`${'FILE CODE'.padEnd(18)} ${'CLIENTE'.padEnd(25)} ${'DESTINO'.padEnd(20)} ${'FECHA ACTUAL'.padEnd(15)} → ${'FECHA NUEVA'}`)
  console.log('-'.repeat(100))

  for (const u of updates) {
    console.log(
      `${(u.file_code || '-').padEnd(18)} ` +
      `${u.cliente.substring(0, 24).padEnd(25)} ` +
      `${(u.destino || '-').substring(0, 19).padEnd(20)} ` +
      `${u.old_date.padEnd(15)} → ${u.new_date}`
    )
  }
  console.log('-'.repeat(100))
  console.log()

  // 6. Ejecutar o no
  if (DRY_RUN) {
    console.log('🔍 DRY-RUN completado. Para ejecutar los cambios, corré:')
    console.log('   npx tsx scripts/update-operation-dates.ts --execute')
    console.log()
    return
  }

  // MODO EJECUCIÓN
  console.log('⚡ Ejecutando actualizaciones...')
  console.log()

  const rollback: Array<{ id: string; old_date: string | null }> = []

  for (const u of updates) {
    const { error } = await supabase
      .from('operations')
      .update({ operation_date: u.new_date })
      .eq('id', u.id)

    if (error) {
      errors++
      console.log(`   ❌ Error actualizando ${u.file_code}: ${error.message}`)
    } else {
      updated++
      rollback.push({ id: u.id, old_date: u.old_date === 'NULL' ? null : u.old_date })
      console.log(`   ✅ ${u.file_code} — ${u.cliente} → ${u.new_date}`)
    }
  }

  console.log()
  console.log('='.repeat(60))
  console.log(`✅ Actualizadas: ${updated}`)
  console.log(`❌ Errores: ${errors}`)
  console.log('='.repeat(60))

  // Guardar rollback
  const rollbackPath = path.join(__dirname, '../rollback-operation-dates.json')
  fs.writeFileSync(rollbackPath, JSON.stringify(rollback, null, 2))
  console.log(`\n💾 Rollback guardado en: ${rollbackPath}`)
  console.log('   Para revertir: usa el JSON con los IDs y old_dates')
}

main().catch(err => {
  console.error('❌ Error fatal:', err)
  process.exit(1)
})
