"use client"

import { useState, useCallback } from "react"
import { toast } from "sonner"
import { CustomersFilters } from "./customers-filters"
import { CustomersTable } from "./customers-table"
import { NewCustomerDialog } from "./new-customer-dialog"
import { Button } from "@/components/ui/button"
import { Plus, HelpCircle, Download, Loader2 } from "lucide-react"
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

export function CustomersPageClient() {
  const [filters, setFilters] = useState({ search: "", sellerId: "ALL" })
  const [newCustomerDialogOpen, setNewCustomerDialogOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [exporting, setExporting] = useState(false)

  // VIB-153: bajar la cartera con los filtros puestos, para recontacto.
  // Manda los mismos parametros que el listado: si bajara otra cosa seria el
  // bug que acabamos de arreglar en operaciones (VIB-152).
  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (filters.search) params.set("search", filters.search)
      if (filters.sellerId && filters.sellerId !== "ALL") {
        params.set("sellerId", filters.sellerId)
      }

      const res = await fetch(`/api/customers/export-csv?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? "Error al exportar")
      }

      const blob = await res.blob()
      const cd = res.headers.get("Content-Disposition") || ""
      const filename =
        cd.match(/filename="?([^";]+)"?/i)?.[1] ??
        `clientes-${new Date().toISOString().slice(0, 10)}.csv`

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`Descargado: ${filename}`)
    } catch (error: any) {
      toast.error(error?.message || "Error al exportar clientes")
    } finally {
      setExporting(false)
    }
  }

  const handleCustomerCreated = useCallback(() => {
    // Trigger refresh of customers table
    setRefreshKey(prev => prev + 1)
  }, [])

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
            <BreadcrumbPage>Clientes</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-medium mb-1">¿Cómo funciona?</p>
                  <p className="text-xs mb-2"><strong>Base de Clientes:</strong> Registro completo de todos los clientes. Puedes crear nuevos clientes usando OCR desde DNI/Pasaporte para extracción automática de datos.</p>
                  <p className="text-xs mb-2"><strong>Filtros:</strong> Busca por nombre, email, teléfono o documento. Cada cliente puede estar asociado a múltiples operaciones.</p>
                  <p className="text-xs">Desde aquí accedes a estadísticas de clientes y su historial completo de operaciones.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-muted-foreground">Gestiona tu base de clientes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Exportar CSV
          </Button>
          <Button onClick={() => setNewCustomerDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Cliente
          </Button>
        </div>
      </div>

      <CustomersFilters onFilterChange={setFilters} />

      <CustomersTable initialFilters={filters} key={refreshKey} />

      <NewCustomerDialog
        open={newCustomerDialogOpen}
        onOpenChange={setNewCustomerDialogOpen}
        onSuccess={handleCustomerCreated}
      />
    </div>
  )
}

