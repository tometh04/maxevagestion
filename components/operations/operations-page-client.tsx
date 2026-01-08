"use client"

import { useState, useEffect } from "react"
import { OperationsFilters } from "./operations-filters"
import { OperationsTable } from "./operations-table"
import { NewOperationDialog } from "./new-operation-dialog"
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

interface CustomStatus {
  value: string
  label: string
  color?: string
}

interface OperationsPageClientProps {
  sellers: Array<{ id: string; name: string }>
  agencies: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
  userRole: string
  userId: string
  userAgencyIds: string[]
  defaultAgencyId?: string
  defaultSellerId?: string
}

export function OperationsPageClient({
  sellers,
  agencies,
  operators,
  userRole,
  userId,
  userAgencyIds,
  defaultAgencyId,
  defaultSellerId,
}: OperationsPageClientProps) {
  const [filters, setFilters] = useState<{
    status: string
    sellerId: string
    agencyId: string
    dateFrom: string
    dateTo: string
    paymentDateFrom?: string
    paymentDateTo?: string
    paymentDateType?: string
  }>({
    status: "ALL",
    sellerId: "ALL",
    agencyId: "ALL",
    dateFrom: "",
    dateTo: "",
  })
  const [newOperationDialogOpen, setNewOperationDialogOpen] = useState(false)
  const [customStatuses, setCustomStatuses] = useState<CustomStatus[]>([])

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
          <h1 className="text-3xl font-bold">Operaciones</h1>
          <p className="text-muted-foreground">Gestiona todas las operaciones de viajes</p>
        </div>
        <Button onClick={() => setNewOperationDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Operación
        </Button>
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
        userAgencyIds={userAgencyIds}
      />

      <NewOperationDialog
        open={newOperationDialogOpen}
        onOpenChange={setNewOperationDialogOpen}
        onSuccess={handleRefresh}
        agencies={agencies}
        sellers={sellers}
        operators={operators}
        defaultAgencyId={defaultAgencyId}
        defaultSellerId={defaultSellerId}
      />
    </div>
  )
}

