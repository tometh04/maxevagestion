"use client"

import { useMemo } from "react"
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

interface MovementOperation {
  id: string
  destination: string
  agencies?: { name: string | null } | null
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
  movements: CashMovement[]
  isLoading?: boolean
  emptyMessage?: string
}

export function MovementsTable({ movements, isLoading = false, emptyMessage }: MovementsTableProps) {
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
        <TableCell>
          {movement.currency} {movement.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
        </TableCell>
        <TableCell>{movement.users?.name || "-"}</TableCell>
        <TableCell>{movement.notes || "-"}</TableCell>
      </TableRow>
    ))
  }, [movements, isLoading, emptyMessage])

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Categoría / Agencia</TableHead>
            <TableHead>Operación</TableHead>
            <TableHead>Monto</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead>Notas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{rowsToRender}</TableBody>
      </Table>
    </div>
  )
}
