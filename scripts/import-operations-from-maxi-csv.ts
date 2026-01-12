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

interface CSVRow {
  codigo?: string
  fecha_operacion?: string
  nombre_cliente?: string
  email_cliente?: string
  destino?: string
  fecha_salida?: string
  fecha_regreso?: string
  adultos?: string
  ninos?: string
  monto_venta?: string
  monto_pagar?: string
  operador_1?: string
  costo_operador_1?: string
  operador_2?: string
  costo_operador_2?: string
  operador_3?: string
  costo_operador_3?: string
  moneda?: string
  estado?: string
  nombre_vendedor?: string
}

// Parsear CSV manualmente (maneja comas dentro de comillas)
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
  
  // Mapeo de columnas (normalizar headers)
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
    'fecha_reg': 'fecha_regreso',
    'adultos': 'adultos',
    'niños': 'ninos',
    'ninos': 'ninos',
    'niñ': 'ninos',
    'monto_venta': 'monto_venta',
    'monto_venta_/_pendiente_de_cobro': 'monto_venta',
    'monto_v': 'monto_venta',
    'monto_a_pagar': 'monto_pagar',
    'operador_1': 'operador_1',
    'costo_operador_1': 'costo_operador_1',
    'operador_2': 'operador_2',
    'costo_operador_2': 'costo_operador_2',
    'operador_3': 'operador_3',
    'costo_operador_3': 'costo_operador_3',
    'moneda': 'moneda',
    'estado': 'estado',
    'nombre_vendedor': 'nombre_vendedor',
  }
  
  const rows: CSVRow[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const values: string[] = []
    let current = ''
    let inQuotes = false
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim())
    
    const row: any = {}
    headers.forEach((header, index) => {
      // Normalizar header (lowercase, sin espacios extra)
      const normalizedHeader = header.toLowerCase().trim()
      const mappedKey = columnMap[normalizedHeader] || normalizedHeader
      const value = values[index]?.replace(/^"|"$/g, '').trim() || ''
      row[mappedKey] = value || undefined
    })
    
    // Solo agregar si tiene al menos destino o cliente
    if (row.destino || row.nombre_cliente) {
      rows.push(row)
    }
  }
  
  return rows
}

// Limpiar montos (remover $ y comas)
function cleanAmount(amount: string | undefined): number {
  if (!amount) return 0
  return parseFloat(amount.replace(/[$,]/g, '')) || 0
}

// Parsear mes a fecha (ej: "Julio" → 2026-07-01)
function parseMonthToDate(monthStr: string | undefined, contextYear: number = 2026): Date | null {
  if (!monthStr || !monthStr.trim()) return null
  
  const months: Record<string, number> = {
    'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
    'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
    'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
  }
  
  const monthName = monthStr.trim().toLowerCase()
  const month = months[monthName]
  
  if (month !== undefined) {
    return new Date(contextYear, month, 1)
  }
  
  return null
}

// Parsear fechas: dd/mm/aaaa, pero si empieza con 4 dígitos → convertir de aaaa/mm/dd a dd/mm/aaaa
function parseDate(dateStr: string | undefined, defaultYear: number = 2026): string | null {
  if (!dateStr || !dateStr.trim()) return null
  
  let str = dateStr.trim().replace(/\/\/+/g, '/') // Limpiar dobles barras
  str = str.replace(/\s+/g, '') // Remover espacios
  
  // Si empieza con 4 dígitos, está en formato aaaa/mm/dd o aaaa-mm-dd → convertir a dd/mm/aaaa
  if (/^\d{4}/.test(str)) {
    const parts = str.split(/[\/\-]/)
    if (parts.length >= 3) {
      const year = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10)
      const day = parseInt(parts[2], 10)
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        // Convertir de aaaa/mm/dd a dd/mm/aaaa (y luego a ISO para BD)
        // Ahora tenemos: year=2025, month=3, day=15 → formato ISO: 2025-03-15
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      }
    }
  }
  
  // Formato dd/mm/aaaa (o dd/mm si no tiene año)
  const parts = str.split(/[\/\-]/)
  if (parts.length >= 2) {
    const day = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10)
    let year = defaultYear
    
    // Si hay tercer parte, usar como año
    if (parts.length >= 3) {
      const yearPart = parseInt(parts[2], 10)
      if (!isNaN(yearPart)) {
        year = yearPart
      }
    }
    
    if (!isNaN(day) && !isNaN(month) && day > 0 && day <= 31 && month > 0 && month <= 12) {
      // Formato ISO para BD: YYYY-MM-DD
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  
  return null
}

