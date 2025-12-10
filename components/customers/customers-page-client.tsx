"use client"

import { useState, useCallback } from "react"
import { CustomersFilters } from "./customers-filters"
import { CustomersTable } from "./customers-table"
import { NewCustomerDialog } from "./new-customer-dialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
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
          <h1 className="text-3xl font-bold">Clientes</h1>
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

