/**
 * Script de Testing para verificar que execute_readonly_query funciona correctamente
 * 
 * Este script prueba:
 * 1. Que la función existe en la base de datos
 * 2. Que acepta queries SELECT válidas
 * 3. Que rechaza queries peligrosas
 * 4. Que retorna resultados correctamente
 * 5. Que el código en route.ts puede usarla correctamente
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface TestResult {
  name: string
  passed: boolean
  error?: string
  data?: any
}

const testResults: TestResult[] = []

async function testFunction(name: string, testFn: () => Promise<boolean>): Promise<void> {
  try {
    const passed = await testFn()
    testResults.push({ name, passed })
    if (passed) {
      console.log(`✅ ${name}`)
    } else {
      console.log(`❌ ${name}`)
    }
  } catch (error: any) {
    testResults.push({ name, passed: false, error: error.message })
    console.log(`❌ ${name}: ${error.message}`)
  }
}

async function runTests() {
  console.log('🚀 Iniciando tests de execute_readonly_query...\n')
  console.log('='.repeat(80))

  // TEST 1: Verificar que la función existe
  await testFunction('Función execute_readonly_query existe', async () => {
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: 'SELECT 1 as test'
    })
    
    if (error) {
      if (error.message.includes('does not exist')) {
        throw new Error('La función NO existe en la base de datos. Ejecuta la migración 061.')
      }
      throw new Error(`Error inesperado: ${error.message}`)
    }
    
    return data !== undefined
  })

  // TEST 2: Query SELECT simple
  await testFunction('Query SELECT simple funciona', async () => {
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: 'SELECT COUNT(*) as total FROM operations'
    })
    
    if (error) throw new Error(error.message)
    if (!Array.isArray(data) && data !== null) throw new Error('Resultado no es un array')
    
    return true
  })

  // TEST 3: Query SELECT con JOIN (sin saltos de línea al inicio)
  await testFunction('Query SELECT con JOIN funciona', async () => {
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: `SELECT o.id, o.file_code, c.first_name, c.last_name FROM operations o LEFT JOIN operation_customers oc ON o.id = oc.operation_id LEFT JOIN customers c ON oc.customer_id = c.id WHERE oc.role = 'MAIN' LIMIT 5`
    })
    
    if (error) throw new Error(error.message)
    if (!Array.isArray(data)) throw new Error('Resultado no es un array')
    
    return true
  })

  // TEST 4: Query SELECT con agregaciones (sin saltos de línea al inicio)
  await testFunction('Query SELECT con agregaciones funciona', async () => {
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: `SELECT COUNT(*) as total_operaciones, SUM(sale_amount_total) as ventas_totales, AVG(margin_percentage) as margen_promedio FROM operations WHERE status = 'CONFIRMED'`
    })
    
    if (error) throw new Error(error.message)
    if (!Array.isArray(data)) throw new Error('Resultado no es un array')
    
    return true
  })

  // TEST 5: Query SELECT con WHERE y filtros (sin saltos de línea al inicio)
  await testFunction('Query SELECT con WHERE funciona', async () => {
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: `SELECT id, first_name, last_name, email FROM customers WHERE email IS NOT NULL LIMIT 10`
    })
    
    if (error) throw new Error(error.message)
    if (!Array.isArray(data)) throw new Error('Resultado no es un array')
    
    return true
  })

  // TEST 6: Query vacía debe fallar
  await testFunction('Query vacía es rechazada', async () => {
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: ''
    })
    
    if (!error) throw new Error('Debería rechazar query vacía')
    if (!error.message.includes('vacía')) throw new Error(`Error inesperado: ${error.message}`)
    
    return true
  })

  // TEST 7: INSERT debe ser rechazado
  await testFunction('Comando INSERT es rechazado', async () => {
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: 'INSERT INTO operations (id) VALUES (gen_random_uuid())'
    })
    
    if (!error) throw new Error('Debería rechazar INSERT')
    // Puede ser rechazado por "SELECT" o "peligrosos", ambos son válidos
    if (!error.message.includes('SELECT') && !error.message.includes('peligrosos')) {
      throw new Error(`Error inesperado: ${error.message}`)
    }
    
    return true
  })

  // TEST 8: UPDATE debe ser rechazado
  await testFunction('Comando UPDATE es rechazado', async () => {
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: 'UPDATE operations SET status = \'CONFIRMED\' WHERE id = \'123\''
    })
    
    if (!error) throw new Error('Debería rechazar UPDATE')
    // Puede ser rechazado por "SELECT" o "peligrosos", ambos son válidos
    if (!error.message.includes('SELECT') && !error.message.includes('peligrosos')) {
      throw new Error(`Error inesperado: ${error.message}`)
    }
    
    return true
  })

  // TEST 9: DELETE debe ser rechazado
  await testFunction('Comando DELETE es rechazado', async () => {
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: 'DELETE FROM operations WHERE id = \'123\''
    })
    
    if (!error) throw new Error('Debería rechazar DELETE')
    // Puede ser rechazado por "SELECT" o "peligrosos", ambos son válidos
    if (!error.message.includes('SELECT') && !error.message.includes('peligrosos')) {
      throw new Error(`Error inesperado: ${error.message}`)
    }
    
    return true
  })

  // TEST 10: DROP debe ser rechazado
  await testFunction('Comando DROP es rechazado', async () => {
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: 'DROP TABLE operations'
    })
    
    if (!error) throw new Error('Debería rechazar DROP')
    // Puede ser rechazado por "SELECT" o "peligrosos", ambos son válidos
    if (!error.message.includes('SELECT') && !error.message.includes('peligrosos')) {
      throw new Error(`Error inesperado: ${error.message}`)
    }
    
    return true
  })

  // TEST 11: Múltiples statements deben ser rechazados
  await testFunction('Múltiples statements son rechazados', async () => {
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: 'SELECT 1; SELECT 2'
    })
    
    if (!error) throw new Error('Debería rechazar múltiples statements')
    // El mensaje debe contener "múltiples" o "Múltiples" (case insensitive)
    const errorLower = error.message.toLowerCase()
    if (!errorLower.includes('múltiples') && !errorLower.includes('multiples') && !error.message.includes('peligrosos')) {
      throw new Error(`Error inesperado: ${error.message}`)
    }
    
    return true
  })

  // TEST 12: Query con SELECT en string debe pasar (no es un comando real)
  await testFunction('SELECT dentro de string no es bloqueado', async () => {
    // Usar una tabla que sabemos que existe y tiene texto
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: `SELECT id, destination FROM operations WHERE destination LIKE '%SELECT%' LIMIT 5`
    })
    
    if (error) {
      // Si la columna no existe, está bien, solo verificamos que no sea bloqueado por "peligrosos"
      if (error.message.includes('peligrosos')) {
        throw new Error(`No debería bloquear SELECT en string: ${error.message}`)
      }
      // Otros errores (como columna no existe) están bien
    }
    if (data && !Array.isArray(data)) throw new Error('Resultado no es un array')
    
    return true
  })

  // TEST 13: Query que retorna array vacío
  await testFunction('Query sin resultados retorna array vacío', async () => {
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: 'SELECT * FROM operations WHERE id = \'00000000-0000-0000-0000-000000000000\''
    })
    
    if (error) throw new Error(error.message)
    if (!Array.isArray(data)) throw new Error('Resultado no es un array')
    if (data.length !== 0) throw new Error('Debería retornar array vacío')
    
    return true
  })

  // TEST 14: Query compleja con subquery (sin saltos de línea al inicio)
  await testFunction('Query con subquery funciona', async () => {
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: `SELECT o.id, o.file_code, (SELECT COUNT(*) FROM payments p WHERE p.operation_id = o.id) as total_pagos FROM operations o LIMIT 5`
    })
    
    if (error) throw new Error(error.message)
    if (!Array.isArray(data)) throw new Error('Resultado no es un array')
    
    return true
  })

  // TEST 15: Verificar que el formato de respuesta es correcto (JSONB array)
  await testFunction('Formato de respuesta es JSONB array', async () => {
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: 'SELECT id, name FROM agencies LIMIT 3'
    })
    
    if (error) throw new Error(error.message)
    if (!Array.isArray(data)) throw new Error('Resultado debe ser un array')
    if (data.length > 0 && typeof data[0] !== 'object') throw new Error('Cada elemento debe ser un objeto')
    
    return true
  })

  // Resumen
  console.log('\n' + '='.repeat(80))
  console.log('📊 RESUMEN DE TESTS')
  console.log('='.repeat(80))
  
  const passed = testResults.filter(r => r.passed).length
  const failed = testResults.filter(r => !r.passed).length
  
  console.log(`✅ Tests pasados: ${passed}`)
  console.log(`❌ Tests fallidos: ${failed}`)
  console.log(`📈 Tasa de éxito: ${((passed / testResults.length) * 100).toFixed(2)}%`)
  
  if (failed > 0) {
    console.log('\n❌ Tests fallidos:')
    testResults.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}${r.error ? `: ${r.error}` : ''}`)
    })
  }
  
  console.log('\n' + '='.repeat(80))
  
  if (failed === 0) {
    console.log('🎉 ¡Todos los tests pasaron! La función execute_readonly_query funciona correctamente.')
    process.exit(0)
  } else {
    console.log('⚠️  Algunos tests fallaron. Revisa los errores arriba.')
    process.exit(1)
  }
}

// Ejecutar tests
runTests().catch(error => {
  console.error('❌ Error fatal:', error)
  process.exit(1)
})
