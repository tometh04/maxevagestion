"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { ServerPagination } from "@/components/ui/server-pagination"
import { MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface PaymentOperation {
  id: string
  destination: string
  agency_id?: string | null
  agencies?: { name: string | null } | null
  sellers?: { name: string | null } | null
}

export interface Payment {
  id: string
  operation_id: string
  payer_type: "CUSTOMER" | "OPERATOR"
  direction: "INCOME" | "EXPENSE"
  method: string
  amount: number
  currency: string
  date_due: string
  date_paid: string | null
  status: "PENDING" | "PAID" | "OVERDUE"
  reference: string | null
  operations?: PaymentOperation | null
}

interface PaymentsTableProps {
  payments?: Payment[] // Opcional: si no se pasa, carga sus propios datos con paginación
  isLoading?: boolean
  onRefresh?: () => void
  emptyMessage?: string
  // Filtros para paginación server-side
  dateFrom?: string
  dateTo?: string
  currency?: string
  agencyId?: string
  status?: string
  payerType?: string
  direction?: string
}

export function PaymentsTable({ 
  payments: initialPayments, 
  isLoading: externalLoading = false, 
  onRefresh, 
  emptyMessage,
  dateFrom,
  dateTo,
  currency,
  agencyId,
  status,
  payerType,
  direction,
}: PaymentsTableProps) {
  const [payments, setPayments] = useState<Payment[]>(initialPayments || [])
  const [loading, setLoading] = useState(!initialPayments)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [datePaid, setDatePaid] = useState("")
  const [reference, setReference] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Estado de paginación server-side
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  
  // Si se pasan payments como prop, usarlos (modo legacy)
  // Si no, cargar con paginación server-side
  const useServerPagination = !initialPayments
  
  const fetchPayments = useCallback(async () => {
    if (!useServerPagination) return // Si se pasan payments como prop, no cargar
    
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.append("dateFrom", dateFrom)
      if (dateTo) params.append("dateTo", dateTo)
      if (currency) params.append("currency", currency)
      if (agencyId && agencyId !== "ALL") params.append("agencyId", agencyId)
      if (status && status !== "ALL") params.append("status", status)
      if (payerType && payerType !== "ALL") params.append("payerType", payerType)
      if (direction && direction !== "ALL") params.append("direction", direction)
      params.append("page", page.toString())
      params.append("limit", limit.toString())

      const response = await fetch(`/api/payments?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setPayments(data.payments || [])
        // El API retorna paginación dentro de un objeto 'pagination'
        const pagination = data.pagination || {}
        setTotal(pagination.total || 0)
        setTotalPages(pagination.totalPages || 0)
        setHasMore(pagination.hasMore || false)
      }
    } catch (error) {
      console.error("Error fetching payments:", error)
    } finally {
      setLoading(false)
    }
  }, [useServerPagination, dateFrom, dateTo, currency, agencyId, status, payerType, direction, page, limit])
  
  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])
  
  // Si se pasan payments como prop, actualizar cuando cambien
  useEffect(() => {
    if (initialPayments) {
      setPayments(initialPayments)
    }
  }, [initialPayments])

  const columns: ColumnDef<Payment & { searchText?: string }>[] = useMemo(
    () => [
      {
        id: "searchText",
        accessorKey: "searchText",
        enableHiding: false,
        enableSorting: false,
        enableColumnFilter: true,
        filterFn: (row, id, value) => {
          const searchText = row.getValue(id) as string
          return searchText?.toLowerCase().includes(value.toLowerCase()) ?? false
        },
      },
      {
        accessorKey: "date_due",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Vencimiento" />
        ),
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            {format(new Date(row.original.date_due), "dd/MM/yyyy", {
              locale: es,
            })}
          </div>
        ),
      },
      {
        accessorKey: "date_paid",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Pago" />
        ),
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            {row.original.date_paid
              ? format(new Date(row.original.date_paid), "dd/MM/yyyy", {
                  locale: es,
                })
              : "-"}
          </div>
        ),
      },
      {
        id: "operation",
        header: "Operación",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium">
              {row.original.operations?.destination || "Sin destino"}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.original.operations?.agencies?.name || "Sin agencia"}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "payer_type",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Payer" />
        ),
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.payer_type === "CUSTOMER" ? "Cliente" : "Operador"}
          </Badge>
        ),
      },
      {
        accessorKey: "direction",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Dirección" />
        ),
        cell: ({ row }) => (
          <Badge
            variant={row.original.direction === "INCOME" ? "default" : "destructive"}
          >
            {row.original.direction === "INCOME" ? "Ingreso" : "Egreso"}
          </Badge>
        ),
      },
      {
        accessorKey: "amount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Monto" />
        ),
        cell: ({ row }) => (
          <div>
            {row.original.currency}{" "}
            {row.original.amount.toLocaleString("es-AR", {
              minimumFractionDigits: 2,
            })}
          </div>
        ),
      },
      {
        accessorKey: "method",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Método" />
        ),
        cell: ({ row }) => <div>{row.original.method}</div>,
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Estado" />
        ),
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.status === "PAID"
                ? "default"
                : row.original.status === "OVERDUE"
                ? "destructive"
                : "secondary"
            }
          >
            {row.original.status === "PAID"
              ? "Pagado"
              : row.original.status === "OVERDUE"
              ? "Vencido"
              : "Pendiente"}
          </Badge>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => {
          const payment = row.original

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Abrir menú</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                {payment.status !== "PAID" && (
                  <DropdownMenuItem
                    onClick={async () => {
                      setSelectedPayment(payment)
                      setDatePaid(new Date().toISOString().split("T")[0])
                      setReference(payment.reference || "")
                      setFinancialAccountId("")
                      
                      // Si el método es "Transferencia", cargar cuentas financieras
                      if (payment.method === "Transferencia") {
                        try {
                          const response = await fetch("/api/accounting/financial-accounts")
                          if (response.ok) {
                            const data = await response.json()
                            const bankAccounts = (data.accounts || []).filter(
                              (acc: any) =>
                                acc.is_active !== false &&
                                (acc.type === "CHECKING_ARS" ||
                                  acc.type === "CHECKING_USD" ||
                                  acc.type === "SAVINGS_ARS" ||
                                  acc.type === "SAVINGS_USD") &&
                                acc.currency === payment.currency
                            )
                            setFinancialAccounts(bankAccounts)
                          }
                        } catch (error) {
                          console.error("Error fetching financial accounts:", error)
                        }
                      } else {
                        setFinancialAccounts([])
                      }
                      
                      setDialogOpen(true)
                    }}
                  >
                    Marcar como pagado
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    []
  )

  const handleConfirm = async () => {
    if (!selectedPayment || !datePaid) return

    // Validar que si el método es "Transferencia", se haya seleccionado una cuenta
    if (selectedPayment.method === "Transferencia" && !financialAccountId) {
      alert("Debe seleccionar una cuenta receptiva para transferencias bancarias")
      return
    }

    setIsSubmitting(true)

    try {
      await fetch("/api/payments/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: selectedPayment.id,
          datePaid,
          reference: reference || null,
          financial_account_id: financialAccountId || null,
        }),
      })

      setDialogOpen(false)
      setSelectedPayment(null)
      onRefresh?.()
      if (useServerPagination) {
        fetchPayments() // Recargar si usa paginación server-side
      }
    } catch (error) {
      console.error("Error al marcar pago:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isLoading = externalLoading || (loading && useServerPagination)

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <div className="p-4">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <DataTable
          columns={columns}
          data={payments.map((p) => ({
            ...p,
            searchText: `${p.operations?.destination || ""} ${p.operations?.agencies?.name || ""}`.toLowerCase(),
          }))}
          searchKey="searchText"
          searchPlaceholder="Buscar por destino o agencia..."
          showPagination={false}
        />
        
        {/* Paginación server-side (solo si no se pasan payments como prop) */}
        {useServerPagination && total > 0 && (
          <ServerPagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            hasMore={hasMore}
            onPageChange={setPage}
            onLimitChange={(newLimit) => {
              setLimit(newLimit)
              setPage(1) // Resetear a página 1
            }}
            limitOptions={[25, 50, 100, 200]}
          />
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar pago</DialogTitle>
            <DialogDescription>
              Completa la información para marcar este pago como pagado y registrar el movimiento en caja.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Fecha de pago</Label>
              <DatePicker
                value={datePaid}
                onChange={setDatePaid}
                placeholder="Seleccionar fecha"
              />
            </div>
            <div>
              <Label>Referencia / Notas</Label>
              <Input
                value={reference}
                placeholder="Recibo, transferencia, etc."
                onChange={(event) => setReference(event.target.value)}
              />
            </div>
            
            {/* Mostrar selector de cuenta solo si el método es "Transferencia" */}
            {selectedPayment?.method === "Transferencia" && (
              <div>
                <Label>Cuenta Receptiva *</Label>
                <Select value={financialAccountId} onValueChange={setFinancialAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cuenta bancaria" />
                  </SelectTrigger>
                  <SelectContent>
                    {financialAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} ({account.currency})
                        {account.current_balance !== undefined && (
                          <span className="text-xs text-muted-foreground ml-2">
                            - Balance: {account.current_balance.toLocaleString("es-AR", {
                              style: "currency",
                              currency: account.currency,
                            })}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDialogOpen(false)
              setFinancialAccountId("")
              setFinancialAccounts([])
            }} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={isSubmitting || !datePaid || (selectedPayment?.method === "Transferencia" && !financialAccountId)}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
