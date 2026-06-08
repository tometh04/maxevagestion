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
import { useSortableData, SortableTableHead } from "@/components/ui/sortable-header"

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

interface Category {
  id: string
  name: string
  color: string
}

interface Totals {
  ars: number
  usd: number
  count: number
  countRecurring: number
  countVariable: number
}

interface MonthlyExpensesTabProps {
  agencies: Array<{ id: string; name: string }>
}

export function MonthlyExpensesTab({ agencies }: MonthlyExpensesTabProps) {
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
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [agencyFilter, setAgencyFilter] = useState("ALL")
  const [categories, setCategories] = useState<Category[]>([])

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ dateFrom, dateTo })
      if (currencyFilter !== "ALL") params.set("currency", currencyFilter)
      if (categoryFilter !== "all") params.set("categoryId", categoryFilter)
      if (agencyFilter !== "ALL") params.set("agencyId", agencyFilter)

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
  }, [dateFrom, dateTo, currencyFilter, categoryFilter, agencyFilter])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  // Cargar categorías para el filtro (mismas que /gastos tab Variables)
  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await fetch("/api/expenses/categories")
        if (res.ok) {
          const data = await res.json()
          setCategories(data.categories || [])
        }
      } catch (err) {
        console.error("Error fetching categories:", err)
      }
    }
    loadCategories()
  }, [])

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const { sortedData: sortedExpenses, sortConfig, requestSort } = useSortableData(expenses, { key: "movement_date", direction: "desc" })

  // Client-side type filter
  const filteredExpenses = typeFilter === "ALL"
    ? sortedExpenses
    : sortedExpenses.filter((e) => e.expense_type === typeFilter)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border/40 p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-xs font-medium text-muted-foreground">Total Egresos ARS</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{formatCurrency(totals.ars, "ARS")}</p>
        </div>
        <div className="rounded-xl border border-border/40 p-5">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-success" />
              <span className="text-xs font-medium text-muted-foreground">Total Egresos USD</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{formatCurrency(totals.usd, "USD")}</p>
        </div>
        <div className="rounded-xl border border-border/40 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Repeat className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Gastos Fijos</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{totals.countRecurring}</p>
        </div>
        <div className="rounded-xl border border-border/40 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Receipt className="h-4 w-4 text-accent-coral" />
              <span className="text-xs font-medium text-muted-foreground">Gastos Variables</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{totals.countVariable}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">Desde</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">Tipo</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
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
          <Label className="text-xs font-medium text-muted-foreground">Categoría</Label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                    {cat.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">Moneda</Label>
          <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              <SelectItem value="ARS">ARS</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {agencies.length > 1 && (
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Agencia</Label>
            <Select value={agencyFilter} onValueChange={setAgencyFilter}>
              <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                {agencies.map((agency) => (
                  <SelectItem key={agency.id} value={agency.id}>
                    {agency.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
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
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="movement_date" sortConfig={sortConfig} onSort={requestSort}>Fecha</SortableTableHead>
                <SortableTableHead sortKey="description" sortConfig={sortConfig} onSort={requestSort}>Descripción</SortableTableHead>
                <SortableTableHead sortKey="expense_type" sortConfig={sortConfig} onSort={requestSort}>Tipo</SortableTableHead>
                <SortableTableHead sortKey="amount" sortConfig={sortConfig} onSort={requestSort} className="text-right">Monto</SortableTableHead>
                <SortableTableHead sortKey="financial_accounts.name" sortConfig={sortConfig} onSort={requestSort}>Cuenta</SortableTableHead>
                <SortableTableHead sortKey="users.name" sortConfig={sortConfig} onSort={requestSort}>Usuario</SortableTableHead>
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
                      className={expense.expense_type === "recurring" ? "border-primary/30 text-primary" : "border-accent-coral/30 text-accent-coral"}
                    >
                      {expense.expense_type === "recurring" ? "Fijo" : "Variable"}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right font-medium ${expense.currency === "USD" ? "text-success" : ""}`}>
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
        </div>
      )}
    </div>
  )
}
