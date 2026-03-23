"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, DollarSign, Repeat, Receipt, TrendingDown } from "lucide-react"

interface Expense {
  id: string
  description: string
  provider_name: string | null
  expense_type: "recurring" | "variable"
  currency: string
  amount: number
  exchange_rate: number | null
  movement_date: string
  notes: string | null
  category: string | null
  financial_accounts: { id: string; name: string; currency: string } | null
  users: { id: string; name: string } | null
}

interface Totals {
  ars: number
  usd: number
  count: number
  countRecurring: number
  countVariable: number
}

export function MonthlyExpensesTab() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [totals, setTotals] = useState<Totals>({ ars: 0, usd: 0, count: 0, countRecurring: 0, countVariable: 0 })
  const [loading, setLoading] = useState(true)

  // Default to current month
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split("T")[0]
  })
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    d.setDate(0) // last day of current month
    return d.toISOString().split("T")[0]
  })
  const [currencyFilter, setCurrencyFilter] = useState("ALL")
  const [typeFilter, setTypeFilter] = useState("ALL")

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ dateFrom, dateTo })
      if (currencyFilter !== "ALL") params.set("currency", currencyFilter)

      const res = await fetch(`/api/expenses/monthly?${params}`)
      if (res.ok) {
        const data = await res.json()
        setExpenses(data.expenses || [])
        setTotals(data.totals || { ars: 0, usd: 0, count: 0, countRecurring: 0, countVariable: 0 })
      }
    } catch (err) {
      console.error("Error fetching monthly expenses:", err)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, currencyFilter])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount)
  }

  // Client-side type filter
  const filteredExpenses = typeFilter === "ALL"
    ? expenses
    : expenses.filter((e) => e.expense_type === typeFilter)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              <span className="text-xs text-muted-foreground">Total Egresos ARS</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totals.ars, "ARS")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Total Egresos USD</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totals.usd, "USD")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Repeat className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">Gastos Fijos</span>
            </div>
            <p className="text-2xl font-bold">{totals.countRecurring}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Receipt className="h-4 w-4 text-orange-600" />
              <span className="text-xs text-muted-foreground">Gastos Variables</span>
            </div>
            <p className="text-2xl font-bold">{totals.countVariable}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Desde</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="recurring">Fijos / Recurrentes</SelectItem>
              <SelectItem value="variable">Variables</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Moneda</Label>
          <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              <SelectItem value="ARS">ARS</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredExpenses.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No hay egresos en el período seleccionado
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead>Usuario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="text-sm">
                    {new Date(expense.movement_date).toLocaleDateString("es-AR")}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{expense.description}</p>
                      {expense.notes && (
                        <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                          {expense.notes}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={expense.expense_type === "recurring" ? "border-blue-400 text-blue-600" : "border-orange-400 text-orange-600"}
                    >
                      {expense.expense_type === "recurring" ? "Fijo" : "Variable"}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right font-medium ${expense.currency === "USD" ? "text-emerald-600" : ""}`}>
                    {formatCurrency(expense.amount, expense.currency)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {expense.financial_accounts?.name || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {expense.users?.name || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
