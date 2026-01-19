/**
 * Helpers para obtener y gestionar configuración de AFIP por agencia
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { AfipConfig } from './afip-config'
import { isAfipConfigValid } from './afip-config'

/**
 * Obtiene la configuración de AFIP para una agencia específica
 */
export async function getAfipConfigForAgency(
  supabase: SupabaseClient<Database>,
  agencyId: string
): Promise<AfipConfig | null> {
  try {
    // Buscar integración de tipo 'afip' para esta agencia
    const { data: integration, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('agency_id', agencyId)
      .eq('integration_type', 'afip')
      .eq('status', 'active')
      .maybeSingle()

    if (error || !integration) {
      console.log(`[AFIP Helper] No se encontró integración AFIP para agencia ${agencyId}`)
      return null
    }

    // Extraer configuración del campo JSONB
    const config = integration.config as any

    if (!config) {
      console.log(`[AFIP Helper] Integración sin configuración para agencia ${agencyId}`)
      return null
    }

    // Construir objeto de configuración
    const afipConfig: Partial<AfipConfig> = {
      api_key: config.api_key || '',
      cuit: config.cuit || '',
      point_of_sale: config.point_of_sale || config.pointOfSale || 1,
      environment: config.environment || 'sandbox',
      base_url: config.base_url || config.baseUrl,
      access_token: config.access_token || config.accessToken,
      token_expires_at: config.token_expires_at || config.tokenExpiresAt,
      cert_id: config.cert_id || config.certId,
    }

    // Validar que la configuración esté completa
    if (!isAfipConfigValid(afipConfig)) {
      console.log(`[AFIP Helper] Configuración incompleta para agencia ${agencyId}`)
      return null
    }

    return afipConfig as AfipConfig
  } catch (error: any) {
    console.error(`[AFIP Helper] Error al obtener configuración para agencia ${agencyId}:`, error)
    return null
  }
}

/**
 * Guarda o actualiza la configuración de AFIP para una agencia
 */
export async function saveAfipConfigForAgency(
  supabase: SupabaseClient<Database>,
  agencyId: string,
  config: Partial<AfipConfig>,
  userId: string
): Promise<{
  success: boolean
  integrationId?: string
  error?: string
}> {
  try {
    // Buscar integración existente
    const { data: existingIntegration } = await supabase
      .from('integrations')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('integration_type', 'afip')
      .maybeSingle()

    const configData = {
      api_key: config.api_key,
      cuit: config.cuit,
      point_of_sale: config.point_of_sale,
      environment: config.environment || 'sandbox',
      base_url: config.base_url,
      access_token: config.access_token,
      token_expires_at: config.token_expires_at,
      cert_id: config.cert_id,
    }

    if (existingIntegration) {
      // Actualizar integración existente
      const { data, error } = await supabase
        .from('integrations')
        .update({
          config: configData,
          status: isAfipConfigValid(config) ? 'active' : 'inactive',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingIntegration.id)
        .select()
        .single()

      if (error) {
        return {
          success: false,
          error: `Error al actualizar integración: ${error.message}`,
        }
      }

      return {
        success: true,
        integrationId: data.id,
      }
    } else {
      // Crear nueva integración
      const { data, error } = await supabase
        .from('integrations')
        .insert({
          agency_id: agencyId,
          integration_type: 'afip',
          name: 'AFIP - Facturación Electrónica',
          description: `Configuración AFIP para CUIT ${config.cuit}`,
          config: configData,
          status: isAfipConfigValid(config) ? 'active' : 'inactive',
          sync_enabled: false,
          created_by: userId,
        })
        .select()
        .single()

      if (error) {
        return {
          success: false,
          error: `Error al crear integración: ${error.message}`,
        }
      }

      return {
        success: true,
        integrationId: data.id,
      }
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error al guardar configuración',
    }
  }
}

/**
 * Verifica si una agencia tiene AFIP configurado y activo
 */
export async function hasAfipConfigured(
  supabase: SupabaseClient<Database>,
  agencyId: string
): Promise<boolean> {
  const config = await getAfipConfigForAgency(supabase, agencyId)
  return config !== null && isAfipConfigValid(config)
}
