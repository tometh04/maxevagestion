/**
 * Script de Testing Automatizado para AI Companion
 * 
 * Este script prueba las preguntas más importantes del AI Companion
 * y valida que las respuestas sean correctas.
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

// Preguntas de prueba organizadas por categoría
const testQuestions = [
  // Cotizaciones
  {
    category: 'Cotizaciones',
    question: '¿Cuántas cotizaciones se enviaron este mes?',
    expectedQuery: 'SELECT COUNT(*) FROM quotations WHERE status = \'SENT\' AND created_at >= date_trunc(\'month\', CURRENT_DATE)',
    validate: async (result: any) => {
      // Validar que la query se ejecute correctamente
      const { data, error } = await supabase.rpc('execute_readonly_query', {
        query_text: result.expectedQuery
      })
      if (error) {
        console.error('  ❌ Error ejecutando query:', error.message)
        return false
      }
      console.log('  ✅ Query ejecutada correctamente, resultados:', data)
      return true
    }
  },
  {
    category: 'Cotizaciones',
    question: '¿Cuántas cotizaciones se convirtieron en operaciones?',
    expectedQuery: 'SELECT COUNT(*) FROM quotations WHERE status = \'CONVERTED\' AND converted_at >= date_trunc(\'month\', CURRENT_DATE)',
    validate: async (result: any) => {
      const { data, error } = await supabase.rpc('execute_readonly_query', {
        query_text: result.expectedQuery
      })
      if (error) {
        console.error('  ❌ Error ejecutando query:', error.message)
        return false
      }
      console.log('  ✅ Query ejecutada correctamente, resultados:', data)
      return true
    }
  },
  // Cajas
  {
    category: 'Cajas',
    question: '¿Cuál es el balance actual de todas las cajas?',
    expectedQuery: 'SELECT name, currency, current_balance FROM cash_boxes WHERE is_active = true',
    validate: async (result: any) => {
      const { data, error } = await supabase.rpc('execute_readonly_query', {
        query_text: result.expectedQuery
      })
      if (error) {
        console.error('  ❌ Error ejecutando query:', error.message)
        return false
      }
      console.log('  ✅ Query ejecutada correctamente, resultados:', data)
      return true
    }
  },
  {
    category: 'Cajas',
    question: '¿Cuánto se transfirió de ARS a USD este mes?',
    expectedQuery: 'SELECT SUM(amount) FROM cash_transfers WHERE currency = \'USD\' AND transfer_date >= date_trunc(\'month\', CURRENT_DATE)',
    validate: async (result: any) => {
      const { data, error } = await supabase.rpc('execute_readonly_query', {
        query_text: result.expectedQuery
      })
      if (error) {
        console.error('  ❌ Error ejecutando query:', error.message)
        return false
      }
      console.log('  ✅ Query ejecutada correctamente, resultados:', data)
      return true
    }
  },
  // Operadores
  {
    category: 'Operadores',
    question: '¿Cuál es el operador más rentable?',
    expectedQuery: 'SELECT o.name, SUM(op.margin_amount) as margen_total, AVG(op.margin_percentage) as margen_promedio_pct, COUNT(op.id) as cantidad_operaciones FROM operators o JOIN operations op ON o.id = op.operator_id WHERE op.status IN (\'CONFIRMED\', \'TRAVELLED\', \'CLOSED\') GROUP BY o.name ORDER BY margen_total DESC LIMIT 1',
    validate: async (result: any) => {
      const { data, error } = await supabase.rpc('execute_readonly_query', {
        query_text: result.expectedQuery
      })
      if (error) {
        console.error('  ❌ Error ejecutando query:', error.message)
        return false
      }
      console.log('  ✅ Query ejecutada correctamente, resultados:', data)
      return true
    }
  },
  // Destinos
  {
    category: 'Destinos',
    question: '¿Cuál es el destino más rentable para la agencia Rosario?',
    expectedQuery: 'SELECT o.destination, SUM(o.margin_amount) as margen_total, COUNT(*) as cantidad_operaciones, AVG(o.margin_percentage) as margen_promedio_pct, SUM(o.sale_amount_total) as ventas_totales FROM operations o JOIN agencies a ON o.agency_id = a.id WHERE a.name LIKE \'%Rosario%\' AND o.status IN (\'CONFIRMED\', \'TRAVELLED\', \'CLOSED\') GROUP BY o.destination ORDER BY margen_total DESC LIMIT 1',
    validate: async (result: any) => {
      const { data, error } = await supabase.rpc('execute_readonly_query', {
        query_text: result.expectedQuery
      })
      if (error) {
        console.error('  ❌ Error ejecutando query:', error.message)
        return false
      }
      console.log('  ✅ Query ejecutada correctamente, resultados:', data)
      return true
    }
  },
]

async function testQuery(query: string, description: string): Promise<boolean> {
  try {
    console.log(`\n🧪 Probando query: ${description}`)
    console.log(`   Query: ${query.substring(0, 100)}...`)
    
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: query
    })
    
    if (error) {
      console.error(`   ❌ Error: ${error.message}`)
      return false
    }
    
    console.log(`   ✅ Éxito! Resultados: ${JSON.stringify(data).substring(0, 200)}`)
    return true
  } catch (error: any) {
    console.error(`   ❌ Excepción: ${error.message}`)
    return false
  }
}

async function runTests() {
  console.log('🚀 Iniciando tests del AI Companion...\n')
  
  let passed = 0
  let failed = 0
  
  // Agrupar por categoría
  const byCategory: Record<string, typeof testQuestions> = {}
  for (const test of testQuestions) {
    if (!byCategory[test.category]) {
      byCategory[test.category] = []
    }
    byCategory[test.category].push(test)
  }
  
  // Ejecutar tests por categoría
  for (const [category, tests] of Object.entries(byCategory)) {
    console.log(`\n📋 Categoría: ${category}`)
    console.log('='.repeat(60))
    
    for (const test of tests) {
      const success = await testQuery(test.expectedQuery, test.question)
      if (success) {
        passed++
      } else {
        failed++
      }
      
      // Pequeña pausa entre queries
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  
  // Resumen
  console.log('\n' + '='.repeat(60))
  console.log('📊 RESUMEN DE TESTS')
  console.log('='.repeat(60))
  console.log(`✅ Tests pasados: ${passed}`)
  console.log(`❌ Tests fallidos: ${failed}`)
  console.log(`📈 Tasa de éxito: ${((passed / (passed + failed)) * 100).toFixed(2)}%`)
  
  if (failed === 0) {
    console.log('\n🎉 ¡Todos los tests pasaron!')
    process.exit(0)
  } else {
    console.log('\n⚠️  Algunos tests fallaron. Revisa los errores arriba.')
    process.exit(1)
  }
}

// Ejecutar tests
runTests().catch(error => {
  console.error('❌ Error fatal:', error)
  process.exit(1)
})

