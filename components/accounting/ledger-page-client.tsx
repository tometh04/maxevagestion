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
import { HelpCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface LedgerPageClientProps {
  agencies: Array<{ id: string; name: string }>
  userRole?: string
}

export function LedgerPageClient({ agencies, userRole }: LedgerPageClientProps) {
  const [filters, setFilters] = useState<{
    dateFrom?: string
    dateTo?: string
    dateType?: string
    type?: string
    currency?: string
    agencyId?: string
  }>({})

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Libro Mayor</h2>
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
        <p className="text-sm text-muted-foreground">
          Vista completa de todos los movimientos contables del sistema
        </p>
      </div>

      <LedgerFilters agencies={agencies} onFiltersChange={setFilters} />

      <div className="rounded-xl border border-border/40">
        <div className="p-5 pb-3">
          <h3 className="text-base font-semibold">Movimientos</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Lista completa de movimientos del ledger</p>
        </div>
        <div className="px-5 pb-5">
          <LedgerTable filters={filters} userRole={userRole} />
        </div>
      </div>
    </div>
  )
}

