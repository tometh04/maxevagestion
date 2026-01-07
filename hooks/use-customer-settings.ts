import { useState, useEffect } from "react"

export interface CustomField {
  name: string
  type: 'text' | 'number' | 'date' | 'email' | 'phone' | 'select' | 'textarea'
  label: string
  required: boolean
  options?: string[]
  default_value?: string
}

export interface CustomerSettings {
  id?: string
  custom_fields: CustomField[]
  validations: {
    email?: { required?: boolean; format?: 'email' }
    phone?: { required?: boolean; format?: 'phone' }
  }
  notifications: Array<{
    event: string
    enabled: boolean
    channels: string[]
  }>
  integrations: {
    operations?: { auto_link?: boolean }
    leads?: { auto_convert?: boolean }
  }
  auto_assign_lead: boolean
  require_document: boolean
  duplicate_check_enabled: boolean
  duplicate_check_fields: string[]
}

export function useCustomerSettings() {
  const [settings, setSettings] = useState<CustomerSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/customers/settings')
      
      if (!response.ok) {
        throw new Error('Error al cargar configuración')
      }

      const data = await response.json()
      setSettings(data)
    } catch (err: any) {
      console.error('Error loading customer settings:', err)
      setError(err.message || 'Error al cargar configuración')
      // Usar configuración por defecto si falla
      setSettings({
        custom_fields: [],
        validations: {
          email: { required: true, format: 'email' },
          phone: { required: true, format: 'phone' },
        },
        notifications: [],
        integrations: {
          operations: { auto_link: true },
          leads: { auto_convert: false },
        },
        auto_assign_lead: false,
        require_document: false,
        duplicate_check_enabled: true,
        duplicate_check_fields: ['email', 'phone'],
      })
    } finally {
      setLoading(false)
    }
  }

  return { settings, loading, error, refetch: loadSettings }
}

