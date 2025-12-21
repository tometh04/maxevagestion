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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Normalizar nombre de vendedor (manejar "Cande - Rama" → "Cande")
function normalizeSellerName(sellerName: string | undefined): string {
  if (!sellerName) return ''
  return sellerName.split('-')[0].trim()
}

// Parsear CSV para obtener vendedores únicos
function parseCSVForSellers(filePath: string): Map<string, string> {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim())
  
  if (lines.length < 2) {
    throw new Error('CSV vacío o sin datos')
  }
  
  // Parsear header para encontrar la columna de vendedor
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
  
  const sellerColumnIndex = headers.findIndex(h => h.includes('vendedor') || h.includes('seller'))
  
  if (sellerColumnIndex === -1) {
    throw new Error('No se encontró la columna de vendedor')
  }
  
  // Mapeo: nombre normalizado -> nombre original del CSV
  const sellerMap = new Map<string, string>()
  
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
    
    const sellerName = values[sellerColumnIndex]?.replace(/^"|"$/g, '') || ''
    if (sellerName && sellerName.trim() && sellerName !== 'Nombre Vendedor') {
      const normalized = normalizeSellerName(sellerName).toLowerCase()
      if (!sellerMap.has(normalized)) {
        sellerMap.set(normalized, sellerName.trim())
      }
    }
  }
  
  return sellerMap
}

// Crear usuario vendedor
async function createSeller(
  name: string,
  agencyId: string,
  supabase: any
): Promise<string | null> {
  // Generar email único
  const email = `${name.toLowerCase().replace(/\s+/g, '')}@erplozada.com`
  
  // Verificar si ya existe
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', email)
    .maybeSingle()
  
  if (existingUser) {
    console.log(`   ✓ Usuario ya existe: ${name} (${email})`)
    return existingUser.id
  }
  
  // Crear usuario en Supabase Auth
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: `TempPass${Math.random().toString(36).substring(2, 10)}!`,
    email_confirm: true,
    user_metadata: {
      name,
      role: 'SELLER',
    },
  })
  
  if (authError || !authUser.user) {
    console.error(`   ❌ Error creando usuario en Auth para ${name}:`, authError)
    return null
  }
  
  // Crear registro en tabla users
  const { data: userData, error: userError } = await supabase
    .from('users')
    .insert({
      auth_id: authUser.user.id,
      name,
      email,
      role: 'SELLER',
      is_active: true,
    })
    .select('id')
    .single()
  
  if (userError || !userData) {
    console.error(`   ❌ Error creando registro de usuario para ${name}:`, userError)
    // Limpiar usuario de auth si falla
    await supabase.auth.admin.deleteUser(authUser.user.id)
    return null
  }
  
  // Vincular a agencia
  const { error: agencyError } = await supabase
    .from('user_agencies')
    .insert({
      user_id: userData.id,
      agency_id: agencyId,
    })
  
  if (agencyError) {
    console.error(`   ⚠️  Error vinculando ${name} a agencia:`, agencyError)
  }
  
  console.log(`   ✅ Creado: ${name} (${email})`)
  return userData.id
}

