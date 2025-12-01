"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface ExportReportButtonProps {
  reportType: "operations" | "customers" | "payments" | "leads"
  dateFrom?: string
  dateTo?: string
  agencyId?: string
  variant?: "default" | "outline" | "ghost" | "secondary"
  size?: "default" | "sm" | "lg" | "icon"
}

export function ExportReportButton({
  reportType,
  dateFrom,
  dateTo,
  agencyId,
  variant = "outline",
  size = "sm",
}: ExportReportButtonProps) {
  const [exporting, setExporting] = useState(false)

  async function handleExport(format: "csv" | "json") {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      params.set("type", reportType)
      params.set("format", format)
      if (dateFrom) params.set("dateFrom", dateFrom)
      if (dateTo) params.set("dateTo", dateTo)
      if (agencyId) params.set("agencyId", agencyId)

      const response = await fetch(`/api/reports/export?${params.toString()}`)

      if (!response.ok) {
        throw new Error("Error al exportar reporte")
      }

      if (format === "csv") {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${reportType}-${new Date().toISOString().split("T")[0]}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        toast.success("Reporte exportado exitosamente")
      } else {
        const data = await response.json()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${reportType}-${new Date().toISOString().split("T")[0]}.json`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        toast.success("Reporte exportado exitosamente")
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setExporting(false)
    }
  }

  const reportLabels: Record<string, string> = {
    operations: "Operaciones",
    customers: "Clientes",
    payments: "Pagos",
    leads: "Leads",
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={exporting}>
          {exporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport("csv")}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Exportar como CSV (Excel)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("json")}>
          <FileText className="h-4 w-4 mr-2" />
          Exportar como JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

