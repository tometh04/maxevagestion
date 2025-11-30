import { OperatorPaymentsPageClient } from "@/components/accounting/operator-payments-page-client"

export default function OperatorPaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Pagos a Operadores</h1>
        <p className="text-muted-foreground">
          Gestión de cuentas a pagar a operadores
        </p>
      </div>

      <OperatorPaymentsPageClient />
    </div>
  )
}

