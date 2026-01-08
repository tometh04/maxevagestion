import { useState, useEffect } from "react"

export interface ToolsSettings {
  id?: string
  // Emilia
  emilia_enabled: boolean
  emilia_model: string
  emilia_temperature: number
  emilia_max_tokens: number
  emilia_system_prompt?: string
  emilia_allowed_actions: string[]
  // Email
  email_enabled: boolean
  email_provider: string
  email_from_name: string
  email_from_address?: string
  email_reply_to?: string
  email_signature?: string
  // WhatsApp
  whatsapp_enabled: boolean
  whatsapp_provider: 'manual' | 'api' | 'manychat'
  whatsapp_api_key?: string
  whatsapp_default_country_code: string
  // Notificaciones
  notifications_enabled: boolean
  notifications_sound: boolean
  notifications_desktop: boolean
  notifications_email_digest: boolean
  notifications_digest_frequency: 'daily' | 'weekly' | 'never'
  // Exportaciones
  export_default_format: 'xlsx' | 'csv' | 'pdf'
  export_include_headers: boolean
  export_date_format: string
  export_currency_format: 'symbol' | 'code' | 'both'
  export_logo_url?: string
  // UI
  ui_theme: 'light' | 'dark' | 'system'
  ui_sidebar_collapsed: boolean
  ui_compact_mode: boolean
  ui_show_tooltips: boolean
  ui_default_currency_display: string
  ui_date_format: string
  ui_time_format: '12h' | '24h'
  ui_language: string
  // Backups
  backups_enabled: boolean
  backups_frequency: 'daily' | 'weekly' | 'monthly'
  backups_retention_days: number
  backups_include_attachments: boolean
}

export function useToolsSettings() {
  const [settings, setSettings] = useState<ToolsSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/tools/settings')
      
      if (!response.ok) {
        throw new Error('Error al cargar configuración')
      }

      const data = await response.json()
      setSettings(data)
    } catch (err: any) {
      console.error('Error loading tools settings:', err)
      setError(err.message || 'Error al cargar configuración')
      // Usar configuración por defecto si falla
      setSettings({
        emilia_enabled: true,
        emilia_model: 'gpt-4',
        emilia_temperature: 0.7,
        emilia_max_tokens: 2000,
        emilia_allowed_actions: ['search', 'summarize', 'suggest'],
        email_enabled: true,
        email_provider: 'resend',
        email_from_name: 'MAXEVA Gestión',
        whatsapp_enabled: true,
        whatsapp_provider: 'manual',
        whatsapp_default_country_code: '+54',
        notifications_enabled: true,
        notifications_sound: true,
        notifications_desktop: true,
        notifications_email_digest: false,
        notifications_digest_frequency: 'daily',
        export_default_format: 'xlsx',
        export_include_headers: true,
        export_date_format: 'DD/MM/YYYY',
        export_currency_format: 'symbol',
        ui_theme: 'system',
        ui_sidebar_collapsed: false,
        ui_compact_mode: false,
        ui_show_tooltips: true,
        ui_default_currency_display: 'ARS',
        ui_date_format: 'DD/MM/YYYY',
        ui_time_format: '24h',
        ui_language: 'es',
        backups_enabled: false,
        backups_frequency: 'weekly',
        backups_retention_days: 30,
        backups_include_attachments: false,
      })
    } finally {
      setLoading(false)
    }
  }

  return { settings, loading, error, refetch: loadSettings }
}
