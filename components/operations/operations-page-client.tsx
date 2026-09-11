"use client"

import type { SellerOption } from "@/lib/sellers/seller-option"
import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { OperationsFilters } from "./operations-filters"
import { OperationsTable } from "./operations-table"
// Lazy load: new-operation-dialog pesa ~1650 líneas y solo se abre al
// clickear "Nueva operación".
const NewOperationDialog = dynamic(
  () => import("./new-operation-dialog").then((m) => ({ default: m.NewOperationDialog })),
  { ssr: false }
)
import { Button } from "@/components/ui/button"
import { Plus, HelpCircle, Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import Link from "next/link"

interface CustomStatus {
  value: string
  label: string
  color?: string
}

interface OperationsPageClientProps {
  sellers: SellerOption[]
  /** Vendedores asignables al crear (acotados por permiso/agencia). Cae a `sellers` si no se pasa. */
  creatableSellers?: SellerOption[]
  /** Vendedores elegibles como secundario (acotados por agencia, sin el permiso
   *  de "cargar a nombre de otro" — VIB-105). Cae a `creatableSellers`/`sellers`. */
  secondarySellers?: SellerOption[]
  agencies: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
  userRole: string
  userId: string
  canViewAgencyOperationsSupport: boolean
  /** Si el usuario puede elegir a otro vendedor en el alta (default true para roles no-SELLER). */
  canPickOtherSeller?: boolean
  /** Si el usuario puede elegir vendedor secundario (default true; false para AVI). */
  canPickSecondarySeller?: boolean
  userAgencyIds: string[]
  defaultAgencyId?: string
  defaultSellerId?: string
}

export function OperationsPageClient({
  sellers,
  creatableSellers,
  secondarySellers,
  agencies,
  operators,
  userRole,
  userId,
  canViewAgencyOperationsSupport,
  canPickOtherSeller = true,
  canPickSecondarySeller = true,
  userAgencyIds,
  defaultAgencyId,
  defaultSellerId,
}: OperationsPageClientProps) {
  const [filters, setFilters] = useState<{
    status: string
    sellerId: string
    agencyId: string
    invoiceStatus: string
    dateFrom: string
    dateTo: string
    paymentDateFrom?: string
    paymentDateTo?: string
    paymentDateType?: string
  }>({
    status: "ALL",
    sellerId: "ALL",
    agencyId: "ALL",
    invoiceStatus: "ALL",
    dateFrom: "",
    dateTo: "",
  })
  const [newOperationDialogOpen, setNewOperationDialogOpen] = useState(false)
  const [customStatuses, setCustomStatuses] = useState<CustomStatus[]>([])
  // VIB-152: la busqueda vive dentro de OperationsTable. La espejamos aca para
  // que el export mande exactamente los mismos filtros que el listado.
  const [tableSearch, setTableSearch] = useState("")
  const [exportingCsv, setExportingCsv] = useState(false)

  // 2026-05-19 (Tomi): exportar operaciones filtradas a CSV con todas las columnas.
  async function handleExportCsv() {
    setExportingCsv(true)
    try {
      const params = new URLSearchParams()
      if (filters.status && filters.status !== "ALL") params.set("status", filters.status)
      if (filters.sellerId && filters.sellerId !== "ALL") params.set("sellerId", filters.sellerId)
      if (filters.agencyId && filters.agencyId !== "ALL") params.set("agencyId", filters.agencyId)
      // VIB-157: el CSV tiene que salir con los mismos filtros que la pantalla
      // (la divergencia del buscador ya nos pasó en VIB-152).
      if (filters.invoiceStatus && filters.invoiceStatus !== "ALL") {
        params.set("invoiceStatus", filters.invoiceStatus)
      }
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom)
      if (filters.dateTo) params.set("dateTo", filters.dateTo)
      // Fechas de cobro/pago/vencimiento: las aplica el listado y hasta VIB-152
      // el export las ignoraba.
      if (filters.paymentDateFrom) params.set("paymentDateFrom", filters.paymentDateFrom)
      if (filters.paymentDateTo) params.set("paymentDateTo", filters.paymentDateTo)
      if (filters.paymentDateType) params.set("paymentDateType", filters.paymentDateType)
      // Mismo umbral que usa la tabla para buscar server-side: por debajo de 2
      // caracteres no filtra, asi que mandarlo haria que el CSV no coincida.
      if (tableSearch && tableSearch.length >= 2) params.set("search", tableSearch)
      // dateType "OPERATION" es el default del endpoint
      const url = `/api/operations/export-csv${params.toString() ? `?${params.toString()}` : ""}`

      const res = await fetch(url)
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody?.error ?? `Error ${res.status} al generar CSV`)
      }
      const blob = await res.blob()
      // Filename del Content-Disposition o fallback
      const cd = res.headers.get("Content-Disposition") || ""
      const match = cd.match(/filename="?([^";]+)"?/i)
      const filename = match?.[1] ?? `operaciones-${new Date().toISOString().slice(0, 10)}.csv`

      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = downloadUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)

      toast.success(`Descargado: ${filename}`)
    } catch (err: any) {
      toast.error(err?.message || "Error al exportar CSV")
    } finally {
      setExportingCsv(false)
    }
  }

  // Cargar estados personalizados
  useEffect(() => {
    const loadCustomStatuses = async () => {
      try {
        const response = await fetch("/api/operations/settings")
        if (response.ok) {
          const data = await response.json()
          if (data.settings?.custom_statuses) {
            setCustomStatuses(data.settings.custom_statuses)
          }
        }
      } catch (error) {
        console.error("Error loading custom statuses:", error)
      }
    }
    loadCustomStatuses()
  }, [])

  const handleRefresh = () => {
    // Trigger refresh in OperationsTable
    window.dispatchEvent(new Event("refresh-operations"))
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Operaciones</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Operaciones</h1>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-medium mb-1">¿Cómo funciona?</p>
                  <p className="text-xs mb-2"><strong>Operaciones:</strong> Cada operación representa un viaje o paquete turístico. Incluye venta, costos de operadores, pasajeros, pagos y documentos.</p>
                  <p className="text-xs mb-2"><strong>Estados:</strong> RESERVADO → CONFIRMADO → EN VIAJE → VIAJADO. El sistema genera alertas y movimientos contables automáticamente.</p>
                  <p className="text-xs">Los pagos de clientes y a operadores se gestionan desde el detalle de cada operación. Haz click en una operación para ver toda la información.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-muted-foreground">
            {canViewAgencyOperationsSupport && userRole === "SELLER"
              ? "Vista operativa de postventa para todas las operaciones de tus agencias"
              : "Gestiona todas las operaciones de viajes"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCsv}
            disabled={exportingCsv}
            title="Exporta las operaciones filtradas (todas las columnas) en CSV"
            data-tour="operations.export"
          >
            {exportingCsv ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {exportingCsv ? "Generando..." : "Exportar CSV"}
          </Button>
          <Button
            size="sm"
            onClick={() => setNewOperationDialogOpen(true)}
            data-tour="operations.new-button"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nueva Operación
          </Button>
        </div>
      </div>

      <OperationsFilters
        sellers={sellers}
        agencies={agencies}
        customStatuses={customStatuses}
        onFilterChange={setFilters}
      />

      <OperationsTable
        initialFilters={filters}
        userRole={userRole}
        userId={userId}
        canViewAgencyOperationsSupport={canViewAgencyOperationsSupport}
        userAgencyIds={userAgencyIds}
        onSearchChange={setTableSearch}
      />

      <NewOperationDialog
        open={newOperationDialogOpen}
        onOpenChange={setNewOperationDialogOpen}
        onSuccess={handleRefresh}
        agencies={agencies}
        sellers={creatableSellers ?? sellers}
        secondarySellers={secondarySellers ?? creatableSellers ?? sellers}
        operators={operators}
        defaultAgencyId={defaultAgencyId}
        defaultSellerId={defaultSellerId}
        canPickOtherSeller={canPickOtherSeller}
        canPickSecondarySeller={canPickSecondarySeller}
        // VIB-183: el selector de paquete solo aparece en el alta normal.
        // Duplicar y convertir un lead usan este mismo diálogo y quedan igual.
        allowPackages
        // VIB-191: elegir el lead de origen. Solo acá: convertir desde el CRM ya
        // llega con el lead, y duplicar no debe arrastrar el de la original.
        allowLeadPicker
      />
    </div>
  )
}

