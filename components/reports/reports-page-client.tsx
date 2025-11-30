"use client"

import { useState, useCallback, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ReportsFilters, ReportsFiltersState } from "./reports-filters"
import { SalesReport } from "./sales-report"
import { FinancialReport } from "./financial-report"
import { OperatorsReport } from "./operators-report"
import { CommissionsReport } from "./commissions-report"
import { Download, FileText, TrendingUp, Building2, DollarSign } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ReportsPageClientProps {
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  defaultFilters: ReportsFiltersState
}

export function ReportsPageClient({
  agencies,
  sellers,
  defaultFilters,
}: ReportsPageClientProps) {
  const [filters, setFilters] = useState<ReportsFiltersState>(defaultFilters)
  const [activeTab, setActiveTab] = useState("sales")

  const handleFiltersChange = useCallback((newFilters: ReportsFiltersState) => {
    setFilters(newFilters)
  }, [])

  const handleReset = useCallback(() => {
    setFilters(defaultFilters)
  }, [defaultFilters])

  const handleExport = useCallback(
    async (format: "csv" | "pdf" | "excel", reportType: string) => {
      try {
        const params = new URLSearchParams()
        params.set("dateFrom", filters.dateFrom)
        params.set("dateTo", filters.dateTo)
        params.set("reportType", reportType)
        if (filters.agencyId !== "ALL") {
          params.set("agencyId", filters.agencyId)
        }
        if (filters.sellerId !== "ALL") {
          params.set("sellerId", filters.sellerId)
        }
        params.set("format", format)

        const response = await fetch(`/api/reports/export?${params.toString()}`)

        if (!response.ok) {
          throw new Error("Error al exportar reporte")
        }

        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `reporte-${reportType}-${Date.now()}.${format === "excel" ? "xlsx" : format}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      } catch (error) {
        console.error("Error al exportar:", error)
        alert("No se pudo exportar el reporte. Intenta nuevamente.")
      }
    },
    [filters]
  )

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Reportes</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Análisis y reportes del negocio
          </p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <Download className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Exportar</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => handleExport("csv", activeTab)}>
                <FileText className="mr-2 h-4 w-4" />
                CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("pdf", activeTab)}>
                <FileText className="mr-2 h-4 w-4" />
                PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("excel", activeTab)}>
                <FileText className="mr-2 h-4 w-4" />
                Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filters */}
      <ReportsFilters
        agencies={agencies}
        sellers={sellers}
        defaultFilters={defaultFilters}
        onFiltersChange={handleFiltersChange}
        onReset={handleReset}
      />

      {/* Reports Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="sales" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Ventas</span>
          </TabsTrigger>
          <TabsTrigger value="financial" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Financiero</span>
          </TabsTrigger>
          <TabsTrigger value="operators" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Operadores</span>
          </TabsTrigger>
          <TabsTrigger value="commissions" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Comisiones</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4 sm:mt-6">
          <SalesReport filters={filters} />
        </TabsContent>

        <TabsContent value="financial" className="mt-4 sm:mt-6">
          <FinancialReport filters={filters} />
        </TabsContent>

        <TabsContent value="operators" className="mt-4 sm:mt-6">
          <OperatorsReport filters={filters} />
        </TabsContent>

        <TabsContent value="commissions" className="mt-4 sm:mt-6">
          <CommissionsReport filters={filters} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

