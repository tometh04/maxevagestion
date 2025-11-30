import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export interface CashSummary {
  totalIncome: number
  totalExpenses: number
  netCash: number
  pendingCustomers: number
  pendingOperators: number
  currency: string
}

const formatter = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatAmount(amount: number, currency: string) {
  if (currency === "ALL") {
    return "Selecciona una moneda"
  }

  return `${currency} ${formatter.format(amount)}`
}

export function CashKPIs({ summary }: { summary: CashSummary }) {
  const items = [
    { label: "Ingresos Totales", value: summary.totalIncome },
    { label: "Egresos Totales", value: summary.totalExpenses },
    { label: "Caja Neta", value: summary.netCash },
    { label: "Pendientes Clientes", value: summary.pendingCustomers },
    { label: "Pendientes Operadores", value: summary.pendingOperators },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(item.value, summary.currency)}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
