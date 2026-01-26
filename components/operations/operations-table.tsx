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
import { ServerPagination } from "@/components/ui/server-pagination"
import { MoreHorizontal, Pencil, Eye, Trash2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EditOperationDialog } from "./edit-operation-dialog"
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
import { useToast } from "@/hooks/use-toast"

const statusLabels: Record<string, string> = {
  RESERVED: "Reservado",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  TRAVELLING: "En viaje",
  TRAVELLED: "Viajado",
}

interface Operation {
  id: string
  destination: string
  operation_date: string | null
  departure_date: string
  return_date: string | null
  sellers: { name: string } | null
  operators: { name: string } | null
  operation_operators?: Array<{
    id: string
    cost: number
    cost_currency: string
    notes?: string | null
    operators?: { id: string; name: string } | null
  }>
  leads: { contact_name: string | null; destination: string | null; trello_url: string | null } | null
  currency: string
  sale_amount_total: number
  operator_cost?: number
  margin_amount: number
  margin_percentage: number
  status: string
  created_at: string
  customer_name?: string
  paid_amount?: number // Monto Cobrado
  pending_amount?: number // A cobrar
  operator_paid_amount?: number // Pagado (a operadores)
  operator_pending_amount?: number // A pagar (a operadores)
  reservation_code_air?: string | null
  reservation_code_hotel?: string | null
}

