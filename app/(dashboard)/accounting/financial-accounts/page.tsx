import { FinancialAccountsPageClient } from "@/components/accounting/financial-accounts-page-client"

export default function FinancialAccountsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cuentas Financieras</h1>
        <p className="text-muted-foreground">
          Gestión y balance de cuentas (Caja, Bancos, Mercado Pago, USD)
        </p>
      </div>

      <FinancialAccountsPageClient />
    </div>
  )
}

