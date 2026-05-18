"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { ServerPagination } from "@/components/ui/server-pagination"
import { MoreHorizontal, Info, Trash2, Loader2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { toast } from "sonner"
import { MarkPaidDialog } from "@/components/payments/mark-paid-dialog"
import { PaymentInfoDialog } from "@/components/payments/payment-info-dialog"
import Link from "next/link"

interface PaymentOperation {
  id: string
  destination: string
  file_code?: string | null
  agency_id?: string | null
  agencies?: { name: string | null } | null
  sellers?: { name: string | null } | null
  operation_customers?: Array<{
    role?: string
    customers?: { id: string; first_name: string; last_name: string } | null
  }> | null
}

interface PaymentLedger {
  id: string
  created_at: string
  receipt_number?: string | null
  method?: string | null
  notes?: string | null
  account_id?: string | null
  financial_accounts?: { name: string | null } | null
}

export interface Payment {
  id: string
  operation_id: string
  operator_id?: string | null
  operator_payment_id?: string | null
  payer_type: "CUSTOMER" | "OPERATOR"
  direction: "INCOME" | "EXPENSE"
  method: string
  amount: number
  currency: string
  date_due: string
  date_paid: string | null
  status: "PENDING" | "PAID" | "OVERDUE"
  reference: string | null
  created_at?: string
  updated_at?: string
  operations?: PaymentOperation | null
  operators?: { id: string; name: string; contact_email?: string | null } | null
  ledger_movements?: PaymentLedger | null
}

interface PaymentsTableProps {
  payments?: Payment[] // Opcional: si no se pasa, carga sus propios datos con paginación
  isLoading?: boolean
  onRefresh?: () => void
  emptyMessage?: string
  // Filtros para paginación server-side
  dateFrom?: string
  dateTo?: string
  dateType?: string
  currency?: string
  agencyId?: string
  status?: string
  payerType?: string
  direction?: string
  contactName?: string
}

export function PaymentsTable({
  payments: initialPayments,
  isLoading: externalLoading = false,
  onRefresh,
  emptyMessage,
  dateFrom,
  dateTo,
  dateType,
  currency,
  agencyId,
  status,
  payerType,
  direction,
  contactName,
}: PaymentsTableProps) {
  const [payments, setPayments] = useState<Payment[]>(initialPayments || [])
  const [loading, setLoading] = useState(!initialPayments)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [infoDialogOpen, setInfoDialogOpen] = useState(false)
  const [infoPayment, setInfoPayment] = useState<Payment | null>(null)
  // Estado para eliminar pago (2026-05-18, Tomi pidió esta opción en /cash):
  // antes solo se podía borrar desde dentro del detalle de la operación.
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
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
      if (dateType) params.append("dateType", dateType)
      if (currency) params.append("currency", currency)
      if (agencyId && agencyId !== "ALL") params.append("agencyId", agencyId)
      if (status && status !== "ALL") params.append("status", status)
      if (payerType && payerType !== "ALL") params.append("payerType", payerType)
      if (direction && direction !== "ALL") params.append("direction", direction)
      if (contactName && contactName.trim()) params.append("contactName", contactName.trim())
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
  }, [useServerPagination, dateFrom, dateTo, dateType, currency, agencyId, status, payerType, direction, contactName, page, limit])
  
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
            {row.original.operation_id ? (
              <Link
                href={`/operations/${row.original.operation_id}`}
                className="font-medium text-primary hover:underline"
                prefetch={false}
              >
                {row.original.operations?.destination || "Sin destino"}
              </Link>
            ) : (
              <p className="font-medium">
                {row.original.operations?.destination || "Sin destino"}
              </p>
            )}
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
          <div className="space-y-1">
            <Badge variant="outline">
              {row.original.payer_type === "CUSTOMER" ? "Cliente" : "Operador"}
            </Badge>
            {row.original.payer_type === "OPERATOR" && row.original.operators?.name && (
              <p className="text-xs text-muted-foreground">{row.original.operators.name}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Monto" className="justify-end" />
        ),
        cell: ({ row }) => (
          <div className="text-right">
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
                <DropdownMenuItem
                  onClick={() => {
                    setInfoPayment(payment)
                    setInfoDialogOpen(true)
                  }}
                >
                  <Info className="h-4 w-4 mr-2" />
                  Ver info
                </DropdownMenuItem>
                {payment.status !== "PAID" && (
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedPayment(payment)
                      setDialogOpen(true)
                    }}
                  >
                    Marcar como pagado
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  onClick={() => setPaymentToDelete(payment)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar pago
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    []
  )

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
        {/* Bug fix 2026-05-06: el DataTable tenía su propio search box
            ("Buscar por destino o agencia...") que duplicaba el search bar
            global del payments-page-client ("Buscar por destino, cliente...").
            Dos cajas de búsqueda lado a lado, una server-side y otra
            client-side, era confuso. Dejamos solo la global removiendo
            searchKey/searchPlaceholder de acá. */}
        <DataTable
          columns={columns}
          data={payments}
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

      <MarkPaidDialog
        payment={selectedPayment}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          onRefresh?.()
          if (useServerPagination) {
            fetchPayments() // Recargar si usa paginación server-side
          }
        }}
      />

      <PaymentInfoDialog
        open={infoDialogOpen}
        onOpenChange={setInfoDialogOpen}
        payment={infoPayment}
        type="customer"
      />

      {/* Eliminar pago — pedido por Tomi 2026-05-18. El endpoint DELETE
          /api/payments?paymentId=X ya existía pero solo se llamaba desde
          el detalle de la operación. Ahora también desde /cash. */}
      <AlertDialog
        open={paymentToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPaymentToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar pago</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Vas a eliminar este pago de{" "}
                  <span className="font-semibold">
                    {paymentToDelete?.currency} {paymentToDelete?.amount?.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                  {paymentToDelete?.operations?.file_code && (
                    <> de la operación <span className="font-mono text-xs">{paymentToDelete.operations.file_code}</span></>
                  )}
                  .
                </p>
                {paymentToDelete?.status === "PAID" && (
                  <p className="text-destructive">
                    ⚠️ Este pago ya está marcado como pagado. Al eliminarlo también se borra el movimiento de caja asociado.
                  </p>
                )}
                <p className="text-muted-foreground text-xs">Esta acción no se puede deshacer.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault()
                if (!paymentToDelete) return
                setIsDeleting(true)
                try {
                  const res = await fetch(`/api/payments?paymentId=${paymentToDelete.id}`, {
                    method: "DELETE",
                  })
                  if (res.ok) {
                    toast.success("Pago eliminado")
                    setPaymentToDelete(null)
                    onRefresh?.()
                    if (useServerPagination) fetchPayments()
                  } else {
                    const err = await res.json().catch(() => ({}))
                    toast.error(err?.error ?? `Error ${res.status}: no se pudo eliminar`)
                  }
                } catch (err: any) {
                  toast.error(err?.message || "Error al eliminar el pago")
                } finally {
                  setIsDeleting(false)
                }
              }}
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