// Separar nombre completo en first_name y last_name
function splitName(fullName: string | undefined): { first_name: string; last_name: string } {
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

// Normalizar nombre de vendedor (manejar "Cande - Rama" → buscar "Cande")
function normalizeSellerName(sellerName: string | undefined): string {
  if (!sellerName) return ''
  return sellerName.split('-')[0].trim()
}

// Buscar vendedor por nombre (fuzzy match)
function findSellerByName(sellerName: string, sellerMap: Map<string, string>): string | null {
  if (!sellerName) return null
  
  const normalized = normalizeSellerName(sellerName).toLowerCase()
  
  // Buscar exacto
  for (const [name, id] of sellerMap.entries()) {
    if (name.toLowerCase() === normalized) {
      return id
    }
  }
  
  // Buscar parcial
  for (const [name, id] of sellerMap.entries()) {
    if (name.toLowerCase().includes(normalized) || normalized.includes(name.toLowerCase())) {
      return id
    }
  }
  
  return null
}

// Buscar/crear operador
async function findOrCreateOperator(
  operatorName: string | undefined,
  operatorMap: Map<string, string>,
  supabase: any
): Promise<string | null> {
  if (!operatorName || !operatorName.trim()) return null
  
  const normalized = operatorName.trim().toLowerCase()
  
  // Buscar existente
  for (const [name, id] of operatorMap.entries()) {
    if (name.toLowerCase() === normalized) {
      return id
    }
  }
  
  // Crear nuevo operador
  const { data: newOperator, error } = await supabase
    .from('operators')
    .insert({ name: operatorName.trim() })
    .select('id')
    .single()
  
  if (error || !newOperator) {
    console.error(`Error creando operador ${operatorName}:`, error)
    return null
  }
  
  // Actualizar cache
  operatorMap.set(normalized, newOperator.id)
  return newOperator.id
}

// Buscar/crear cliente
async function findOrCreateCustomer(
  customerName: string | undefined,
  customerEmail: string | undefined,
  customerMap: Map<string, any>,
  supabase: any
): Promise<string | null> {
  if (!customerName || !customerName.trim()) return null
  
  // Buscar por email si existe
  if (customerEmail && customerEmail.trim()) {
    const emailKey = customerEmail.toLowerCase().trim()
    if (customerMap.has(emailKey)) {
      return customerMap.get(emailKey).id
    }
  }
  
  // Buscar por nombre (buscar en BD)
  const { first_name, last_name } = splitName(customerName)
  
  // Verificar si ya existe por nombre
  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id')
    .eq('first_name', first_name)
    .eq('last_name', last_name)
    .maybeSingle()
  
  if (existingCustomer) {
    return existingCustomer.id
  }
  
  // Crear cliente
  const { data: newCustomer, error } = await supabase
    .from('customers')
    .insert({
      first_name,
      last_name,
      email: customerEmail && customerEmail.trim() 
        ? customerEmail.trim() 
        : `${first_name.toLowerCase().replace(/\s/g, '')}@importado.com`,
      phone: '-',
    })
    .select('id')
    .single()
  
  if (error || !newCustomer) {
    console.error(`Error creando cliente ${customerName}:`, error)
    return null
  }
  
  // Actualizar cache
  if (customerEmail && customerEmail.trim()) {
    customerMap.set(customerEmail.toLowerCase().trim(), newCustomer)
  }
  
  return newCustomer.id
}

function validateStatus(status?: string): string | null {
  const validStatuses = ['RESERVED', 'CONFIRMED', 'CANCELLED', 'TRAVELLING', 'TRAVELLED']
  if (!status) return null
  const upper = status.toUpperCase()
  // Migrar estados antiguos
  if (upper === 'PRE_RESERVATION') return 'RESERVED'
  if (upper === 'CLOSED') return 'TRAVELLED'
  return validStatuses.includes(upper) ? upper : null
}

function generateFileCode(): string {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `OP-${dateStr}-${random}`
}

// Función para borrar todas las operaciones existentes
async function deleteAllOperations(supabase: any) {
  console.log('🗑️  Eliminando todas las operaciones existentes...')
  
  // Primero eliminar relaciones
  console.log('   Eliminando operation_operators...')
  const { error: opOpError } = await supabase
    .from('operation_operators')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
  
  if (opOpError) {
    console.error('Error eliminando operation_operators:', opOpError)
  }
  
  console.log('   Eliminando operation_customers...')
  const { error: opCustError } = await supabase
    .from('operation_customers')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
  
  if (opCustError) {
    console.error('Error eliminando operation_customers:', opCustError)
  }
  
  console.log('   Eliminando payments...')
  const { error: paymentsError } = await supabase
    .from('payments')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
  
  if (paymentsError) {
    console.error('Error eliminando payments:', paymentsError)
  }
  
  console.log('   Eliminando operations...')
  const { error: operationsError } = await supabase
    .from('operations')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
  
  if (operationsError) {
    console.error('Error eliminando operations:', operationsError)
    throw operationsError
  }
  
  console.log('✅ Todas las operaciones eliminadas')
}

async function importOperations(csvFilePath: string, agencyName: string = 'rosario', clearExisting: boolean = true) {
  console.log(`📂 Leyendo archivo: ${csvFilePath}`)
  
  const rows = parseCSV(csvFilePath)
  console.log(`📊 Encontradas ${rows.length} filas válidas`)
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  
  // Borrar todas las operaciones existentes si se solicita
  if (clearExisting) {
    await deleteAllOperations(supabase)
  }
  
  // Obtener agencia
  const { data: agency } = await supabase
    .from('agencies')
    .select('id')
    .ilike('name', `%${agencyName}%`)
    .single()
  
  if (!agency) {
    throw new Error(`Agencia no encontrada: ${agencyName}`)
  }
  
  console.log(`✅ Agencia: ${agencyName} (${agency.id})`)
  
  // Cache de vendedores, operadores, clientes
  const { data: sellers } = await supabase.from('users').select('id, name, email')
  const { data: operators } = await supabase.from('operators').select('id, name')
  const { data: customers } = await supabase.from('customers').select('id, email, first_name, last_name')
  
  const sellerMap = new Map((sellers || []).map((s: any) => [s.name?.toLowerCase().trim(), s.id]))
  const operatorMap = new Map((operators || []).map((o: any) => [o.name?.toLowerCase().trim(), o.id]))
  const customerMap = new Map((customers || []).map((c: any) => {
    const key = c.email?.toLowerCase().trim()
    return key ? [key, c] : null
  }).filter(Boolean) as [string, any][])
  
  console.log(`📋 Cache cargado: ${sellerMap.size} vendedores, ${operatorMap.size} operadores, ${customerMap.size} clientes`)
  
  let success = 0
  let errors = 0
  let warnings = 0
  const details: string[] = []
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2
    
    try {
      // Validar datos mínimos
      if (!row.destino && !row.nombre_cliente) {
        warnings++
        continue
      }
      
      // Parsear fechas
      const departureDate = parseDate(row.fecha_salida, 2026)
      const returnDate = parseDate(row.fecha_regreso, 2026)
      
      let finalDepartureDate = departureDate
      
      if (!departureDate) {
        // Si no hay fecha de salida pero hay fecha de operación, usar esa
        if (row.fecha_operacion) {
          const fechaOp = parseMonthToDate(row.fecha_operacion, 2026)
          if (fechaOp) {
            finalDepartureDate = fechaOp.toISOString().split('T')[0]
            warnings++
            details.push(`Fila ${rowNum}: Sin fecha de salida, usando fecha operación: ${finalDepartureDate}`)
          } else {
            warnings++
            details.push(`Fila ${rowNum}: Sin fecha de salida válida (valor: "${row.fecha_salida}")`)
            continue
          }
        } else {
          warnings++
          details.push(`Fila ${rowNum}: Sin fecha de salida válida (valor: "${row.fecha_salida}")`)
          continue
        }
      }
      
      // Limpiar montos
      const saleAmount = cleanAmount(row.monto_venta)
      const totalOperatorCost = cleanAmount(row.monto_pagar)
      
      // Parsear operadores (hasta 3)
      const operatorsList: Array<{ operator_id: string; cost: number; cost_currency: "ARS" | "USD" }> = []
      
      if (row.operador_1 && row.costo_operador_1) {
        const op1Id = await findOrCreateOperator(row.operador_1, operatorMap, supabase)
        const op1Cost = cleanAmount(row.costo_operador_1)
        if (op1Id && op1Cost > 0) {
          operatorsList.push({
            operator_id: op1Id,
            cost: op1Cost,
            cost_currency: (row.moneda?.toUpperCase() as "ARS" | "USD") || "USD"
          })
        }
      }
      
      if (row.operador_2 && row.costo_operador_2) {
        const op2Id = await findOrCreateOperator(row.operador_2, operatorMap, supabase)
        const op2Cost = cleanAmount(row.costo_operador_2)
        if (op2Id && op2Cost > 0) {
          operatorsList.push({
            operator_id: op2Id,
            cost: op2Cost,
            cost_currency: (row.moneda?.toUpperCase() as "ARS" | "USD") || "USD"
          })
        }
      }
      
      if (row.operador_3 && row.costo_operador_3) {
        const op3Id = await findOrCreateOperator(row.operador_3, operatorMap, supabase)
        const op3Cost = cleanAmount(row.costo_operador_3)
        if (op3Id && op3Cost > 0) {
          operatorsList.push({
            operator_id: op3Id,
            cost: op3Cost,
            cost_currency: (row.moneda?.toUpperCase() as "ARS" | "USD") || "USD"
          })
        }
      }
      
      // Si no hay operadores pero hay "Monto a Pagar", crear un operador genérico
      if (operatorsList.length === 0 && totalOperatorCost > 0) {
        const genericOpId = await findOrCreateOperator('Importado', operatorMap, supabase)
        if (genericOpId) {
          operatorsList.push({
            operator_id: genericOpId,
            cost: totalOperatorCost,
            cost_currency: (row.moneda?.toUpperCase() as "ARS" | "USD") || "USD"
          })
        }
      }
      
      // Calcular costo total de operadores
      const calculatedOperatorCost = operatorsList.reduce((sum, op) => sum + op.cost, 0)
      
      // Buscar/crear cliente
      const customerId = await findOrCreateCustomer(
        row.nombre_cliente,
        row.email_cliente,
        customerMap,
        supabase
      )
      
      // Buscar vendedor
      const sellerId = findSellerByName(row.nombre_vendedor, sellerMap)
      if (!sellerId && row.nombre_vendedor) {
        warnings++
        details.push(`Fila ${rowNum}: Vendedor no encontrado: ${row.nombre_vendedor}`)
      }
      
      // Estado: todas CONFIRMED
      const status = 'CONFIRMED'
      
      // Calcular márgenes
      const marginAmount = saleAmount - calculatedOperatorCost
      const marginPercentage = saleAmount > 0 ? (marginAmount / saleAmount) * 100 : 0
      
      const currency = (row.moneda?.toUpperCase() as "ARS" | "USD") || "USD"
      
      const operationData: any = {
        agency_id: agency.id,
        seller_id: sellerId || (sellers?.[0]?.id), // Fallback al primer vendedor
        operator_id: operatorsList[0]?.operator_id || null, // Operador principal (compatibilidad)
        type: 'PACKAGE' as const,
        product_type: 'PAQUETE',
        destination: row.destino || 'Sin destino',
        operation_date: finalDepartureDate || new Date().toISOString().split('T')[0],
        departure_date: finalDepartureDate || new Date().toISOString().split('T')[0],
        return_date: returnDate || null,
        adults: parseInt(row.adultos || '2') || 2,
        children: parseInt(row.ninos || '0') || 0,
        infants: 0,
        status,
        sale_amount_total: saleAmount,
        sale_currency: currency,
        operator_cost: calculatedOperatorCost,
        operator_cost_currency: currency,
        currency,
        margin_amount: marginAmount,
        margin_percentage: marginPercentage,
      }
      
      if (row.codigo && row.codigo.trim()) {
        operationData.file_code = row.codigo.trim()
      } else {
        operationData.file_code = generateFileCode()
      }
      
      // Crear operación
      const { data: newOperation, error } = await (supabase.from('operations') as any)
        .insert(operationData)
        .select('id')
        .single()
      
      if (error) {
        errors++
        details.push(`Fila ${rowNum}: Error creando: ${error.message}`)
        continue
      }
      
      const operationId = newOperation.id
      success++
      
      // Crear registros en operation_operators para múltiples operadores
      if (operatorsList.length > 0) {
        const operationOperatorsData = operatorsList.map(op => ({
          operation_id: operationId,
          operator_id: op.operator_id,
          cost: op.cost,
          cost_currency: op.cost_currency,
        }))
        
        const { error: opOpError } = await supabase
          .from('operation_operators')
          .insert(operationOperatorsData)
        
        if (opOpError) {
          console.error(`Error creando operation_operators para ${operationId}:`, opOpError)
        }
      }
      
      // Asociar cliente a operación
      if (customerId) {
        await supabase
          .from('operation_customers')
          .insert({
            operation_id: operationId,
            customer_id: customerId,
            role: 'MAIN',
          })
      }
      
      // Log cada 10 operaciones
      if (success % 10 === 0) {
        console.log(`⏳ Progreso: ${success}/${rows.length} procesadas...`)
      }
      
    } catch (error: any) {
      errors++
      details.push(`Fila ${rowNum}: Error: ${error.message}`)
      console.error(`Error en fila ${rowNum}:`, error)
    }
  }
  
  console.log(`\n✅ Importación completada:`)
  console.log(`   ✅ Creadas: ${success}`)
  console.log(`   ⚠️  Advertencias: ${warnings}`)
  console.log(`   ❌ Errores: ${errors}`)
  
  if (details.length > 0) {
    console.log(`\n📋 Detalles (primeros 30):`)
    details.slice(0, 30).forEach(d => console.log(`   ${d}`))
  }
  
  return { success, warnings, errors, details }
}

// Ejecutar
const csvPath = process.argv[2] || '/Users/tomiisanchezz/Downloads/Import Sistema - Sheet1.csv'
const agencyName = process.argv[3] || 'rosario'

importOperations(csvPath, agencyName, true)
  .then(() => {
    console.log('\n🎉 ¡Importación finalizada!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Error fatal:', error)
    process.exit(1)
  })

