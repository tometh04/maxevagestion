import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/currency"

export interface CashSummary {
  ars: {
    totalIncome: number
    totalExpenses: number
    netCash: number
    pendingCustomers: number
    pendingOperators: number
  }
  usd: {
    totalIncome: number
    totalExpenses: number
    netCash: number
    pendingCustomers: number
    pendingOperators: number
  }
}

function KPIRow({ 
  title, 
  summary, 
  currency 
}: { 
  title: string
  summary: CashSummary["ars"] | CashSummary["usd"]
  currency: "ARS" | "USD"
}) {
  const items = [
    { label: "Ingresos Totales", value: summary.totalIncome },
    { label: "Egresos Totales", value: summary.totalExpenses },
    { label: "Caja Neta", value: summary.netCash },
    { label: "Pendientes Clientes", value: summary.pendingCustomers },
    { label: "Pendientes Operadores", value: summary.pendingOperators },
  ]

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => (
          <Card key={item.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(item.value, currency)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export function CashKPIs({ summary }: { summary: CashSummary }) {
  return (
    <div className="space-y-6">
      <KPIRow title="ARS - Pesos Argentinos" summary={summary.ars} currency="ARS" />
      <KPIRow title="USD - Dólares Estadounidenses" summary={summary.usd} currency="USD" />
    </div>
  )
}
