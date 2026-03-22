"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { Loader2, Plus, FileText, DollarSign } from "lucide-react"
import { NewVariableExpenseDialog } from "./new-variable-expense-dialog"
import { ExpenseReceiptDialog } from "./expense-receipt-dialog"

interface Category {
  id: string
  name: string
  color: string
}

interface Expense {
  id: string
  category: string
  category_id: string | null
  category_info: Category | null
  amount: number
  currency: string
  movement_date: string
  notes: string | null
  receipt_count: number
  financial_account: { id: string; name: string; currency: string } | null
  users: { name: string } | null
}

export function VariableExpensesTab() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [totals, setTotals] = useState({ ars: 0, usd: 0 })
  const [loading, setLoading] = useState(true)

  // Filters
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(1) // First day of current month
    return d.toISOString().split("T")[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0])
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [currencyFilter, setCurrencyFilter] = useState("ALL")

  // Dialogs
  const [newExpenseOpen, setNewExpenseOpen] = useState(false)
  const [receiptDialog, setReceiptDialog] = useState<{ open: boolean; expenseId: string; name: string }>({
    open: false,
    expenseId: "",
    name: "",
  })

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ dateFrom, dateTo })
      if (categoryFilter !== "all") params.set("categoryId", categoryFilter)
      if (currencyFilter !== "ALL") params.set("currency", currencyFilter)

      const res = await fetch(`/api/expenses/variable?${params}`)
      if (res.ok) {
        const data = await res.json()
        setExpenses(data.expenses || [])
        setTotals(data.totals || { ars: 0, usd: 0 })
      }
    } catch (err) {
      console.error("Error fetching expenses:", err)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, categoryFilter, currencyFilter])

  const fetchCategories = async () => {
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

  useEffect(() => {
    fetchCategories()
  }, [])

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

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">Total ARS</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totals.ars, "ARS")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Total USD</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totals.usd, "USD")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Action */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Desde</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[150px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hasta</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[150px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Categoría</Label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]">
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
        <div className="ml-auto">
          <Button onClick={() => setNewExpenseOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Gasto
          </Button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No hay gastos variables en el período seleccionado
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead className="text-center">Comprobante</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="text-sm">
                    {new Date(expense.movement_date).toLocaleDateString("es-AR")}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{expense.category}</p>
                      {expense.notes && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {expense.notes}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {expense.category_info ? (
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{
                          borderColor: expense.category_info.color,
                          color: expense.category_info.color,
                        }}
                      >
                        {expense.category_info.name}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{expense.category}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(expense.amount, expense.currency)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {expense.financial_account?.name || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setReceiptDialog({
                          open: true,
                          expenseId: expense.id,
                          name: expense.category,
                        })
                      }
                    >
                      <FileText className="h-4 w-4" />
                      {expense.receipt_count > 0 && (
                        <Badge variant="secondary" className="ml-1 text-xs px-1">
                          {expense.receipt_count}
                        </Badge>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialogs */}
      <NewVariableExpenseDialog
        open={newExpenseOpen}
        onOpenChange={setNewExpenseOpen}
        onSuccess={fetchExpenses}
      />
      <ExpenseReceiptDialog
        open={receiptDialog.open}
        onOpenChange={(open) => setReceiptDialog((prev) => ({ ...prev, open }))}
        expenseType="variable"
        expenseId={receiptDialog.expenseId}
        expenseName={receiptDialog.name}
      />
    </div>
  )
}
