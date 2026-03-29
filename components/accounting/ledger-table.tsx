"use client"

import { useState, useEffect } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { useSortableData, SortableTableHead } from "@/components/ui/sortable-header"

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
    minimumFractionDigits: 2,
  }).format(amount)
}

interface LedgerMovement {
  id: string
  type: "INCOME" | "EXPENSE" | "FX_GAIN" | "FX_LOSS" | "COMMISSION" | "OPERATOR_PAYMENT"
  concept: string
  currency: "ARS" | "USD"
  amount_original: number
  exchange_rate: number | null
  amount_ars_equivalent: number
  method: string
  receipt_number: string | null
  notes: string | null
  created_at: string
  financial_accounts?: { name: string; type: string } | null
  sellers?: { name: string } | null
  operators?: { name: string } | null
  operations?: { destination: string; file_code: string | null } | null
  leads?: { contact_name: string } | null
}

interface LedgerTableProps {
  filters?: {
    dateFrom?: string
    dateTo?: string
    type?: string
    currency?: string
  }
}

const typeLabels: Record<string, string> = {
  INCOME: "Ingreso",
  EXPENSE: "Gasto",
  FX_GAIN: "Ganancia FX",
  FX_LOSS: "Pérdida FX",
  COMMISSION: "Comisión",
  OPERATOR_PAYMENT: "Pago Operador",
}

const typeColors: Record<string, string> = {
  INCOME: "bg-warning",
  EXPENSE: "bg-destructive",
  FX_GAIN: "bg-warning",
  FX_LOSS: "bg-primary",
  COMMISSION: "bg-info",
  OPERATOR_PAYMENT: "bg-purple-500",
}

export function LedgerTable({ filters }: LedgerTableProps) {
  const [movements, setMovements] = useState<LedgerMovement[]>([])
  const [loading, setLoading] = useState(true)

  const { sortedData, sortConfig, requestSort } = useSortableData(movements, {
    key: "created_at",
    direction: "desc",
  })

  useEffect(() => {
    async function fetchMovements() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (filters?.dateFrom) params.append("dateFrom", filters.dateFrom)
        if (filters?.dateTo) params.append("dateTo", filters.dateTo)
        if (filters?.type && filters.type !== "ALL") params.append("type", filters.type)
        if (filters?.currency && filters.currency !== "ALL") params.append("currency", filters.currency)

        const response = await fetch(`/api/accounting/ledger?${params.toString()}`)
        if (!response.ok) throw new Error("Error al obtener movimientos")

        const data = await response.json()
        setMovements(data.movements || [])
      } catch (error) {
        console.error("Error fetching ledger movements:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchMovements()
  }, [filters])

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (movements.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No se encontraron movimientos
      </div>
    )
  }

  return (
    <div className="max-h-[60vh] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead sortKey="created_at" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10">
              Fecha
            </SortableTableHead>
            <SortableTableHead sortKey="type" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10">
              Tipo
            </SortableTableHead>
            <SortableTableHead sortKey="concept" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10">
              Concepto
            </SortableTableHead>
            <SortableTableHead sortKey="amount_original" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10 text-right">
              Monto Original
            </SortableTableHead>
            <SortableTableHead sortKey="amount_ars_equivalent" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10 text-right">
              ARS Equivalente
            </SortableTableHead>
            <SortableTableHead sortKey="financial_accounts.name" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10">
              Cuenta
            </SortableTableHead>
            <SortableTableHead sortKey="operations.file_code" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10">
              Operación
            </SortableTableHead>
            <SortableTableHead sortKey="sellers.name" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10">
              Vendedor
            </SortableTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((movement) => (
            <TableRow key={movement.id}>
              <TableCell>
                {format(new Date(movement.created_at), "dd/MM/yyyy", { locale: es })}
              </TableCell>
              <TableCell>
                <Badge className={typeColors[movement.type] || "bg-gray-500"}>
                  {typeLabels[movement.type] || movement.type}
                </Badge>
              </TableCell>
              <TableCell className="max-w-xs truncate">{movement.concept}</TableCell>
              <TableCell className="text-right">
                {formatCurrency(movement.amount_original, movement.currency)}
                {movement.exchange_rate && movement.currency === "USD" && (
                  <span className="text-xs text-muted-foreground ml-1">
                    (TC: {movement.exchange_rate})
                  </span>
                )}
              </TableCell>
              <TableCell className="font-medium text-right">
                {formatCurrency(movement.amount_ars_equivalent, "ARS")}
              </TableCell>
              <TableCell>
                {movement.financial_accounts?.name || "-"}
              </TableCell>
              <TableCell>
                {movement.operations?.file_code ? (
                  <span className="text-xs font-mono">
                    {movement.operations.file_code}
                  </span>
                ) : movement.leads?.contact_name ? (
                  <span className="text-xs">Lead: {movement.leads.contact_name}</span>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell>
                {movement.sellers?.name || "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
