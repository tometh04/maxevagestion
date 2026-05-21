"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UsersSettings } from "@/components/settings/users-settings"
import { AgenciesSettings } from "@/components/settings/agencies-settings"
import { CommissionsSettings } from "@/components/settings/commissions-settings"
import { AISettings } from "@/components/settings/ai-settings"
import { SeedMockData } from "@/components/settings/seed-mock-data"
import { MigrateHistoricalAccounting } from "@/components/settings/migrate-historical-accounting"
import { DestinationRequirementsClient } from "@/components/settings/destination-requirements-client"
import { AfipSettings } from "@/components/settings/afip-settings"
import { InterfaceSettings } from "@/components/settings/interface-settings"
import { AuditSettings } from "@/components/settings/audit-settings"
import { AgencyApprovalRulesForm } from "@/components/settings/agency-approval-rules-form"
import { PermissionsMatrix } from "@/components/settings/permissions-matrix"
import { OperatorsTable, Operator } from "@/components/operators/operators-table"
import { NewOperatorDialog } from "@/components/operators/new-operator-dialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

interface SettingsPageClientProps {
  defaultTab: string
  agencies: Array<{ id: string; name: string }>
  firstAgencyId: string | null
  userRole: string
  initialPermissionsMatrix?: Record<string, Record<string, { read: boolean; write: boolean; delete: boolean; export: boolean; ownDataOnly: boolean }>>
  initialPermissionsCustomized?: Record<string, string[]>
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

export function SettingsPageClient({ defaultTab, agencies, firstAgencyId, userRole, initialPermissionsMatrix, initialPermissionsCustomized }: SettingsPageClientProps) {
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
        <TabsTrigger value="interface">Mi Empresa</TabsTrigger>
        <TabsTrigger value="users">Usuarios</TabsTrigger>
        <TabsTrigger value="operadores">Operadores</TabsTrigger>
        <TabsTrigger value="agencies">Agencias</TabsTrigger>
        {/* Hidden tabs - kept for future use
        <TabsTrigger value="commissions">Comisiones</TabsTrigger>
        <TabsTrigger value="ai">AI</TabsTrigger>
        <TabsTrigger value="import">Importar Datos</TabsTrigger>
        {userRole === "SUPER_ADMIN" && <TabsTrigger value="seed">Seed Data</TabsTrigger>}
        */}
        <TabsTrigger value="requirements">Requisitos Destino</TabsTrigger>
        <TabsTrigger value="afip">Facturación AFIP</TabsTrigger>
        <TabsTrigger value="permisos">Permisos de Roles</TabsTrigger>
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
        <div className="space-y-6">
          <AgenciesSettings />
          {agencies.length > 0 && (
            <div className="space-y-6">
              {agencies.map((agency) => (
                <div key={agency.id} className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground/80">
                    Reglas de aprobación · {agency.name}
                  </h3>
                  <AgencyApprovalRulesForm agencyId={agency.id} />
                </div>
              ))}
            </div>
          )}
        </div>
      </TabsContent>
      {/* Hidden tab contents - kept for future use */}
      <TabsContent value="commissions" className="mt-6">
        <CommissionsSettings />
      </TabsContent>
      <TabsContent value="ai" className="mt-6">
        <AISettings />
      </TabsContent>
      {/* End hidden tab contents */}
      <TabsContent value="requirements" className="mt-6">
        <DestinationRequirementsClient />
      </TabsContent>
      <TabsContent value="afip" className="mt-6">
        <AfipSettings agencies={agencies} defaultAgencyId={firstAgencyId} />
      </TabsContent>
      <TabsContent value="permisos" className="mt-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold">Matriz de permisos por rol</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Configurá qué puede ver y hacer cada rol en tu agencia.
              Los cambios aplican solo a esta agencia y tienen prioridad sobre los valores predeterminados del sistema.
              SUPER_ADMIN y ORG_OWNER siempre tienen acceso completo.
            </p>
          </div>
          <PermissionsMatrix
            agencies={agencies}
            initialAgencyId={firstAgencyId}
            initialMatrix={initialPermissionsMatrix ?? {}}
            initialCustomized={initialPermissionsCustomized ?? {}}
            readOnly={userRole !== "SUPER_ADMIN" && userRole !== "ORG_OWNER" && userRole !== "ADMIN"}
          />
        </div>
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
