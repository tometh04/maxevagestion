"use client"

import { useMemo, useState } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { MoreHorizontal, CheckCircle, XCircle } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { QuotaDetailDialog } from "./quota-detail-dialog"
import { Progress } from "@/components/ui/progress"

interface Quota {
  id: string
  destination: string
  accommodation_name: string | null
  room_type: string | null
  date_from: string
  date_to: string
  total_quota: number
  reserved_quota: number
  available_quota: number
  is_active: boolean
  operator_id: string
  tariff_id: string | null
  notes: string | null
  created_at: string
  operators?: { name: string } | null
  tariffs?: { name: string; destination: string } | null
}

interface QuotasTableProps {
  quotas: Quota[]
  operators: Array<{ id: string; name: string }>
  onRefresh?: () => void
}

export function QuotasTable({
  quotas,
  operators,
  onRefresh,
}: QuotasTableProps) {
  const [selectedQuota, setSelectedQuota] = useState<Quota | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)

  const columns: ColumnDef<Quota & { searchText: string }>[] = useMemo(
    () => [
      {
        accessorKey: "destination",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Destino" />
        ),
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="font-medium">{row.original.destination}</div>
            {row.original.accommodation_name && (
              <div className="text-xs text-muted-foreground">
                {row.original.accommodation_name}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "operators.name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Operador" />
        ),
        cell: ({ row }) => (
          <div>{row.original.operators?.name || "-"}</div>
        ),
      },
      {
        accessorKey: "room_type",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Tipo Habitación" />
        ),
        cell: ({ row }) => (
          <div>{row.original.room_type || "-"}</div>
        ),
        enableHiding: true,
        className: "hidden md:table-cell",
      },
      {
        accessorKey: "date_from",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Fechas" />
        ),
        cell: ({ row }) => (
          <div className="text-sm whitespace-nowrap">
            <div>
              {format(new Date(row.original.date_from), "dd/MM/yyyy", {
                locale: es,
              })}
            </div>
            <div className="text-muted-foreground">
              {format(new Date(row.original.date_to), "dd/MM/yyyy", {
                locale: es,
              })}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "available_quota",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Disponibilidad" />
        ),
        cell: ({ row }) => {
          const quota = row.original
          const usedPercent = quota.total_quota > 0 
            ? (quota.reserved_quota / quota.total_quota) * 100 
            : 0
          
          return (
            <div className="space-y-1 min-w-[120px]">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{quota.available_quota}</span>
                <span className="text-muted-foreground">/ {quota.total_quota}</span>
              </div>
              <Progress value={usedPercent} className="h-2" />
              <div className="text-xs text-muted-foreground">
                {quota.reserved_quota} reservado{quota.reserved_quota !== 1 ? "s" : ""}
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: "is_active",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Estado" />
        ),
        cell: ({ row }) => {
          const isActive = row.original.is_active
          const StatusIcon = isActive ? CheckCircle : XCircle
          return (
            <Badge variant={isActive ? "default" : "secondary"}>
              <StatusIcon className="mr-1 h-3 w-3" />
              {isActive ? "Activo" : "Inactivo"}
            </Badge>
          )
        },
      },
      {
        accessorKey: "searchText",
        header: () => null,
        cell: () => null,
        enableHiding: true,
        enableSorting: false,
        enableColumnFilter: true,
      },
      {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => {
          const quota = row.original

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
                    setSelectedQuota(quota)
                    setDetailDialogOpen(true)
                  }}
                >
                  Ver detalles
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    const newStatus = !quota.is_active
                    const response = await fetch(`/api/quotas/${quota.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ is_active: newStatus }),
                    })
                    if (response.ok) {
                      onRefresh?.()
                    }
                  }}
                >
                  {quota.is_active ? "Desactivar" : "Activar"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [onRefresh]
  )

  return (
    <>
      <DataTable
        columns={columns}
        data={quotas.map((q) => ({
          ...q,
          searchText: `${q.destination} ${q.accommodation_name || ""} ${q.operators?.name || ""} ${q.room_type || ""}`.toLowerCase(),
        })) as (Quota & { searchText: string })[]}
        searchKey="searchText"
        searchPlaceholder="Buscar por destino, alojamiento, operador o tipo de habitación..."
      />

      {selectedQuota && (
        <QuotaDetailDialog
          quota={selectedQuota}
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          onRefresh={onRefresh}
          operators={operators}
        />
      )}
    </>
  )
}

