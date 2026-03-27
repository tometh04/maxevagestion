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
          <div key={item.label} className="rounded-xl border border-border/40 p-5">
            <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
            <p className="text-2xl font-semibold tabular-nums tracking-tight mt-1">
              {formatCurrency(item.value, displayCurrency)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
