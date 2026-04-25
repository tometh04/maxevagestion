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
import { useSortableData, SortableTableHead } from "@/components/ui/sortable-header"
import Link from "next/link"

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
  affects_balance?: boolean
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
  dateType?: string
  currency?: string
  agencyId?: string
  type?: string
  customerQuery?: string
}

export function MovementsTable({
  movements: initialMovements,
  isLoading: externalLoading = false,
  emptyMessage,
  dateFrom,
  dateTo,
  dateType,
  currency,
  agencyId,
  type,
  customerQuery,
}: MovementsTableProps) {
  const [movements, setMovements] = useState<CashMovement[]>(initialMovements || [])
  const [loading, setLoading] = useState(!initialMovements)

  // Estado de paginación server-side
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const useServerPagination = !initialMovements

  const { sortedData, sortConfig, requestSort } = useSortableData(movements, {
    key: "movement_date",
    direction: "desc",
  })

  const fetchMovements = useCallback(async () => {
    if (!useServerPagination) return

    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.append("dateFrom", dateFrom)
      if (dateTo) params.append("dateTo", dateTo)
      if (dateType) params.append("dateType", dateType)
      if (currency) params.append("currency", currency)
      if (agencyId && agencyId !== "ALL") params.append("agencyId", agencyId)
      if (type && type !== "ALL") params.append("type", type)
      if (customerQuery && customerQuery.trim()) params.append("customerQuery", customerQuery.trim())
      params.append("page", page.toString())
      params.append("limit", limit.toString())

      const response = await fetch(`/api/cash/movements?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setMovements(data.movements || [])
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
  }, [useServerPagination, dateFrom, dateTo, dateType, currency, agencyId, type, customerQuery, page, limit])

  useEffect(() => {
    fetchMovements()
  }, [fetchMovements])

  useEffect(() => {
    if (initialMovements) {
      setMovements(initialMovements)
    }
  }, [initialMovements])

  const isLoading = externalLoading || (loading && useServerPagination)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/40 max-h-[60vh] overflow-y-auto">
        <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            <SortableTableHead sortKey="movement_date" sortConfig={sortConfig} onSort={requestSort}>
              Fecha
            </SortableTableHead>
            <SortableTableHead sortKey="type" sortConfig={sortConfig} onSort={requestSort}>
              Tipo
            </SortableTableHead>
            <SortableTableHead sortKey="category" sortConfig={sortConfig} onSort={requestSort}>
              Categoría / Agencia
            </SortableTableHead>
            <SortableTableHead sortKey="operations.destination" sortConfig={sortConfig} onSort={requestSort}>
              Operación
            </SortableTableHead>
            <SortableTableHead sortKey="amount" sortConfig={sortConfig} onSort={requestSort} className="text-right">
              Monto
            </SortableTableHead>
            <SortableTableHead sortKey="users.name" sortConfig={sortConfig} onSort={requestSort}>
              Usuario
            </SortableTableHead>
            <TableHead>Notas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, index) => (
              <TableRow key={`skeleton-${index}`}>
                <TableCell colSpan={7}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : sortedData.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                {emptyMessage || "No hay movimientos"}
              </TableCell>
            </TableRow>
          ) : (
            sortedData.map((movement) => (
              <TableRow key={movement.id}>
                <TableCell className="whitespace-nowrap">
                  {format(new Date(movement.movement_date), "dd/MM/yyyy HH:mm", { locale: es })}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={movement.type === "INCOME" ? "bg-success/10 text-success border-success/20" : "bg-destructive/10 text-destructive border-destructive/20"}>
                    {movement.type === "INCOME" ? "Ingreso" : "Egreso"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <p className="font-medium">{movement.category}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground">
                        {movement.operations?.agencies?.name || "Sin agencia"}
                      </p>
                      {movement.affects_balance === false && (
                        <Badge variant="outline" className="text-[10px]">
                          No afecta saldo
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    {movement.operations?.id ? (
                      <Link
                        href={`/operations/${movement.operations.id}`}
                        className="font-medium text-primary hover:underline"
                        prefetch={false}
                      >
                        {movement.operations?.destination || "Manual"}
                      </Link>
                    ) : (
                      <p className="font-medium">{movement.operations?.destination || "Manual"}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell className={`text-right ${movement.type === "INCOME" ? "text-success" : "text-destructive"}`}>
                  {movement.currency} {movement.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>{movement.users?.name || "-"}</TableCell>
                <TableCell>{movement.notes || "-"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      </div>

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
            setPage(1)
          }}
          limitOptions={[20, 50, 100]}
        />
      )}
    </div>
  )
}
