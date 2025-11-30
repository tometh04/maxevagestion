"use client"

import { useMemo, useState } from "react"
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
import { MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface PaymentOperation {
  id: string
  destination: string
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
  payments: Payment[]
  isLoading?: boolean
  onRefresh?: () => void
  emptyMessage?: string
}

export function PaymentsTable({ payments, isLoading = false, onRefresh, emptyMessage }: PaymentsTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [datePaid, setDatePaid] = useState("")
  const [reference, setReference] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

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
                    onClick={() => {
                      setSelectedPayment(payment)
                      setDatePaid(new Date().toISOString().split("T")[0])
                      setReference(payment.reference || "")
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
    setIsSubmitting(true)

    try {
      await fetch("/api/payments/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: selectedPayment.id,
          datePaid,
          reference: reference || null,
        }),
      })

      setDialogOpen(false)
      setSelectedPayment(null)
      onRefresh?.()
    } catch (error) {
      console.error("Error al marcar pago:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

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
      <DataTable
        columns={columns}
        data={payments.map((p) => ({
          ...p,
          searchText: `${p.operations?.destination || ""} ${p.operations?.agencies?.name || ""}`.toLowerCase(),
        }))}
        searchKey="searchText"
        searchPlaceholder="Buscar por destino o agencia..."
      />

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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={isSubmitting || !datePaid}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
