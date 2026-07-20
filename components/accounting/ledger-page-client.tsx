"use client"

import { useCallback, useState } from "react"
import dynamic from "next/dynamic"
import {
  LedgerFilters,
  type LedgerAccountOption,
  type LedgerFiltersState,
} from "@/components/accounting/ledger-filters"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Download } from "lucide-react"
import { toast } from "sonner"

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
  accounts?: LedgerAccountOption[]
  initialAccountId?: string
  initialCurrency?: string
  userRole?: string
}

export function LedgerPageClient({
  agencies,
  accounts = [],
  initialAccountId,
  initialCurrency,
  userRole,
}: LedgerPageClientProps) {
  const [filters, setFilters] = useState<LedgerFiltersState>({})
  const [exporting, setExporting] = useState(false)

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom)
      if (filters.dateTo) params.set("dateTo", filters.dateTo)
      if (filters.dateType) params.set("dateType", filters.dateType)
      if (filters.type && filters.type !== "ALL") params.set("type", filters.type)
      if (filters.currency && filters.currency !== "ALL") params.set("currency", filters.currency)
      if (filters.agencyId && filters.agencyId !== "ALL") params.set("agencyId", filters.agencyId)
      if (filters.accountId && filters.accountId !== "ALL") params.set("accountId", filters.accountId)

      const response = await fetch(`/api/accounting/ledger/export?${params.toString()}`)
      if (!response.ok) throw new Error("No se pudo exportar")

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      const suffix = filters.currency && filters.currency !== "ALL" ? `-${filters.currency}` : ""
      link.download = `libro-mayor${suffix}-${Date.now()}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error al exportar libro mayor:", error)
      toast.error("No se pudo exportar el CSV. Intenta nuevamente.")
    } finally {
      setExporting(false)
    }
  }, [filters])

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

      <div className="flex items-center gap-2 flex-wrap">
        <LedgerFilters
          agencies={agencies}
          accounts={accounts}
          initialAccountId={initialAccountId}
          initialCurrency={initialCurrency}
          onFiltersChange={setFilters}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-full text-xs"
          onClick={handleExport}
          disabled={exporting}
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          {exporting ? "Exportando..." : "Exportar CSV"}
        </Button>
      </div>

      <div className="rounded-xl border border-border/40">
        <div className="p-5 pb-3">
          <h3 className="text-base font-semibold">Movimientos</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lista completa de movimientos del ledger. El CSV exporta todos los movimientos
            del filtro aplicado (la tabla muestra los últimos 200).
          </p>
        </div>
        <div className="px-5 pb-5">
          <LedgerTable filters={filters} userRole={userRole} />
        </div>
      </div>
    </div>
  )
}

