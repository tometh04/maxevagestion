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
  INCOME: "bg-amber-500",
  EXPENSE: "bg-red-500",
  FX_GAIN: "bg-amber-500",
  FX_LOSS: "bg-orange-500",
  COMMISSION: "bg-blue-500",
  OPERATOR_PAYMENT: "bg-purple-500",
}

export function LedgerTable({ filters }: LedgerTableProps) {
  const [movements, setMovements] = useState<LedgerMovement[]>([])
  const [loading, setLoading] = useState(true)

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
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Concepto</TableHead>
            <TableHead className="text-right">Monto Original</TableHead>
            <TableHead className="text-right">ARS Equivalente</TableHead>
            <TableHead>Cuenta</TableHead>
            <TableHead>Operación</TableHead>
            <TableHead>Vendedor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((movement) => (
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

