import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/currency"

export interface CashSummary {
  totalIncome: number
  totalExpenses: number
  netCash: number
  pendingCustomers: number
  pendingOperators: number
}

export function CashKPIs({ 
  summary, 
  currency 
}: { 
  summary: CashSummary
  currency: "ARS" | "USD" | "ALL"
}) {
  const items = [
    { label: "Ingresos Totales", value: summary.totalIncome },
    { label: "Egresos Totales", value: summary.totalExpenses },
    { label: "Caja Neta", value: summary.netCash },
    { label: "Pendientes Clientes", value: summary.pendingCustomers },
    { label: "Pendientes Operadores", value: summary.pendingOperators },
  ]

  const currencyLabel = currency === "ARS" ? "ARS - Pesos Argentinos" : 
                       currency === "USD" ? "USD - Dólares Estadounidenses" : 
                       "Todas las Monedas"

  const displayCurrency = currency === "ALL" ? "ARS" : currency

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{currencyLabel}</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => (
          <Card key={item.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(item.value, displayCurrency)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
