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
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export interface Commission {
  id: string
  operation_id: string
  seller_id: string
  agency_id: string | null
  amount: number
  percentage: number | null
  status: "PENDING" | "PAID"
  date_calculated: string
  date_paid: string | null
  operations?: {
    id: string
    destination: string
    departure_date: string
    sale_amount_total: number
    operator_cost: number
    margin_amount: number
    currency: string
  } | null
  sellers?: {
    id: string
    name: string
  } | null
  agencies?: {
    id: string
    name: string
  } | null
}

interface CommissionsTableProps {
  commissions: Commission[]
  isLoading?: boolean
  emptyMessage?: string
}

export function CommissionsTable({ commissions, isLoading = false, emptyMessage }: CommissionsTableProps) {
  const rowsToRender = useMemo(() => {
    if (isLoading) {
      return Array.from({ length: 5 }).map((_, index) => (
        <TableRow key={`skeleton-${index}`}>
          <TableCell colSpan={8}>
            <Skeleton className="h-6 w-full" />
          </TableCell>
        </TableRow>
      ))
    }

    if (commissions.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={8} className="text-center text-muted-foreground">
            {emptyMessage || "No hay comisiones"}
          </TableCell>
        </TableRow>
      )
    }

    return commissions.map((comm) => (
      <TableRow key={comm.id}>
        <TableCell>
          {comm.operations?.destination || "Sin destino"}
        </TableCell>
        <TableCell>
          {comm.operations?.departure_date
            ? format(new Date(comm.operations.departure_date), "dd/MM/yyyy", { locale: es })
            : "-"}
        </TableCell>
        <TableCell>
          {comm.operations?.currency || "ARS"} {comm.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
        </TableCell>
        <TableCell>
          {comm.percentage !== null && comm.percentage !== undefined
            ? `${comm.percentage.toFixed(2)}%`
            : "-"}
        </TableCell>
        <TableCell>
          {comm.operations?.currency || "ARS"}{" "}
          {comm.operations?.margin_amount?.toLocaleString("es-AR", { minimumFractionDigits: 2 }) || "0.00"}
        </TableCell>
        <TableCell>
          <Badge variant={comm.status === "PAID" ? "default" : "secondary"}>
            {comm.status === "PAID" ? "Pagado" : "Pendiente"}
          </Badge>
        </TableCell>
        <TableCell>
          {comm.date_paid
            ? format(new Date(comm.date_paid), "dd/MM/yyyy", { locale: es })
            : format(new Date(comm.date_calculated), "dd/MM/yyyy", { locale: es })}
        </TableCell>
        <TableCell>
          <Link href={`/operations/${comm.operation_id}`}>
            <Button variant="ghost" size="sm">
              Ver operación
            </Button>
          </Link>
        </TableCell>
      </TableRow>
    ))
  }, [commissions, isLoading, emptyMessage])

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Destino</TableHead>
            <TableHead>Fecha Salida</TableHead>
            <TableHead>Comisión</TableHead>
            <TableHead>% Comisión</TableHead>
            <TableHead>Margen</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{rowsToRender}</TableBody>
      </Table>
    </div>
  )
}