interface OperationsTableProps {
  initialFilters: {
    status: string
    sellerId: string
    agencyId: string
    dateFrom: string
    dateTo: string
    paymentDateFrom?: string
    paymentDateTo?: string
    paymentDateType?: string
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
  const [deletingOperation, setDeletingOperation] = useState<Operation | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()
  
  // Estado de paginación server-side
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  
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
      if (filters.paymentDateFrom) params.append("paymentDateFrom", filters.paymentDateFrom)
      if (filters.paymentDateTo) params.append("paymentDateTo", filters.paymentDateTo)
      if (filters.paymentDateType) params.append("paymentDateType", filters.paymentDateType)
      
      // Agregar parámetros de paginación
      params.append("page", page.toString())
      params.append("limit", limit.toString())

      const response = await fetch(`/api/operations?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setOperations(data.operations || [])
        setTotal(data.total || 0)
        setTotalPages(data.totalPages || 0)
        setHasMore(data.hasMore || false)
      }
    } catch (error) {
      console.error("Error fetching operations:", error)
    } finally {
      setLoading(false)
    }
  }, [filters, page, limit])

  const handleDeleteClick = useCallback((operation: Operation) => {
    setDeletingOperation(operation)
    setDeleteDialogOpen(true)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingOperation) return
    
    setDeleting(true)
    try {
      const response = await fetch(`/api/operations/${deletingOperation.id}`, {
        method: "DELETE",
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al eliminar")
      }
      
      toast({
        title: "Operación eliminada",
        description: `La operación ${deletingOperation.destination} ha sido eliminada correctamente.`,
      })
      
      // Refrescar la lista
      fetchOperations()
    } catch (error) {
      console.error("Error deleting operation:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo eliminar la operación",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
      setDeletingOperation(null)
    }
  }, [deletingOperation, toast, fetchOperations])

  useEffect(() => {
    fetchOperations()
  }, [fetchOperations])

  useEffect(() => {
    setFilters(initialFilters)
    setPage(1) // Resetear a página 1 cuando cambian los filtros
  }, [initialFilters])

  // Escuchar eventos de refresh desde el componente padre
  useEffect(() => {
    const handleRefresh = () => {
      fetchOperations()
    }
    
    window.addEventListener("refresh-operations", handleRefresh)
    
    return () => {
      window.removeEventListener("refresh-operations", handleRefresh)
    }
  }, [fetchOperations])

  const columns: ColumnDef<Operation>[] = useMemo(
    () => [
      {
        id: "searchText",
        accessorFn: (row) => {
          // Texto de búsqueda que incluye destino, cliente, códigos de reserva y otros campos
          const destination = row.destination || row.leads?.destination || ""
          const customerName = row.customer_name || row.leads?.contact_name || ""
          const trelloUrl = row.leads?.trello_url || ""
          const reservationAir = row.reservation_code_air || ""
          const reservationHotel = row.reservation_code_hotel || ""
          return `${destination} ${customerName} ${trelloUrl} ${reservationAir} ${reservationHotel}`.toLowerCase()
        },
        enableHiding: false,
        enableSorting: false,
      },
      {
        id: "actions",
        header: "Acciones",
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
                {["ADMIN", "SUPER_ADMIN"].includes(userRole) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => handleDeleteClick(operation)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
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
        accessorKey: "customer_name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Cliente" />
        ),
        cell: ({ row }) => {
          const customerName = row.original.customer_name || row.original.leads?.contact_name || "-"
          return (
            <div className="max-w-[140px] truncate text-xs" title={customerName}>
              {customerName}
            </div>
          )
        },
      },
      {
        accessorKey: "destination",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Destino" />
        ),
        enableHiding: false, // No permitir ocultar esta columna importante
        cell: ({ row }) => {
          // Priorizar destino de la operación, si no existe usar el destino del lead
          const destination = row.original.destination || row.original.leads?.destination || "-"
          return (
            <div className="max-w-[120px] truncate text-xs font-medium" title={destination}>
              {destination}
          </div>
          )
        },
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
        accessorKey: "operators",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Operador(es)" />
        ),
        cell: ({ row }) => {
          const operation = row.original as any
          // Si hay operation_operators, mostrar todos; si no, mostrar el operador principal
          if (operation.operation_operators && operation.operation_operators.length > 0) {
            const operatorsList = operation.operation_operators
              .map((oo: any) => oo.operators?.name || "Sin nombre")
              .join(", ")
            return (
              <div className="text-xs max-w-[120px] truncate" title={operatorsList}>
                {operatorsList}
              </div>
            )
          } else if (operation.operators?.name) {
            return (
              <div className="text-xs max-w-[80px] truncate" title={operation.operators.name}>
                {operation.operators.name}
              </div>
            )
          }
          return <div className="text-xs">-</div>
        },
      },
      {
        accessorKey: "reservation_code_air",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Cod. Rva Aéreo" />
        ),
        cell: ({ row }) => {
          const code = row.original.reservation_code_air
          if (!code) return <div className="text-xs text-muted-foreground">-</div>
          return (
            <div className="text-xs font-mono max-w-[100px] truncate" title={code}>
              {code}
            </div>
          )
        },
      },
      {
        accessorKey: "reservation_code_hotel",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Cod. Rva Hotel" />
        ),
        cell: ({ row }) => {
          const code = row.original.reservation_code_hotel
          if (!code) return <div className="text-xs text-muted-foreground">-</div>
          return (
            <div className="text-xs font-mono max-w-[100px] truncate" title={code}>
              {code}
            </div>
          )
        },
      },
      {
        accessorKey: "sale_amount_total",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Venta" className="justify-end" />
        ),
        cell: ({ row }) => (
          <div className="text-xs font-medium text-right">
            {row.original.currency} {Math.round(row.original.sale_amount_total).toLocaleString("es-AR")}
          </div>
        ),
      },
      {
        accessorKey: "paid_amount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Monto Cobrado" className="justify-end" />
        ),
        cell: ({ row }) => {
          const paid = row.original.paid_amount || 0
          return (
            <div className="text-xs text-green-600 font-medium text-right">
              {row.original.currency} {Math.round(paid).toLocaleString("es-AR")}
            </div>
          )
        },
      },
      {
        accessorKey: "pending_amount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="A cobrar" className="justify-end" />
        ),
        cell: ({ row }) => {
          const pending = row.original.pending_amount || 0
          const total = row.original.sale_amount_total || 0
          const pendingCalc = pending > 0 ? pending : Math.max(0, total - (row.original.paid_amount || 0))
          return (
            <div className="text-xs text-orange-600 font-medium text-right">
              {row.original.currency} {Math.round(pendingCalc).toLocaleString("es-AR")}
            </div>
          )
        },
      },
      {
        accessorKey: "operator_paid_amount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Pagado" className="justify-end" />
        ),
        cell: ({ row }) => {
          const operatorPaid = row.original.operator_paid_amount || 0
          return (
            <div className="text-xs text-blue-600 font-medium text-right">
              {row.original.currency} {Math.round(operatorPaid).toLocaleString("es-AR")}
            </div>
          )
        },
      },
      {
        accessorKey: "operator_pending_amount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="A pagar" className="justify-end" />
        ),
        cell: ({ row }) => {
          const operatorPending = row.original.operator_pending_amount || 0
          const operatorCost = row.original.operator_cost || 0
          const pendingCalc = operatorPending > 0 ? operatorPending : Math.max(0, operatorCost - (row.original.operator_paid_amount || 0))
          return (
            <div className="text-xs text-red-600 font-medium text-right">
              {row.original.currency} {Math.round(pendingCalc).toLocaleString("es-AR")}
            </div>
          )
        },
      },
      {
        accessorKey: "margin_amount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Margen" className="justify-end" />
        ),
        cell: ({ row }) => (
          <div className="text-xs text-right">
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
    ],
    [handleEditClick, handleDeleteClick, userRole]
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
      <div className="space-y-4">
        <DataTable 
          columns={columns} 
          data={operations} 
          searchKey="searchText" 
          searchPlaceholder="Buscar por destino o card..."
          showPagination={false}
        />
        
        {/* Paginación server-side */}
        {total > 0 && (
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

      {/* Diálogo de confirmación para eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar operación?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Estás por eliminar la operación <strong>{deletingOperation?.destination}</strong>.
              </p>
              <p className="text-sm text-muted-foreground">
                Esta acción eliminará:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside">
                <li>Todos los pagos y cobranzas</li>
                <li>Movimientos contables (libro mayor, caja)</li>
                <li>Pagos a operadores pendientes</li>
                <li>Alertas y documentos</li>
                <li>Comisiones calculadas</li>
              </ul>
              <p className="text-sm font-medium text-amber-600 mt-2">
                ⚠️ El cliente asociado NO se eliminará.
              </p>
              <p className="text-sm font-medium text-red-600">
                Esta acción no se puede deshacer.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Eliminando..." : "Eliminar operación"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

