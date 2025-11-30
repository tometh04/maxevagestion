import { RecurringPaymentsPageClient } from "@/components/accounting/recurring-payments-page-client"

export default function RecurringPaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Pagos Recurrentes</h1>
        <p className="text-muted-foreground">
          Gestión de pagos recurrentes a proveedores (mensuales, semanales, etc.)
        </p>
      </div>

      <RecurringPaymentsPageClient />
    </div>
  )
}

