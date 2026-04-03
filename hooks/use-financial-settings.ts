import { useState, useEffect } from "react"
import { DEFAULT_USD_ARS_FALLBACK_RATE } from "@/lib/accounting/exchange-rates"

export interface FinancialSettings {
  id?: string
  primary_currency: 'ARS' | 'USD'
  enabled_currencies: string[]
  exchange_rate_config: {
    source?: string
    auto_update?: boolean
    update_frequency?: string
  }
  default_usd_rate: number
  default_accounts: Record<string, string>
  auto_create_accounts: boolean
  enabled_payment_methods: string[]
  default_commission_rules: Record<string, any>
  auto_calculate_commissions: boolean
  auto_create_ledger_entries: boolean
  auto_create_iva_entries: boolean
  auto_create_operator_payments: boolean
  default_income_chart_account_id: string | null
  default_expense_chart_account_id: string | null
  auto_generate_invoices: boolean
  default_point_of_sale: number
  monthly_close_day: number
  auto_close_month: boolean
}

export function useFinancialSettings() {
  const [settings, setSettings] = useState<FinancialSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/finances/settings')
      
      if (!response.ok) {
        throw new Error('Error al cargar configuración')
      }

      const data = await response.json()
      setSettings(data)
    } catch (err: unknown) {
      console.error('Error loading financial settings:', err)
      const message = err instanceof Error ? err.message : 'Error al cargar configuración'
      setError(message)
      // Usar configuración por defecto si falla
      setSettings({
        primary_currency: 'USD',
        enabled_currencies: ['ARS', 'USD'],
        exchange_rate_config: {
          source: 'manual',
          auto_update: false,
        },
        default_usd_rate: DEFAULT_USD_ARS_FALLBACK_RATE,
        default_accounts: {},
        auto_create_accounts: false,
        enabled_payment_methods: ['CASH', 'BANK', 'MP'],
        default_commission_rules: {},
        auto_calculate_commissions: true,
        auto_create_ledger_entries: true,
        auto_create_iva_entries: true,
        auto_create_operator_payments: true,
        default_income_chart_account_id: null,
        default_expense_chart_account_id: null,
        auto_generate_invoices: false,
        default_point_of_sale: 1,
        monthly_close_day: 1,
        auto_close_month: false,
      })
    } finally {
      setLoading(false)
    }
  }

  return { settings, loading, error, refetch: loadSettings }
}