// Parsear fecha para comparación
function parseDateForMatch(dateStr: string | undefined): string | null {
  if (!dateStr || !dateStr.trim()) return null
  const str = dateStr.trim()
  
  if (str.includes('2026') || str.includes('2025')) {
    const parts = str.split(/[\/\-]/)
    if (parts.length === 3) {
      const day = parseInt(parts[0])
      const month = parseInt(parts[1])
      const year = parseInt(parts[2])
      if (day && month && year) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      }
    }
  }
  
  const parts = str.split(/[\/\-]/)
  if (parts.length === 2) {
    const day = parseInt(parts[0])
    const month = parseInt(parts[1])
    if (day && month) {
      return `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  
  return null
}

// Actualizar operaciones con vendedores correctos
async function updateOperationsWithSellers(
  csvFilePath: string,
  sellerMap: Map<string, string>,
  supabase: any
) {
  console.log('\n🔄 Actualizando operaciones con vendedores correctos...')
  
  const content = fs.readFileSync(csvFilePath, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim())
  
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
  
  const codigoIndex = headers.findIndex(h => h.includes('código') || h.includes('codigo'))
  const sellerIndex = headers.findIndex(h => h.includes('vendedor') || h.includes('seller'))
  const destinoIndex = headers.findIndex(h => h.includes('destino'))
  const fechaSalidaIndex = headers.findIndex(h => h.includes('fecha_salida') || h.includes('salida'))
  const clienteIndex = headers.findIndex(h => h.includes('cliente') && !h.includes('email'))
  
  if (sellerIndex === -1) {
    throw new Error('No se encontró la columna de vendedor')
  }
  
  // Obtener todos los vendedores de la BD
  const { data: allSellers } = await supabase.from('users').select('id, name, email')
  const sellerIdMap = new Map((allSellers || []).map((s: any) => [s.name?.toLowerCase().trim(), s.id]))
  
  // Obtener todas las operaciones ordenadas por fecha de creación (para hacer match por orden)
  const { data: allOperations } = await supabase
    .from('operations')
    .select('id, seller_id, file_code, destination, departure_date')
    .order('created_at', { ascending: true })
  
  let updated = 0
  let notFound = 0
  let skipped = 0
  let operationIndex = 0
  
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
    
    const sellerName = values[sellerIndex]?.replace(/^"|"$/g, '') || ''
    
    if (!sellerName || sellerName === 'Nombre Vendedor' || !sellerName.trim()) {
      skipped++
      continue
    }
    
    const normalizedSeller = normalizeSellerName(sellerName).toLowerCase()
    const sellerId = sellerIdMap.get(normalizedSeller)
    
    if (!sellerId) {
      notFound++
      continue
    }
    
    // Buscar operación
    let operation = null
    
    // Primero intentar por código si existe
    if (codigoIndex !== -1) {
      const codigo = values[codigoIndex]?.replace(/^"|"$/g, '') || ''
      if (codigo && codigo.trim()) {
        const { data } = await supabase
          .from('operations')
          .select('id, seller_id')
          .eq('file_code', codigo.trim())
          .maybeSingle()
        operation = data
      }
    }
    
    // Si no se encontró por código, buscar por orden (asumiendo que el CSV y las operaciones están en el mismo orden)
    if (!operation && operationIndex < (allOperations?.length || 0)) {
      operation = allOperations?.[operationIndex]
      operationIndex++
    }
    
    if (operation && operation.seller_id !== sellerId) {
      const { error } = await supabase
        .from('operations')
        .update({ seller_id: sellerId })
        .eq('id', operation.id)
      
      if (error) {
        console.error(`   ❌ Error actualizando operación:`, error)
      } else {
        updated++
        if (updated % 10 === 0) {
          console.log(`   ⏳ Actualizadas ${updated} operaciones...`)
        }
      }
    } else if (!operation) {
      skipped++
    }
  }
  
  console.log(`\n✅ Actualización completada:`)
  console.log(`   ✅ Actualizadas: ${updated}`)
  console.log(`   ⚠️  Vendedor no encontrado: ${notFound}`)
  console.log(`   ⏭️  Saltadas: ${skipped}`)
}

async function main() {
  const csvPath = process.argv[2] || '/Users/tomiisanchezz/Downloads/Import Sistema - Sheet1.csv'
  const agencyName = process.argv[3] || 'rosario'
  
  console.log('📋 Creando vendedores y asignando operaciones...\n')
  
  // Obtener agencia
  const { data: agency } = await supabase
    .from('agencies')
    .select('id')
    .ilike('name', `%${agencyName}%`)
    .single()
  
  if (!agency) {
    throw new Error(`Agencia no encontrada: ${agencyName}`)
  }
  
  console.log(`✅ Agencia: ${agencyName} (${agency.id})\n`)
  
  // Obtener vendedores únicos del CSV
  console.log('📊 Parseando CSV para obtener vendedores...')
  const sellerMap = parseCSVForSellers(csvPath)
  console.log(`   Encontrados ${sellerMap.size} vendedores únicos\n`)
  
  // Obtener vendedores existentes
  const { data: existingSellers } = await supabase.from('users').select('id, name, email')
  const existingSellerNames = new Set((existingSellers || []).map((s: any) => s.name?.toLowerCase().trim()))
  
  // Crear vendedores faltantes
  console.log('👥 Creando vendedores faltantes...')
  const createdSellers: Map<string, string> = new Map()
  
  for (const [normalized, originalName] of sellerMap.entries()) {
    const name = normalizeSellerName(originalName)
    
    if (existingSellerNames.has(name.toLowerCase())) {
      console.log(`   ✓ Ya existe: ${name}`)
      // Obtener ID del vendedor existente
      const existing = (existingSellers || []).find((s: any) => s.name?.toLowerCase().trim() === name.toLowerCase())
      if (existing) {
        createdSellers.set(normalized, existing.id)
      }
      continue
    }
    
    const sellerId = await createSeller(name, agency.id, supabase)
    if (sellerId) {
      createdSellers.set(normalized, sellerId)
      existingSellerNames.add(name.toLowerCase())
    }
  }
  
  console.log(`\n✅ Vendedores creados: ${createdSellers.size}\n`)
  
  // Actualizar operaciones
  await updateOperationsWithSellers(csvPath, sellerMap, supabase)
  
  console.log('\n🎉 ¡Proceso completado!')
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Error fatal:', error)
    process.exit(1)
  })

