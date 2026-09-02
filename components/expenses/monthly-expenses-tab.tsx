"use client"

import { useState, useEffect, useCallback } from "react"
import { movementDayLabel } from "@/lib/utils/date-range"
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
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Loader2, DollarSign, Repeat, Receipt, TrendingDown, MoreHorizontal, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useSortableData, SortableTableHead } from "@/components/ui/sortable-header"
// Fix UTC shift en fechas DATE (VICO 2026-05-22)
import { formatDateOnlyLocal } from "@/lib/utils/date-only"

interface Expense {
  id: string
  description: string
  provider_name: string | null
  expense_type: "recurring" | "variable"
  currency: string
  amount: number
  exchange_rate: number | null
  /** Importe y moneda tal como se pagó, cuando la vista está valuada. */
  original_amount?: number
  original_currency?: string
  movement_date: string
  /** Fecha de negocio (VIB-178). Es la que se muestra y con la que se filtra. */
  movement_day?: string | null
  notes: string | null
  category: string | null
  financial_accounts: { id: string; name: string; currency: string } | null
  users: { id: string; name: string } | null
}

/** Gastos que quedaron fuera de la valuación por no haber TC de esas fechas. */
interface MissingRate {
  currency: string
  count: number
  total: number
}

/**
 * Moneda en la que se leen los montos. "ORIGINAL" = como se pagó cada gasto;
 * ARS/USD valúan todo a esa moneda. El default es ORIGINAL: valuar es una
 * decisión del usuario, no lo que pasa por no elegir nada (VIB-99).
 */
type CurrencyView = "ORIGINAL" | "ARS" | "USD"

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
  arsRecurring: number
  arsVariable: number
  usdRecurring: number
  usdVariable: number
}

interface MonthlyExpensesTabProps {
  agencies: Array<{ id: string; name: string }>
}

