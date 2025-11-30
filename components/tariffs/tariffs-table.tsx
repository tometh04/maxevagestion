"use client"

import { useMemo, useState } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { MoreHorizontal, FileText, CheckCircle, XCircle } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TariffDetailDialog } from "./tariff-detail-dialog"

const tariffTypeLabels: Record<string, string> = {
  ACCOMMODATION: "Alojamiento",
  FLIGHT: "Vuelo",
  PACKAGE: "Paquete",
  TRANSFER: "Traslado",
  ACTIVITY: "Actividad",
  CRUISE: "Crucero",
  OTHER: "Otro",
}

const regionColors: Record<string, string> = {
  ARGENTINA: "bg-blue-500",
  CARIBE: "bg-cyan-500",
  BRASIL: "bg-amber-500",
  EUROPA: "bg-purple-500",
  EEUU: "bg-red-500",
  OTROS: "bg-gray-500",
  CRUCEROS: "bg-orange-500",
}

interface Tariff {
  id: string
  name: string
  description?: string | null
  destination: string
  region: string
  valid_from: string
  valid_to: string
  tariff_type: string
  currency: string
  is_active: boolean
  operator_id: string
  agency_id: string | null
  notes?: string | null
  terms_and_conditions?: string | null
  created_at: string
  operators?: { name: string } | null
  agencies?: { name: string } | null
  created_by_user?: { name: string } | null
}

interface TariffsTableProps {
  tariffs: Tariff[]
  operators: Array<{ id: string; name: string }>
  agencies: Array<{ id: string; name: string }>
  onRefresh?: () => void
}

export function TariffsTable({
  tariffs,
  operators,
  agencies,
  onRefresh,
}: TariffsTableProps) {
  const [selectedTariff, setSelectedTariff] = useState<Tariff | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)

  const columns: ColumnDef<Tariff & { searchText: string }>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Nombre" />
        ),
        cell: ({ row }) => (
          <div className="font-medium min-w-[200px]">{row.original.name}</div>
        ),
      },
      {
        accessorKey: "destination",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Destino" />
        ),
        cell: ({ row }) => (
          <div className="min-w-[150px]">{row.original.destination}</div>
        ),
      },
      {
        accessorKey: "region",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Región" />
        ),
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={
              regionColors[row.original.region]
                ? `${regionColors[row.original.region]} text-white`
                : ""
            }
          >
            {row.original.region}
          </Badge>
        ),
        enableHiding: true,
        className: "hidden md:table-cell",
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
        accessorKey: "tariff_type",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Tipo" />
        ),
        cell: ({ row }) => (
          <Badge variant="secondary">
            {tariffTypeLabels[row.original.tariff_type] || row.original.tariff_type}
          </Badge>
        ),
        enableHiding: true,
        className: "hidden lg:table-cell",
      },
      {
        accessorKey: "valid_from",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Válido desde" />
        ),
        cell: ({ row }) => (
          <div className="text-sm whitespace-nowrap">
            {format(new Date(row.original.valid_from), "dd/MM/yyyy", {
              locale: es,
            })}
          </div>
        ),
        enableHiding: true,
        className: "hidden lg:table-cell",
      },
      {
        accessorKey: "valid_to",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Válido hasta" />
        ),
        cell: ({ row }) => (
          <div className="text-sm whitespace-nowrap">
            {format(new Date(row.original.valid_to), "dd/MM/yyyy", {
              locale: es,
            })}
          </div>
        ),
        enableHiding: true,
        className: "hidden lg:table-cell",
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
          const tariff = row.original

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
                    setSelectedTariff(tariff)
                    setDetailDialogOpen(true)
                  }}
                >
                  Ver detalles
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    const newStatus = !tariff.is_active
                    const response = await fetch(`/api/tariffs/${tariff.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ is_active: newStatus }),
                    })
                    if (response.ok) {
                      onRefresh?.()
                    }
                  }}
                >
                  {tariff.is_active ? "Desactivar" : "Activar"}
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
        data={tariffs.map((t) => ({
          ...t,
          searchText: `${t.name} ${t.destination} ${t.operators?.name || ""} ${t.region} ${t.tariff_type}`.toLowerCase(),
        })) as (Tariff & { searchText: string })[]}
        searchKey="searchText"
        searchPlaceholder="Buscar por nombre, destino, operador, región o tipo..."
      />

      {selectedTariff && (
        <TariffDetailDialog
          tariff={selectedTariff as any}
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          onRefresh={onRefresh}
          operators={operators}
          agencies={agencies}
        />
      )}
    </>
  )
}

