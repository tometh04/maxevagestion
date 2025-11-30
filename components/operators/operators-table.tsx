"use client"

import { useMemo } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { format } from "date-fns"
import { es } from "date-fns/locale"
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

export interface Operator {
  id: string
  name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  credit_limit: number | null
  operationsCount: number
  totalCost: number
  paidAmount: number
  balance: number
  nextPaymentDate: string | null
}

interface OperatorsTableProps {
  operators: Operator[]
  isLoading?: boolean
  emptyMessage?: string
}

export function OperatorsTable({ operators, isLoading = false, emptyMessage }: OperatorsTableProps) {
  const columns: ColumnDef<Operator>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Nombre" />
        ),
        cell: ({ row }) => (
          <div className="font-medium">{row.original.name}</div>
        ),
      },
      {
        id: "contact",
        header: "Contacto",
        cell: ({ row }) => (
          <div className="text-sm space-y-1">
            {row.original.contact_name && <div>{row.original.contact_name}</div>}
            {row.original.contact_email && (
              <div className="text-muted-foreground">{row.original.contact_email}</div>
            )}
            {row.original.contact_phone && (
              <div className="text-muted-foreground">{row.original.contact_phone}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "operationsCount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Operaciones" />
        ),
        cell: ({ row }) => <div>{row.original.operationsCount}</div>,
      },
      {
        accessorKey: "totalCost",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Costo Total" />
        ),
        cell: ({ row }) => (
          <div>
            ${row.original.totalCost.toLocaleString("es-AR", {
              minimumFractionDigits: 2,
            })}
          </div>
        ),
      },
      {
        accessorKey: "paidAmount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Pagado" />
        ),
        cell: ({ row }) => (
          <div>
            ${row.original.paidAmount.toLocaleString("es-AR", {
              minimumFractionDigits: 2,
            })}
          </div>
        ),
      },
      {
        accessorKey: "balance",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Saldo" />
        ),
        cell: ({ row }) => (
          <Badge variant={row.original.balance > 0 ? "destructive" : "default"}>
            ${row.original.balance.toLocaleString("es-AR", {
              minimumFractionDigits: 2,
            })}
          </Badge>
        ),
      },
      {
        id: "nextPaymentDate",
        header: "Próximo Pago",
        cell: ({ row }) => (
          <div>
            {row.original.nextPaymentDate
              ? format(new Date(row.original.nextPaymentDate), "dd/MM/yyyy", {
                  locale: es,
                })
            : "-"}
          </div>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => {
          const operator = row.original

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
                <DropdownMenuItem asChild>
                  <Link href={`/operators/${operator.id}`}>Ver detalles</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    []
  )

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
    <DataTable
      columns={columns}
      data={operators}
      searchKey="name"
      searchPlaceholder="Buscar por nombre..."
    />
  )
}

