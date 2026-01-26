"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Skeleton } from "@/components/ui/skeleton"
import { ServerPagination } from "@/components/ui/server-pagination"

interface MovementOperation {
  id: string
  destination: string
  agency_id?: string | null
  agencies?: { 
    id: string
    name: string | null 
  } | null
}

interface MovementUser {
  name: string | null
}

export interface CashMovement {
  id: string
  type: "INCOME" | "EXPENSE"
  category: string
  amount: number
  currency: string
  movement_date: string
  notes: string | null
  operations?: MovementOperation | null
  users?: MovementUser | null
}

interface MovementsTableProps {
  movements?: CashMovement[] // Opcional: si no se pasa, carga sus propios datos con paginación
  isLoading?: boolean
  emptyMessage?: string
  // Filtros para paginación server-side
  dateFrom?: string
  dateTo?: string
  currency?: string
  agencyId?: string
  type?: string
}

export function MovementsTable({ 
  movements: initialMovements, 
  isLoading: externalLoading = false, 
  emptyMessage,
  dateFrom,
  dateTo,
  currency,
  agencyId,
  type,
}: MovementsTableProps) {
  const [movements, setMovements] = useState<CashMovement[]>(initialMovements || [])
  const [loading, setLoading] = useState(!initialMovements)
  
  // Estado de paginación server-side
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  
  // Si se pasan movements como prop, usarlos (modo legacy)
  // Si no, cargar con paginación server-side
  const useServerPagination = !initialMovements
  
  const fetchMovements = useCallback(async () => {
    if (!useServerPagination) return // Si se pasan movements como prop, no cargar
    
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.append("dateFrom", dateFrom)
      if (dateTo) params.append("dateTo", dateTo)
      if (currency) params.append("currency", currency)
      if (agencyId && agencyId !== "ALL") params.append("agencyId", agencyId)
      if (type && type !== "ALL") params.append("type", type)
      params.append("page", page.toString())
      params.append("limit", limit.toString())

      const response = await fetch(`/api/cash/movements?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setMovements(data.movements || [])
        // El API retorna paginación dentro de un objeto 'pagination'
        const pagination = data.pagination || {}
        setTotal(pagination.total || 0)
        setTotalPages(pagination.totalPages || 0)
        setHasMore(pagination.hasMore || false)
      }
    } catch (error) {
      console.error("Error fetching movements:", error)
    } finally {
      setLoading(false)
    }
  }, [useServerPagination, dateFrom, dateTo, currency, agencyId, type, page, limit])
  
  useEffect(() => {
    fetchMovements()
  }, [fetchMovements])
  
  // Si se pasan movements como prop, actualizar cuando cambien
  useEffect(() => {
    if (initialMovements) {
      setMovements(initialMovements)
    }
  }, [initialMovements])
  
  const isLoading = externalLoading || (loading && useServerPagination)
  const rowsToRender = useMemo(() => {
    if (isLoading) {
      return Array.from({ length: 5 }).map((_, index) => (
        <TableRow key={`skeleton-${index}`}>
          <TableCell colSpan={7}>
            <Skeleton className="h-6 w-full" />
          </TableCell>
        </TableRow>
      ))
    }

    if (movements.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="text-center text-muted-foreground">
            {emptyMessage || "No hay movimientos"}
          </TableCell>
        </TableRow>
      )
    }

    return movements.map((movement) => (
      <TableRow key={movement.id}>
        <TableCell className="whitespace-nowrap">
          {format(new Date(movement.movement_date), "dd/MM/yyyy HH:mm", { locale: es })}
        </TableCell>
        <TableCell>
          <Badge variant={movement.type === "INCOME" ? "default" : "destructive"}>
            {movement.type === "INCOME" ? "Ingreso" : "Egreso"}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="space-y-1">
            <p className="font-medium">{movement.category}</p>
            <p className="text-xs text-muted-foreground">
              {movement.operations?.agencies?.name || "Sin agencia"}
            </p>
          </div>
        </TableCell>
        <TableCell>
          <div className="space-y-1">
            <p className="font-medium">{movement.operations?.destination || "Manual"}</p>
            <p className="text-xs text-muted-foreground">{movement.operations?.id || "-"}</p>
          </div>
        </TableCell>
        <TableCell className="text-right">
          {movement.currency} {movement.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
        </TableCell>
        <TableCell>{movement.users?.name || "-"}</TableCell>
        <TableCell>{movement.notes || "-"}</TableCell>
      </TableRow>
    ))
  }, [movements, isLoading, emptyMessage])

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Categoría / Agencia</TableHead>
            <TableHead>Operación</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead>Notas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{rowsToRender}        </TableBody>
      </Table>
      </div>
      
      {/* Paginación server-side (solo si no se pasan movements como prop) */}
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
  )
}
