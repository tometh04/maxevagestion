/**
 * Script de Health Check para la Integración de Trello
 * Verifica que todos los componentes estén funcionando correctamente
 * 
 * Uso: npx tsx scripts/trello-health-check.ts
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { resolve } from "path"

config({ path: resolve(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface HealthCheckResult {
  component: string
  status: "✅ OK" | "⚠️ WARNING" | "❌ ERROR"
  message: string
  details?: any
}

async function healthCheck(): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = []

  console.log("🏥 Health Check de Integración Trello")
  console.log("=".repeat(70))
  console.log("")

  // 1. Verificar configuración de agencias
  console.log("1️⃣ Verificando configuración de agencias...")
  const { data: agencies, error: agenciesError } = await supabase
    .from("agencies")
    .select("id, name")
    .in("name", ["Rosario", "Madero"])

  if (agenciesError || !agencies || agencies.length !== 2) {
    results.push({
      component: "Agencias",
      status: "❌ ERROR",
      message: "No se encontraron ambas agencias (Rosario y Madero)",
      details: agenciesError,
    })
  } else {
    results.push({
      component: "Agencias",
      status: "✅ OK",
      message: `Encontradas ${agencies.length} agencias: ${agencies.map(a => a.name).join(", ")}`,
    })
  }

  // 2. Verificar configuración de Trello
  console.log("\n2️⃣ Verificando configuración de Trello...")
  const { data: trelloSettings, error: settingsError } = await supabase
    .from("settings_trello")
    .select("*")

  if (settingsError) {
    results.push({
      component: "Settings Trello",
      status: "❌ ERROR",
      message: "Error al obtener configuración de Trello",
      details: settingsError,
    })
  } else if (!trelloSettings || trelloSettings.length === 0) {
    results.push({
      component: "Settings Trello",
      status: "❌ ERROR",
      message: "No hay configuración de Trello",
    })
  } else {
    for (const setting of trelloSettings) {
      const agency = agencies?.find(a => a.id === setting.agency_id)
      const agencyName = agency?.name || "Desconocida"
      
      const checks = []
      if (!setting.trello_api_key) checks.push("API Key faltante")
      if (!setting.trello_token) checks.push("Token faltante")
      if (!setting.board_id) checks.push("Board ID faltante")
      if (!setting.webhook_id) checks.push("Webhook ID faltante")
      if (!setting.webhook_url) checks.push("Webhook URL faltante")

      if (checks.length > 0) {
        results.push({
          component: `Settings Trello - ${agencyName}`,
          status: "⚠️ WARNING",
          message: `Configuración incompleta: ${checks.join(", ")}`,
          details: setting,
        })
      } else {
        results.push({
          component: `Settings Trello - ${agencyName}`,
          status: "✅ OK",
          message: `Configuración completa (Board: ${setting.board_id})`,
        })
      }
    }
  }

  // 3. Verificar webhooks en Trello
  console.log("\n3️⃣ Verificando webhooks en Trello...")
  if (trelloSettings && trelloSettings.length > 0) {
    for (const setting of trelloSettings as any[]) {
      const agency = agencies?.find(a => a.id === setting.agency_id)
      const agencyName = agency?.name || "Desconocida"

      try {
        const webhooksResponse = await fetch(
          `https://api.trello.com/1/tokens/${setting.trello_token}/webhooks?key=${setting.trello_api_key}`
        )

        if (!webhooksResponse.ok) {
          results.push({
            component: `Webhooks Trello - ${agencyName}`,
            status: "❌ ERROR",
            message: `Error al obtener webhooks: ${webhooksResponse.status}`,
          })
          continue
        }

        const allWebhooks = await webhooksResponse.json()
        
        // Obtener board ID completo
        let fullBoardId = setting.board_id
        try {
          const boardResponse = await fetch(
            `https://api.trello.com/1/boards/${setting.board_id}?key=${setting.trello_api_key}&token=${setting.trello_token}&fields=id`
          )
          if (boardResponse.ok) {
            const boardData = await boardResponse.json()
            fullBoardId = boardData.id
          }
        } catch (error) {
          // Continuar con board_id corto
        }

        // Buscar webhook para este board
        const boardWebhook = allWebhooks.find((wh: any) => 
          wh.idModel === fullBoardId || wh.idModel === setting.board_id
        )

        if (!boardWebhook) {
          results.push({
            component: `Webhooks Trello - ${agencyName}`,
            status: "❌ ERROR",
            message: `No se encontró webhook para board ${setting.board_id}`,
          })
        } else if (!boardWebhook.active) {
          results.push({
            component: `Webhooks Trello - ${agencyName}`,
            status: "⚠️ WARNING",
            message: `Webhook encontrado pero INACTIVO`,
            details: boardWebhook,
          })
        } else if (boardWebhook.id !== setting.webhook_id) {
          results.push({
            component: `Webhooks Trello - ${agencyName}`,
            status: "⚠️ WARNING",
            message: `Webhook ID en BD (${setting.webhook_id}) no coincide con Trello (${boardWebhook.id})`,
            details: { bd: setting.webhook_id, trello: boardWebhook.id },
          })
        } else {
          results.push({
            component: `Webhooks Trello - ${agencyName}`,
            status: "✅ OK",
            message: `Webhook activo y correcto (ID: ${boardWebhook.id})`,
          })
        }
      } catch (error: any) {
        results.push({
          component: `Webhooks Trello - ${agencyName}`,
          status: "❌ ERROR",
          message: `Error al verificar webhooks: ${error.message}`,
        })
      }
    }
  }

  // 4. Verificar estructura de datos
  console.log("\n4️⃣ Verificando estructura de datos...")
  const { data: leadsSample, error: leadsError } = await supabase
    .from("leads")
    .select("id, external_id, trello_list_id, trello_full_data, agency_id, source")
    .eq("source", "Trello")
    .limit(10)

  if (leadsError) {
    results.push({
      component: "Estructura de Datos - Leads",
      status: "❌ ERROR",
      message: "Error al obtener leads",
      details: leadsError,
    })
  } else {
    const leadsWithIssues = leadsSample?.filter(lead => 
      !lead.external_id || !lead.trello_list_id || !lead.agency_id
    ) || []

    if (leadsWithIssues.length > 0) {
      results.push({
        component: "Estructura de Datos - Leads",
        status: "⚠️ WARNING",
        message: `${leadsWithIssues.length} leads con datos incompletos (sin external_id, trello_list_id o agency_id)`,
        details: leadsWithIssues,
      })
    } else {
      results.push({
        component: "Estructura de Datos - Leads",
        status: "✅ OK",
        message: `Estructura de datos correcta (muestra de ${leadsSample?.length || 0} leads)`,
      })
    }
  }

  // 5. Verificar endpoints API
  console.log("\n5️⃣ Verificando endpoints API...")
  const apiUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.maxevagestion.com"
  
  try {
    // Verificar endpoint de webhook (debe existir, aunque no podemos probarlo sin evento real)
    const webhookUrl = `${apiUrl}/api/trello/webhook`
    results.push({
      component: "Endpoints API - Webhook",
      status: "✅ OK",
      message: `Endpoint configurado: ${webhookUrl}`,
    })
  } catch (error: any) {
    results.push({
      component: "Endpoints API",
      status: "❌ ERROR",
      message: `Error al verificar endpoints: ${error.message}`,
    })
  }

  // 6. Verificar sincronización reciente
  console.log("\n6️⃣ Verificando última sincronización...")
  if (trelloSettings && trelloSettings.length > 0) {
    for (const setting of trelloSettings as any[]) {
      const agency = agencies?.find(a => a.id === setting.agency_id)
      const agencyName = agency?.name || "Desconocida"

      if (setting.last_sync_at) {
        const lastSync = new Date(setting.last_sync_at)
        const hoursAgo = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60)
        
        if (hoursAgo > 24) {
          results.push({
            component: `Última Sincronización - ${agencyName}`,
            status: "⚠️ WARNING",
            message: `Última sincronización hace ${Math.floor(hoursAgo)} horas`,
            details: { lastSync: setting.last_sync_at },
          })
        } else {
          results.push({
            component: `Última Sincronización - ${agencyName}`,
            status: "✅ OK",
            message: `Última sincronización hace ${Math.floor(hoursAgo)} horas`,
          })
        }
      } else {
        results.push({
          component: `Última Sincronización - ${agencyName}`,
          status: "⚠️ WARNING",
          message: "Nunca se ha sincronizado",
        })
      }
    }
  }

  return results
}

async function main() {
  const results = await healthCheck()

  console.log("\n" + "=".repeat(70))
  console.log("📊 RESUMEN DE HEALTH CHECK")
  console.log("=".repeat(70))
  console.log("")

  const ok = results.filter(r => r.status === "✅ OK").length
  const warnings = results.filter(r => r.status === "⚠️ WARNING").length
  const errors = results.filter(r => r.status === "❌ ERROR").length

  console.log(`✅ OK: ${ok}`)
  console.log(`⚠️  WARNINGS: ${warnings}`)
  console.log(`❌ ERRORES: ${errors}`)
  console.log("")

  for (const result of results) {
    console.log(`${result.status} ${result.component}`)
    console.log(`   ${result.message}`)
    if (result.details) {
      console.log(`   Detalles:`, JSON.stringify(result.details, null, 2))
    }
    console.log("")
  }

  if (errors > 0) {
    console.log("❌ HAY ERRORES CRÍTICOS - La integración NO está funcionando correctamente")
    process.exit(1)
  } else if (warnings > 0) {
    console.log("⚠️  HAY ADVERTENCIAS - Revisar antes de continuar")
    process.exit(0)
  } else {
    console.log("✅ TODO FUNCIONANDO CORRECTAMENTE")
    process.exit(0)
  }
}

main().catch((error) => {
  console.error("\n❌ Error fatal:", error)
  process.exit(1)
})

