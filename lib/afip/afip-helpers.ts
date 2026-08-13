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
    const { data: integration, error } = await (supabase
      .from('integrations') as any)
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
    const config = (integration as any).config as any

    if (!config) {
      console.log(`[AFIP Helper] Integración sin configuración para agencia ${agencyId}`)
      return null
    }

    // Construir objeto de configuración
    const afipConfig: Partial<AfipConfig> = {
      api_key: config.api_key || '',
      cuit: config.cuit || '',
      // Emisor representada (persona física facturando por una sociedad). Opcional.
      cuit_representada: config.cuit_representada || undefined,
      point_of_sale: config.point_of_sale || config.pointOfSale || 1,
      environment: config.environment || 'production',
      base_url: config.base_url || config.baseUrl,
      access_token: config.access_token || config.accessToken,
      token_expires_at: config.token_expires_at || config.tokenExpiresAt,
      cert_id: config.cert_id || config.certId,
      // Certificado PEM inline (permite autenticación sin cert almacenado en afipsdk.com)
      cert: config.cert || undefined,
      key: config.key || undefined,
      // Origen del certificado (auto / manual-sociedad). Ausente ⇒ 'auto'.
      cert_mode: config.cert_mode || undefined,
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
  userId: string,
  opts?: { force?: boolean }
): Promise<{
  success: boolean
  integrationId?: string
  error?: string
}> {
  try {
    // Buscar integración existente (con su config/status para el guard anti-pisada)
    const { data: existingIntegration } = await (supabase
      .from('integrations') as any)
      .select('id, config, status')
      .eq('agency_id', agencyId)
      .eq('integration_type', 'afip')
      .maybeSingle()

    // Guard anti-pisada: no dejar que el flujo automático sobreescriba un
    // certificado propio de sociedad (cert_mode='manual' activo) sin confirmación
    // explícita (force). Fue el incidente VICO: "Reconfigurar" pisó el cert manual.
    if (existingIntegration && !opts?.force) {
      const prev = (existingIntegration as any).config || {}
      const prevIsManualActive =
        prev.cert_mode === 'manual' &&
        (existingIntegration as any).status === 'active' &&
        !!prev.cert
      const incomingIsManual = config.cert_mode === 'manual'
      if (prevIsManualActive && !incomingIsManual) {
        return {
          success: false,
          error:
            'MANUAL_CERT_GUARD: esta agencia tiene un certificado propio de la sociedad. Para reemplazarlo por el flujo automático confirmá explícitamente (force).',
        }
      }
    }

    const configData = {
      api_key: config.api_key,
      cuit: config.cuit,
      // Emisor representada (sociedad). Se persiste solo si vino en la config.
      cuit_representada: config.cuit_representada || undefined,
      point_of_sale: config.point_of_sale,
      environment: config.environment || 'production',
      base_url: config.base_url,
      access_token: config.access_token,
      token_expires_at: config.token_expires_at,
      cert_id: config.cert_id,
      // Certificado PEM inline (para autenticación directa con afipsdk.com)
      cert: config.cert || undefined,
      key: config.key || undefined,
      // Modo del certificado + estado pendiente del CSR (modo manual/sociedad)
      cert_mode: config.cert_mode || undefined,
      pending_csr: config.pending_csr || undefined,
      pending_csr_key: config.pending_csr_key || undefined,
    }

    // Estado: un manual sin cert todavía (CSR generado) queda 'pending'; con
    // config válida → 'active'; si no → 'inactive'.
    const computedStatus =
      config.cert_mode === 'manual' && !config.cert
        ? 'pending'
        : isAfipConfigValid(config)
          ? 'active'
          : 'inactive'

    if (existingIntegration) {
      // Actualizar integración existente
      const { data, error } = await (supabase
        .from('integrations') as any)
        .update({
          config: configData,
          status: computedStatus,
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
      const { data, error } = await (supabase
        .from('integrations') as any)
        .insert({
          agency_id: agencyId,
          integration_type: 'afip',
          name: 'AFIP - Facturación Electrónica',
          description: `Configuración AFIP para CUIT ${config.cuit}`,
          config: configData,
          status: computedStatus,
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