export function MonthlyExpensesTab({ agencies }: MonthlyExpensesTabProps) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  // VIB-179: borrar el pago de un gasto fijo, sin depender de que lo haga
  // alguien por atrás.
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; expense: Expense | null }>({
    open: false,
    expense: null,
  })
  const [deleting, setDeleting] = useState(false)
  const [totals, setTotals] = useState<Totals>({ ars: 0, usd: 0, count: 0, countRecurring: 0, countVariable: 0, arsRecurring: 0, arsVariable: 0, usdRecurring: 0, usdVariable: 0 })
  const [loading, setLoading] = useState(true)

  // Default to current month
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return formatDateOnlyLocal(d) ?? ""
  })
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    d.setDate(0) // last day of current month
    return formatDateOnlyLocal(d) ?? ""
  })
  const [currencyView, setCurrencyView] = useState<CurrencyView>("ORIGINAL")
  const [missingRate, setMissingRate] = useState<MissingRate[]>([])
  const [typeFilter, setTypeFilter] = useState("ALL")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [agencyFilter, setAgencyFilter] = useState("ALL")
  // Criterio del filtro por agencia: "office" = oficina a la que se cargó el
  // gasto; "account" = oficina de la cuenta desde la que salió la plata.
  const [agencyMode, setAgencyMode] = useState<"office" | "account">("office")
  const [categories, setCategories] = useState<Category[]>([])

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    try {
      // Siempre explícita: el server no tiene que adivinar en qué moneda
      // quiere leer el usuario.
      const params = new URLSearchParams({ dateFrom, dateTo, currency: currencyView })
      if (categoryFilter !== "all") params.set("categoryId", categoryFilter)
      if (agencyFilter !== "ALL") {
        params.set("agencyId", agencyFilter)
        params.set("agencyMode", agencyMode)
      }

      const res = await fetch(`/api/expenses/monthly?${params}`)
      if (res.ok) {
        const data = await res.json()
        setExpenses(data.expenses || [])
        setTotals(data.totals || { ars: 0, usd: 0, count: 0, countRecurring: 0, countVariable: 0, arsRecurring: 0, arsVariable: 0, usdRecurring: 0, usdVariable: 0 })
        setMissingRate(data.missingRate || [])
      }
    } catch (err) {
      console.error("Error fetching monthly expenses:", err)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, currencyView, categoryFilter, agencyFilter, agencyMode])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  /**
   * Borra el pago de un gasto fijo (VIB-179).
   *
   * El backend también devuelve la recurrencia al período borrado, así que
   * después de esto el gasto vuelve a figurar como pendiente y se puede volver
   * a pagar con la fecha correcta. Es el caso que lo motivó.
   */
  const handleDelete = async () => {
    if (!deleteDialog.expense) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/expenses/monthly/${deleteDialog.expense.id}`, {
        method: "DELETE",
      })
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        toast.error(payload?.error || "No se pudo eliminar el gasto")
        return
      }

      toast.success(
        payload?.recurrence
          ? "Gasto eliminado. El gasto fijo vuelve a figurar como pendiente."
          : "Gasto eliminado"
      )
      setDeleteDialog({ open: false, expense: null })
      fetchExpenses()
    } catch (err) {
      console.error("Error eliminando el gasto fijo:", err)
      toast.error("No se pudo eliminar el gasto")
    } finally {
      setDeleting(false)
    }
  }

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

  const formatRate = (rate: number) =>
    new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(rate)

  // En moneda original hay dos totales que no se pueden sumar (ARS y USD) y se
  // muestran por separado. Valuado, hay uno solo: mostrar además una tarjeta
  // "Total USD" en cero —lo que veía el cliente— es directamente engañoso.
  const isOriginal = currencyView === "ORIGINAL"
  const viewCurrency = isOriginal ? "ARS" : currencyView
  const valuedTotal = currencyView === "USD" ? totals.usd : totals.ars
  const recurringTotal = currencyView === "USD" ? totals.usdRecurring : totals.arsRecurring
  const variableTotal = currencyView === "USD" ? totals.usdVariable : totals.arsVariable

  const { sortedData: sortedExpenses, sortConfig, requestSort } = useSortableData(expenses, { key: "movement_date", direction: "desc" })

  // Client-side type filter
  const filteredExpenses = typeFilter === "ALL"
    ? sortedExpenses
    : sortedExpenses.filter((e) => e.expense_type === typeFilter)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className={`grid gap-4 ${isOriginal ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        {isOriginal ? (
          <>
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
          </>
        ) : (
          <div className="rounded-xl border border-border/40 p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-xs font-medium text-muted-foreground">Total Egresos {viewCurrency}</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{formatCurrency(valuedTotal, viewCurrency)}</p>
            <p className="text-xs text-muted-foreground mt-1">Todo valuado en {viewCurrency}</p>
          </div>
        )}
        <div className="rounded-xl border border-border/40 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Repeat className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Gastos Fijos</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{formatCurrency(recurringTotal, viewCurrency)}</p>
            {isOriginal && totals.usdRecurring > 0 && (
              <p className="text-sm font-medium tabular-nums text-success">{formatCurrency(totals.usdRecurring, "USD")}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{totals.countRecurring} {totals.countRecurring === 1 ? "gasto" : "gastos"}</p>
        </div>
        <div className="rounded-xl border border-border/40 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Receipt className="h-4 w-4 text-accent-coral" />
              <span className="text-xs font-medium text-muted-foreground">Gastos Variables</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{formatCurrency(variableTotal, viewCurrency)}</p>
            {isOriginal && totals.usdVariable > 0 && (
              <p className="text-sm font-medium tabular-nums text-success">{formatCurrency(totals.usdVariable, "USD")}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{totals.countVariable} {totals.countVariable === 1 ? "gasto" : "gastos"}</p>
        </div>
      </div>

      {/* Gastos que no se pudieron valuar: nunca esconder lo que quedó afuera
          de los totales. */}
      {missingRate.length > 0 && (
        <div className="rounded-xl border border-accent-coral/40 bg-accent-coral/5 px-4 py-3">
          <p className="text-sm font-medium">
            {missingRate.map((m) => `${m.count} ${m.count === 1 ? "gasto" : "gastos"} en ${m.currency} (${formatCurrency(m.total, m.currency)})`).join(" y ")}
            {" "}sin cotización para su fecha
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            No están sumados en los totales en {viewCurrency}. Cargá el tipo de cambio de esas fechas o mirá la lista en moneda original.
          </p>
        </div>
      )}

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
          <Label className="text-xs font-medium text-muted-foreground">Ver montos en</Label>
          <Select value={currencyView} onValueChange={(v) => setCurrencyView(v as CurrencyView)}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ORIGINAL">Moneda original</SelectItem>
              <SelectItem value="ARS">Todo valuado en ARS</SelectItem>
              <SelectItem value="USD">Todo valuado en USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {agencies.length > 1 && (
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Ver por</Label>
            <Select value={agencyMode} onValueChange={(v) => setAgencyMode(v as "office" | "account")}>
              <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="office">Oficina del gasto</SelectItem>
                <SelectItem value="account">Cuenta pagadora</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
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
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="text-sm">
                    {movementDayLabel(expense.movement_day, expense.movement_date)}
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
                  <TableCell className="text-right">
                    <p className={`font-medium tabular-nums ${expense.currency === "USD" ? "text-success" : ""}`}>
                      {formatCurrency(expense.amount, expense.currency)}
                    </p>
                    {/* Si el importe está valuado, mostrar cómo se pagó y a qué
                        TC: sin esto el monto "cambia" sin explicación (VIB-99). */}
                    {expense.original_currency && expense.original_currency !== expense.currency && (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatCurrency(expense.original_amount ?? 0, expense.original_currency)}
                        {expense.exchange_rate ? ` · TC ${formatRate(expense.exchange_rate)}` : ""}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {expense.financial_accounts?.name || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {expense.users?.name || "—"}
                  </TableCell>
                  <TableCell>
                    {/* VIB-179: sólo los fijos. Un gasto variable se borra
                        desde su propia pestaña, que además permite editarlo y
                        dividirlo entre oficinas. */}
                    {expense.expense_type === "recurring" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Acciones</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setDeleteDialog({ open: true, expense })}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </div>
      )}

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) =>
          setDeleteDialog({ open, expense: open ? deleteDialog.expense : null })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar el pago de este gasto fijo</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {deleteDialog.expense && (
                  <p>
                    Vas a eliminar <strong>{deleteDialog.expense.description}</strong> por{" "}
                    <strong>
                      {formatCurrency(deleteDialog.expense.amount, deleteDialog.expense.currency)}
                    </strong>{" "}
                    del{" "}
                    {movementDayLabel(
                      deleteDialog.expense.movement_day,
                      deleteDialog.expense.movement_date
                    )}
                    .
                  </p>
                )}
                <p>
                  Se revierte el movimiento y su asiento contable, y el gasto fijo vuelve a
                  figurar como pendiente para que puedas volver a pagarlo con la fecha
                  correcta. No se borra el gasto fijo en sí: el mes que viene vence igual.
                </p>
                <p>Esta acción no se puede deshacer.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Sin esto el diálogo se cierra antes de que termine el borrado
                // y el usuario no ve si falló.
                event.preventDefault()
                handleDelete()
              }}
              className="bg-destructive hover:bg-destructive"
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
