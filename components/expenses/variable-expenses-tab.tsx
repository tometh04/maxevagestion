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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Loader2, Plus, FileText, DollarSign, MoreHorizontal, Pencil, Trash2, CreditCard } from "lucide-react"
import { useSortableData, SortableTableHead } from "@/components/ui/sortable-header"
import { NewVariableExpenseDialog } from "./new-variable-expense-dialog"
import { ExpenseReceiptDialog } from "./expense-receipt-dialog"
import { CCPaymentDialog } from "./cc-payment-dialog"

const CLASSIFICATION_BADGES: Record<string, { label: string; className: string }> = {
  GASTOS_AGENCIA: { label: "Agencia", className: "border-primary/30 text-primary dark:text-primary" },
  VENTAS: { label: "Ventas", className: "border-success/30 text-success dark:text-success" },
  RETIRO_PERSONAL: { label: "Retiro", className: "border-accent-coral/30 text-accent-coral dark:text-accent-coral" },
}

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
  expense_classification: string | null
  cc_payment_group_id: string | null
}

interface VariableExpensesTabProps {
  agencies: Array<{ id: string; name: string }>
}

export function VariableExpensesTab({ agencies }: VariableExpensesTabProps) {
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
  const [agencyFilter, setAgencyFilter] = useState("ALL")

  // Dialogs
  const [newExpenseOpen, setNewExpenseOpen] = useState(false)
  const [ccPaymentOpen, setCcPaymentOpen] = useState(false)
  const [receiptDialog, setReceiptDialog] = useState<{ open: boolean; expenseId: string; name: string }>({
    open: false,
    expenseId: "",
    name: "",
  })
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; expense: Expense | null }>({
    open: false,
    expense: null,
  })
  const [editDialog, setEditDialog] = useState<{ open: boolean; expense: Expense | null }>({
    open: false,
    expense: null,
  })
  const [editForm, setEditForm] = useState({ category: "", notes: "", movement_date: "", category_id: "" })
  const [saving, setSaving] = useState(false)

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ dateFrom, dateTo })
      if (categoryFilter !== "all") params.set("categoryId", categoryFilter)
      if (currencyFilter !== "ALL") params.set("currency", currencyFilter)
      if (agencyFilter !== "ALL") params.set("agencyId", agencyFilter)

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
  }, [dateFrom, dateTo, categoryFilter, currencyFilter, agencyFilter])

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

  const openEditDialog = (expense: Expense) => {
    setEditForm({
      category: expense.category || "",
      notes: expense.notes || "",
      movement_date: expense.movement_date?.split("T")[0] || "",
      category_id: expense.category_id || "",
    })
    setEditDialog({ open: true, expense })
  }

  const handleEdit = async () => {
    if (!editDialog.expense) return
    setSaving(true)
    try {
      const categoryName = editForm.category_id
        ? categories.find((c) => c.id === editForm.category_id)?.name || editForm.category
        : editForm.category
      const res = await fetch(`/api/expenses/variable/${editDialog.expense.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: categoryName,
          category_id: editForm.category_id || null,
          notes: editForm.notes || null,
          movement_date: editForm.movement_date || undefined,
        }),
      })
      if (res.ok) {
        setEditDialog({ open: false, expense: null })
        fetchExpenses()
      }
    } catch (err) {
      console.error("Error editing expense:", err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteDialog.expense) return
    setSaving(true)
    try {
      const res = await fetch(`/api/expenses/variable/${deleteDialog.expense.id}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setDeleteDialog({ open: false, expense: null })
        fetchExpenses()
      }
    } catch (err) {
      console.error("Error deleting expense:", err)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  const { sortedData: sortedExpenses, sortConfig, requestSort } = useSortableData(expenses, { key: "movement_date", direction: "desc" })

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
        <div className="rounded-xl border border-border/40 p-5">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Total ARS</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{formatCurrency(totals.ars, "ARS")}</p>
        </div>
        <div className="rounded-xl border border-border/40 p-5">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-success" />
              <span className="text-xs font-medium text-muted-foreground">Total USD</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{formatCurrency(totals.usd, "USD")}</p>
        </div>
      </div>

      {/* Filters + Action */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">Desde</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[150px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">Hasta</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[150px]"
          />
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
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setCcPaymentOpen(true)} className="rounded-full">
            <CreditCard className="h-4 w-4 mr-2" />
            Pago Tarjeta
          </Button>
          <Button size="sm" onClick={() => setNewExpenseOpen(true)} className="rounded-full">
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
      ) : sortedExpenses.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No hay gastos variables en el período seleccionado
        </div>
      ) : (
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="movement_date" sortConfig={sortConfig} onSort={requestSort}>Fecha</SortableTableHead>
                <SortableTableHead sortKey="category" sortConfig={sortConfig} onSort={requestSort}>Descripción</SortableTableHead>
                <SortableTableHead sortKey="category_info.name" sortConfig={sortConfig} onSort={requestSort}>Categoría</SortableTableHead>
                <SortableTableHead sortKey="amount" sortConfig={sortConfig} onSort={requestSort} className="text-right">Monto</SortableTableHead>
                <SortableTableHead sortKey="financial_account.name" sortConfig={sortConfig} onSort={requestSort}>Cuenta</SortableTableHead>
                <SortableTableHead sortKey="expense_classification" sortConfig={sortConfig} onSort={requestSort}>Tipo</SortableTableHead>
                <TableHead className="text-center">Comprobante</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedExpenses.map((expense) => (
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
                  <TableCell>
                    {expense.expense_classification && CLASSIFICATION_BADGES[expense.expense_classification] ? (
                      <Badge
                        variant="outline"
                        className={`text-xs ${CLASSIFICATION_BADGES[expense.expense_classification].className}`}
                      >
                        {CLASSIFICATION_BADGES[expense.expense_classification].label}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(expense)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteDialog({ open: true, expense })}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <NewVariableExpenseDialog
        open={newExpenseOpen}
        onOpenChange={setNewExpenseOpen}
        onSuccess={fetchExpenses}
        agencies={agencies}
      />
      <CCPaymentDialog
        open={ccPaymentOpen}
        onOpenChange={setCcPaymentOpen}
        onSuccess={fetchExpenses}
      />
      <ExpenseReceiptDialog
        open={receiptDialog.open}
        onOpenChange={(open) => setReceiptDialog((prev) => ({ ...prev, open }))}
        expenseType="variable"
        expenseId={receiptDialog.expenseId}
        expenseName={receiptDialog.name}
      />

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => setEditDialog({ open, expense: open ? editDialog.expense : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Gasto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={editForm.category_id || "none"} onValueChange={(val) => setEditForm((f) => ({ ...f, category_id: val === "none" ? "" : val }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin categoría</SelectItem>
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
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={editForm.movement_date}
                onChange={(e) => setEditForm((f) => ({ ...f, movement_date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Input
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Notas adicionales..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, expense: null })}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, expense: open ? deleteDialog.expense : null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar gasto</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog.expense && (
                <>
                  Vas a eliminar el gasto <strong>{deleteDialog.expense.category}</strong> por{" "}
                  <strong>{formatCurrency(deleteDialog.expense.amount, deleteDialog.expense.currency)}</strong>.
                  Esto revertirá el movimiento contable. Esta acción no se puede deshacer.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive"
              disabled={saving}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
