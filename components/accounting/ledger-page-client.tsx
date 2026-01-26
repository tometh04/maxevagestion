"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { LedgerFilters } from "@/components/accounting/ledger-filters"
import { Skeleton } from "@/components/ui/skeleton"

const LedgerTable = dynamic(
  () => import("@/components/accounting/ledger-table").then((m) => ({ default: m.LedgerTable })),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    ),
  }
)
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HelpCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface LedgerPageClientProps {
  agencies: Array<{ id: string; name: string }>
}

export function LedgerPageClient({ agencies }: LedgerPageClientProps) {
  const [filters, setFilters] = useState<{
    dateFrom?: string
    dateTo?: string
    type?: string
    currency?: string
    agencyId?: string
  }>({})

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold">Libro Mayor (Ledger)</h1>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-medium mb-1">¿Cómo funciona?</p>
                <p className="text-xs mb-2"><strong>Libro Mayor:</strong> Registro completo de todos los movimientos contables del sistema. Cada movimiento está asociado a una cuenta financiera.</p>
                <p className="text-xs mb-2"><strong>Tipos de Movimiento:</strong> INCOME (ingresos) aumenta el balance, EXPENSE (egresos) lo disminuye. Todos los movimientos incluyen referencia a operación, fecha y monto.</p>
                <p className="text-xs">Los movimientos se crean automáticamente al registrar pagos de clientes, pagos a operadores, y otras transacciones. Puedes filtrar por fecha, tipo, moneda y agencia.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-muted-foreground">
          Vista completa de todos los movimientos contables del sistema
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Filtrar movimientos por fecha, tipo y moneda</CardDescription>
        </CardHeader>
        <CardContent>
          <LedgerFilters agencies={agencies} onFiltersChange={setFilters} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimientos</CardTitle>
          <CardDescription>Lista completa de movimientos del ledger</CardDescription>
        </CardHeader>
        <CardContent>
          <LedgerTable filters={filters} />
        </CardContent>
      </Card>
    </div>
  )
}

