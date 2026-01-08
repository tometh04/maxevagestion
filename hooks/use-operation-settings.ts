import { useState, useEffect } from "react"

export interface CustomStatus {
  value: string
  label: string
  color: string
  order?: number
}

export interface AutoAlert {
  type: string
  enabled: boolean
  days_before?: number
  channels?: string[]
}

export interface OperationSettings {
  id?: string
  custom_statuses: CustomStatus[]
  workflows: Record<string, any>
  auto_alerts: AutoAlert[]
  document_templates: any[]
  default_status: string
  require_destination: boolean
  require_departure_date: boolean
  require_operator: boolean
  require_customer: boolean
  alert_payment_due_days: number
  alert_operator_payment_days: number
  alert_upcoming_trip_days: number
  auto_generate_quotation: boolean
  auto_generate_invoice: boolean
  require_documents_before_confirmation: boolean
  auto_create_ledger_entry: boolean
  auto_create_iva_entry: boolean
  auto_create_operator_payment: boolean
}

export function useOperationSettings() {
  const [settings, setSettings] = useState<OperationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/operations/settings')
      
      if (!response.ok) {
        throw new Error('Error al cargar configuración')
      }

      const data = await response.json()
      setSettings(data)
    } catch (err: any) {
      console.error('Error loading operation settings:', err)
      setError(err.message || 'Error al cargar configuración')
      // Usar configuración por defecto si falla
      setSettings({
        custom_statuses: [],
        workflows: {},
        auto_alerts: [],
        document_templates: [],
        default_status: "PRE_RESERVATION",
        require_destination: true,
        require_departure_date: true,
        require_operator: false,
        require_customer: false,
        alert_payment_due_days: 30,
        alert_operator_payment_days: 30,
        alert_upcoming_trip_days: 7,
        auto_generate_quotation: false,
        auto_generate_invoice: false,
        require_documents_before_confirmation: false,
        auto_create_ledger_entry: true,
        auto_create_iva_entry: true,
        auto_create_operator_payment: true,
      })
    } finally {
      setLoading(false)
    }
  }

  return { settings, loading, error, refetch: loadSettings }
}
