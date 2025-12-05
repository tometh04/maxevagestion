"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { MoreHorizontal, Pencil, Eye } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EditOperationDialog } from "./edit-operation-dialog"

const statusLabels: Record<string, string> = {
  PRE_RESERVATION: "Pre-reserva",
  RESERVED: "Reservado",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  TRAVELLED: "Viajado",
  CLOSED: "Cerrado",
}

interface Operation {
  id: string
  destination: string
  operation_date: string | null
  departure_date: string
  return_date: string | null
  sellers: { name: string } | null
  operators: { name: string } | null
  leads: { contact_name: string | null; destination: string | null; trello_url: string | null } | null
  currency: string
  sale_amount_total: number
  margin_amount: number
  margin_percentage: number
  status: string
  created_at: string
}

interface OperationsTableProps {
  initialFilters: {
    status: string
    sellerId: string
    agencyId: string
    dateFrom: string
    dateTo: string
  }
  userRole: string
  userId: string
  userAgencyIds: string[]
}

export function OperationsTable({
  initialFilters,
  userRole,
  userId,
  userAgencyIds,
}: OperationsTableProps) {
  const [operations, setOperations] = useState<Operation[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState(initialFilters)
  const [editingOperation, setEditingOperation] = useState<Operation | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  
  // Datos para el diálogo de edición (se cargarán cuando sea necesario)
  const [agencies, setAgencies] = useState<Array<{ id: string; name: string }>>([])
  const [sellers, setSellers] = useState<Array<{ id: string; name: string }>>([])
  const [allOperators, setAllOperators] = useState<Array<{ id: string; name: string }>>([])
  
  // Cargar datos auxiliares para el diálogo
  const loadDialogData = useCallback(async () => {
    try {
      const [agenciesRes, sellersRes, operatorsRes] = await Promise.all([
        fetch("/api/agencies"),
        fetch("/api/users?role=SELLER"),
        fetch("/api/operators"),
      ])
      
      const [agenciesData, sellersData, operatorsData] = await Promise.all([
        agenciesRes.json(),
        sellersRes.json(),
        operatorsRes.json(),
      ])
      
      setAgencies(agenciesData.agencies || [])
      setSellers((sellersData.users || []).map((u: any) => ({ id: u.id, name: u.name })))
      setAllOperators((operatorsData.operators || []).map((o: any) => ({ id: o.id, name: o.name })))
    } catch (error) {
      console.error("Error loading dialog data:", error)
    }
  }, [])
  
  const handleEditClick = useCallback(async (operation: Operation) => {
    if (agencies.length === 0) {
      await loadDialogData()
    }
    setEditingOperation(operation)
    setEditDialogOpen(true)
  }, [agencies.length, loadDialogData])

  const fetchOperations = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.status !== "ALL") params.append("status", filters.status)
      if (filters.sellerId !== "ALL") params.append("sellerId", filters.sellerId)
      if (filters.agencyId !== "ALL") params.append("agencyId", filters.agencyId)
      if (filters.dateFrom) params.append("dateFrom", filters.dateFrom)
      if (filters.dateTo) params.append("dateTo", filters.dateTo)

      const response = await fetch(`/api/operations?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setOperations(data.operations || [])
      }
    } catch (error) {
      console.error("Error fetching operations:", error)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchOperations()
  }, [fetchOperations])

  useEffect(() => {
    setFilters(initialFilters)
  }, [initialFilters])

  const columns: ColumnDef<Operation>[] = useMemo(
    () => [
      {
        accessorKey: "operation_date",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Fecha" />
        ),
        cell: ({ row }) => {
          const opDate = row.original.operation_date || row.original.created_at
          if (!opDate) return <div className="text-xs">-</div>
          try {
            const dateStr = typeof opDate === 'string' && opDate.includes('T') ? opDate : `${opDate}T12:00:00`
            return (
              <div className="text-xs font-medium">
                {format(new Date(dateStr), "dd/MM/yy", { locale: es })}
              </div>
            )
          } catch {
            return <div className="text-xs">-</div>
          }
        },
      },
      {
        accessorKey: "leads.contact_name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Cliente" />
        ),
        cell: ({ row }) => {
          const lead = row.original.leads
          const clientName = lead?.contact_name
          return (
            <div className="max-w-[140px] truncate text-xs" title={clientName || "-"}>
              {clientName || "-"}
            </div>
          )
        },
      },
      {
        accessorKey: "destination",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Destino" />
        ),
        cell: ({ row }) => (
          <div className="max-w-[100px] truncate text-xs" title={row.original.destination}>
            {row.original.destination}
          </div>
        ),
      },
      {
        accessorKey: "departure_date",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Viaje" />
        ),
        cell: ({ row }) => {
          if (!row.original.departure_date) return <div className="text-xs">-</div>
          try {
            const depDate = `${row.original.departure_date}T12:00:00`
            const retDate = row.original.return_date ? `${row.original.return_date}T12:00:00` : null
            return (
              <div className="text-xs">
                <div>{format(new Date(depDate), "dd/MM", { locale: es })}</div>
                {retDate && (
                  <div className="text-muted-foreground">
                    al {format(new Date(retDate), "dd/MM", { locale: es })}
                  </div>
                )}
              </div>
            )
          } catch {
            return <div className="text-xs">-</div>
          }
        },
      },
      {
        accessorKey: "sellers.name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Vend." />
        ),
        cell: ({ row }) => (
          <div className="text-xs max-w-[60px] truncate" title={row.original.sellers?.name || "-"}>
            {row.original.sellers?.name || "-"}
          </div>
        ),
      },
      {
        accessorKey: "operators.name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Operador" />
        ),
        cell: ({ row }) => (
          <div className="text-xs max-w-[80px] truncate" title={row.original.operators?.name || "-"}>
            {row.original.operators?.name || "-"}
          </div>
        ),
      },
      {
        accessorKey: "sale_amount_total",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Venta" />
        ),
        cell: ({ row }) => (
          <div className="text-xs font-medium">
            {row.original.currency} {Math.round(row.original.sale_amount_total).toLocaleString("es-AR")}
          </div>
        ),
      },
      {
        accessorKey: "margin_amount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Margen" />
        ),
        cell: ({ row }) => (
          <div className="text-xs">
            <span className="font-medium">
              {row.original.currency} {Math.round(row.original.margin_amount).toLocaleString("es-AR")}
            </span>
            <span className="text-muted-foreground ml-1">
              {Math.round(row.original.margin_percentage)}%
            </span>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Estado" />
        ),
        cell: ({ row }) => (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {statusLabels[row.original.status] || row.original.status}
          </Badge>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => {
          const operation = row.original

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
                  <Link href={`/operations/${operation.id}`}>
                    <Eye className="mr-2 h-4 w-4" />
                    Ver detalles
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleEditClick(operation)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [handleEditClick]
  )

  if (loading) {
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
      <DataTable columns={columns} data={operations} searchKey="destination" searchPlaceholder="Buscar por destino o card..." />
      
      {editingOperation && (
        <EditOperationDialog
          operation={editingOperation as any}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSuccess={() => {
            setEditDialogOpen(false)
            setEditingOperation(null)
            fetchOperations()
          }}
          agencies={agencies}
          sellers={sellers}
          operators={allOperators}
        />
      )}
    </>
  )
}

