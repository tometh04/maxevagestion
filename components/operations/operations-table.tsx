"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { ServerPagination } from "@/components/ui/server-pagination"
import { Input } from "@/components/ui/input"
import { useDebounce } from "@/hooks/use-debounce"
import { MoreHorizontal, Pencil, Eye, Trash2, Search } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import dynamic from "next/dynamic"

// Lazy load: edit-operation-dialog pesa ~1200 líneas y sólo se abre al
// editar una operación desde el listado.
const EditOperationDialog = dynamic(
  () => import("./edit-operation-dialog").then((m) => ({ default: m.EditOperationDialog })),
  { ssr: false }
)
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
  seller_id: string
  destination: string
  operation_date: string | null
  departure_date: string
  return_date: string | null
  sellers: { name: string } | null
  sellers_secondary?: { name: string } | null
  commission_split?: number | null
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
  type?: string | null
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
  canViewAgencyOperationsSupport: boolean
  userAgencyIds: string[]
}

export function OperationsTable({
  initialFilters,
  userRole,
  userId,
  canViewAgencyOperationsSupport,
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
  
  // Estado de búsqueda server-side
  const [searchInput, setSearchInput] = useState("")
  const debouncedSearch = useDebounce(searchInput, 500)

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
  const hideFinancialColumns = userRole === "SELLER" && canViewAgencyOperationsSupport
  
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
      toast({
        title: "Error",
        description: "Error al cargar datos del formulario",
        variant: "destructive",
      })
    }
  }, [toast])
  
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

      // Búsqueda server-side
      if (debouncedSearch && debouncedSearch.length >= 2) {
        params.append("search", debouncedSearch)
      }

      // Agregar parámetros de paginación
      params.append("page", page.toString())
      params.append("limit", limit.toString())

      const response = await fetch(`/api/operations?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setOperations(data.operations || [])
        const pag = data.pagination || {}
        setTotal(pag.total || 0)
        setTotalPages(pag.totalPages || 0)
        setHasMore(pag.hasMore || false)
      }
    } catch (error) {
      console.error("Error fetching operations:", error)
      toast({
        title: "Error",
        description: "Error al cargar las operaciones",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [filters, page, limit, debouncedSearch, toast])

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

  // Resetear a página 1 cuando cambia la búsqueda
  const isFirstSearch = useRef(true)
  useEffect(() => {
    if (isFirstSearch.current) {
      isFirstSearch.current = false
      return
    }
    setPage(1)
  }, [debouncedSearch])

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

  const columns: ColumnDef<Operation>[] = useMemo(() => {
    const cols: ColumnDef<Operation>[] = [
      {
        id: "actions",
        header: "Acciones",
        enableHiding: false,
        cell: ({ row }) => {
          const operation = row.original
          const canEditOperation =
            userRole === "SELLER"
              ? operation.seller_id === userId
              : !["VIEWER", "CONTABLE"].includes(userRole)

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
                  <Link href={`/operations/${operation.id}`} prefetch={false}>
                    <Eye className="mr-2 h-4 w-4" />
                    Ver detalles
                  </Link>
                </DropdownMenuItem>
                {canEditOperation && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleEditClick(operation)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                  </>
                )}
                {["ADMIN", "SUPER_ADMIN"].includes(userRole) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleDeleteClick(operation)}
                      className="text-destructive focus:text-destructive"
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
            const dateStr = typeof opDate === "string" && opDate.includes("T") ? opDate : `${opDate}T12:00:00`
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
        accessorKey: "type",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Tipo" />
        ),
        cell: ({ row }) => {
          const typeLabels: Record<string, string> = {
            FLIGHT: "Vuelo",
            HOTEL: "Hotel",
            PACKAGE: "Paquete",
            CRUISE: "Crucero",
            TRANSFER: "Transfer",
            MIXED: "Mixto",
            ASSISTANCE: "Asistencia",
          }
          const type = row.original.type
          if (!type) return <div className="text-xs">-</div>
          return <div className="text-xs font-medium">{typeLabels[type] || type}</div>
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
        enableHiding: false,
        cell: ({ row }) => {
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
        cell: ({ row }) => {
          const op = row.original as any
          const primary = op.sellers?.name || "-"
          const secondary = op.sellers_secondary?.name
          const split = op.commission_split
          return (
            <div className="flex flex-col gap-0.5 max-w-[80px]">
              <div className="text-xs truncate" title={primary}>{primary}</div>
              {secondary && (
                <div className="text-[10px] text-muted-foreground truncate" title={`${secondary}${split != null ? ` (${100 - split}%)` : ""}`}>
                  + {secondary}{split != null ? ` (${100 - split}%)` : ""}
                </div>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: "operators",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Operador(es)" />
        ),
        cell: ({ row }) => {
          const operation = row.original as any
          if (operation.operation_operators && operation.operation_operators.length > 0) {
            const operatorsList = operation.operation_operators
              .map((oo: any) => oo.operators?.name || "Sin nombre")
              .join(", ")
            return (
              <div className="text-xs max-w-[120px] truncate" title={operatorsList}>
                {operatorsList}
              </div>
            )
          }

          if (operation.operators?.name) {
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
    ]

    if (!hideFinancialColumns) {
      cols.push(
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
              <div className="text-xs text-success font-medium text-right">
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
              <div className="text-xs text-warning font-medium text-right">
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
              <div className="text-xs text-info font-medium text-right">
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
              <div className="text-xs text-destructive font-medium text-right">
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
        }
      )
    }

    cols.push({
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Estado" />
      ),
      cell: ({ row }) => (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {statusLabels[row.original.status] || row.original.status}
        </Badge>
      ),
    })

    return cols
  }, [handleDeleteClick, handleEditClick, hideFinancialColumns, userId, userRole])

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
        {/* Búsqueda server-side */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por destino, cliente, código..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 h-8 text-xs rounded-full"
          />
        </div>
        {/* Totales de la página actual */}
        {!hideFinancialColumns && operations.length > 0 && (() => {
          const totals = operations.reduce((acc, op) => {
            const currency = op.currency || "USD"
            if (!acc[currency]) {
              acc[currency] = { sale: 0, paid: 0, pending: 0, opPaid: 0, opPending: 0, margin: 0 }
            }
            const sale = op.sale_amount_total || 0
            const paid = op.paid_amount || 0
            const pendingAmt = op.pending_amount || Math.max(0, sale - paid)
            const opPaid = op.operator_paid_amount || 0
            const opCost = op.operator_cost || 0
            const opPending = op.operator_pending_amount || Math.max(0, opCost - opPaid)
            const margin = op.margin_amount || 0
            acc[currency].sale += sale
            acc[currency].paid += paid
            acc[currency].pending += pendingAmt
            acc[currency].opPaid += opPaid
            acc[currency].opPending += opPending
            acc[currency].margin += margin
            return acc
          }, {} as Record<string, { sale: number; paid: number; pending: number; opPaid: number; opPending: number; margin: number }>)

          return (
            <div className="flex flex-wrap gap-2 text-xs py-2 px-3 bg-muted/50 rounded-md border">
              <span className="font-semibold text-muted-foreground mr-1">Totales página:</span>
              {Object.entries(totals).map(([currency, t]) => (
                <div key={currency} className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="font-semibold text-warning">Venta: {currency} {Math.round(t.sale).toLocaleString("es-AR")}</span>
                  <span className="text-success">Cobrado: {currency} {Math.round(t.paid).toLocaleString("es-AR")}</span>
                  <span className="text-warning">A cobrar: {currency} {Math.round(t.pending).toLocaleString("es-AR")}</span>
                  <span className="text-success font-medium">Margen: {currency} {Math.round(t.margin).toLocaleString("es-AR")}</span>
                  {Object.keys(totals).length > 1 && <span className="text-muted-foreground">|</span>}
                </div>
              ))}
            </div>
          )
        })()}

        <DataTable
          columns={columns}
          data={operations}
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
              <p className="text-sm font-medium text-warning mt-2">
                ⚠️ El cliente asociado NO se eliminará.
              </p>
              <p className="text-sm font-medium text-destructive">
                Esta acción no se puede deshacer.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? "Eliminando..." : "Eliminar operación"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

