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
  totalCostByCurrency: Record<string, number>
  paidAmountByCurrency: Record<string, number>
  balanceByCurrency: Record<string, number>
  nextPaymentDate: string | null
}

function renderMoneyEntries(byCurrency: Record<string, number>) {
  const entries = Object.entries(byCurrency || {}).filter(([, v]) => Math.abs(v) > 0.005)
  if (entries.length === 0) return <div>-</div>
  return (
    <div className="space-y-0.5">
      {entries.map(([cur, amt]) => (
        <div key={cur}>
          {cur} {amt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
        </div>
      ))}
    </div>
  )
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
          <DataTableColumnHeader column={column} title="Operador" />
        ),
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.name}</div>
            {row.original.contact_name && (
              <div className="text-xs text-muted-foreground">{row.original.contact_name}</div>
            )}
            {row.original.contact_email && (
              <div className="text-xs text-muted-foreground">{row.original.contact_email}</div>
            )}
            {row.original.contact_phone && (
              <div className="text-xs text-muted-foreground">{row.original.contact_phone}</div>
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
        id: "totalCost",
        enableSorting: false,
        header: "Costo Total",
        cell: ({ row }) => renderMoneyEntries(row.original.totalCostByCurrency),
      },
      {
        id: "paidAmount",
        enableSorting: false,
        header: "Pagado",
        cell: ({ row }) => renderMoneyEntries(row.original.paidAmountByCurrency),
      },
      {
        id: "balance",
        enableSorting: false,
        header: "Saldo",
        cell: ({ row }) => {
          const entries = Object.entries(row.original.balanceByCurrency || {})
            .filter(([, v]) => Math.abs(v) > 0.005)
          if (entries.length === 0) return <Badge variant="default">-</Badge>
          return (
            <div className="space-y-0.5">
              {entries.map(([cur, amt]) => (
                <Badge key={cur} variant={amt > 0 ? "destructive" : "default"}>
                  {cur} {amt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </Badge>
              ))}
            </div>
          )
        },
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

