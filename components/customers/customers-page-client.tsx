"use client"

import { useState, useCallback } from "react"
import { CustomersFilters } from "./customers-filters"
import { CustomersTable } from "./customers-table"
import { NewCustomerDialog } from "./new-customer-dialog"
import { Button } from "@/components/ui/button"
import { Plus, HelpCircle } from "lucide-react"
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
  const [filters, setFilters] = useState({ search: "" })
  const [newCustomerDialogOpen, setNewCustomerDialogOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

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
            <h1 className="text-3xl font-bold">Clientes</h1>
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
        <Button onClick={() => setNewCustomerDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Cliente
        </Button>
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

