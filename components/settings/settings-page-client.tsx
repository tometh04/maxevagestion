"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UsersSettings } from "@/components/settings/users-settings"
import { AgenciesSettings } from "@/components/settings/agencies-settings"
import { TrelloSettings } from "@/components/settings/trello-settings"
import { CommissionsSettings } from "@/components/settings/commissions-settings"
import { AISettings } from "@/components/settings/ai-settings"
import { SeedMockData } from "@/components/settings/seed-mock-data"
import { MigrateHistoricalAccounting } from "@/components/settings/migrate-historical-accounting"
import { ImportSettings } from "@/components/settings/import-settings"
import { DestinationRequirementsClient } from "@/components/settings/destination-requirements-client"
import { AfipSettings } from "@/components/settings/afip-settings"
import { InterfaceSettings } from "@/components/settings/interface-settings"
import { AuditSettings } from "@/components/settings/audit-settings"
import { OperatorsTable, Operator } from "@/components/operators/operators-table"
import { NewOperatorDialog } from "@/components/operators/new-operator-dialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

interface SettingsPageClientProps {
  defaultTab: string
  agencies: Array<{ id: string; name: string }>
  firstAgencyId: string | null
  userRole: string
}

function OperatorsTab() {
  const [operators, setOperators] = useState<Operator[]>([])
  const [loading, setLoading] = useState(false)
  const [newOperatorDialogOpen, setNewOperatorDialogOpen] = useState(false)

  const fetchOperators = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/operators")
      const data = await response.json()
      setOperators(data.operators || [])
    } catch (error) {
      console.error("Error fetching operators:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOperators()
  }, [fetchOperators])

  const handleOperatorCreated = useCallback(() => {
    fetchOperators()
  }, [fetchOperators])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Gestiona los operadores y proveedores de servicios turísticos.
        </p>
        <Button onClick={() => setNewOperatorDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Operador
        </Button>
      </div>

      <OperatorsTable
        operators={operators}
        isLoading={loading}
        emptyMessage="No hay operadores registrados"
      />

      <NewOperatorDialog
        open={newOperatorDialogOpen}
        onOpenChange={setNewOperatorDialogOpen}
        onSuccess={handleOperatorCreated}
      />
    </div>
  )
}

export function SettingsPageClient({ defaultTab, agencies, firstAgencyId, userRole }: SettingsPageClientProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabFromUrl = searchParams.get("tab") || defaultTab

  return (
    <Tabs defaultValue={tabFromUrl} className="w-full" onValueChange={(value) => {
      // Actualizar URL sin recargar página
      const params = new URLSearchParams(searchParams.toString())
      params.set("tab", value)
      router.push(`/settings?${params.toString()}`, { scroll: false })
    }}>
      <TabsList className="flex-wrap">
        <TabsTrigger value="interface">Interfaz</TabsTrigger>
        <TabsTrigger value="users">Usuarios</TabsTrigger>
        <TabsTrigger value="operadores">Operadores</TabsTrigger>
        <TabsTrigger value="agencies">Agencias</TabsTrigger>
        {/* Hidden tabs - kept for future use
        <TabsTrigger value="trello">Trello</TabsTrigger>
        <TabsTrigger value="commissions">Comisiones</TabsTrigger>
        <TabsTrigger value="ai">AI</TabsTrigger>
        <TabsTrigger value="import">Importar Datos</TabsTrigger>
        {userRole === "SUPER_ADMIN" && <TabsTrigger value="seed">Seed Data</TabsTrigger>}
        */}
        <TabsTrigger value="requirements">Requisitos Destino</TabsTrigger>
        <TabsTrigger value="afip">Facturación AFIP</TabsTrigger>
        <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
      </TabsList>
      <TabsContent value="interface" className="mt-6">
        <InterfaceSettings />
      </TabsContent>
      <TabsContent value="users" className="mt-6">
        <UsersSettings />
      </TabsContent>
      <TabsContent value="operadores" className="mt-6">
        <OperatorsTab />
      </TabsContent>
      <TabsContent value="agencies" className="mt-6">
        <AgenciesSettings />
      </TabsContent>
      {/* Hidden tab contents - kept for future use */}
      <TabsContent value="trello" className="mt-6">
        <TrelloSettings agencies={agencies} defaultAgencyId={firstAgencyId} />
      </TabsContent>
      <TabsContent value="commissions" className="mt-6">
        <CommissionsSettings />
      </TabsContent>
      <TabsContent value="ai" className="mt-6">
        <AISettings />
      </TabsContent>
      <TabsContent value="import" className="mt-6">
        <ImportSettings />
      </TabsContent>
      {/* End hidden tab contents */}
      <TabsContent value="requirements" className="mt-6">
        <DestinationRequirementsClient />
      </TabsContent>
      <TabsContent value="afip" className="mt-6">
        <AfipSettings agencies={agencies} defaultAgencyId={firstAgencyId} />
      </TabsContent>
      <TabsContent value="auditoria" className="mt-6">
        <AuditSettings />
      </TabsContent>
      {userRole === "SUPER_ADMIN" && (
        <TabsContent value="seed" className="mt-6 space-y-6">
          <SeedMockData />
          <MigrateHistoricalAccounting />
        </TabsContent>
      )}
    </Tabs>
  )
}
