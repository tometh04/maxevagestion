"use client"

import { useEffect } from "react"
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

interface SettingsPageClientProps {
  defaultTab: string
  agencies: Array<{ id: string; name: string }>
  firstAgencyId: string | null
  userRole: string
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
        <TabsTrigger value="users">Usuarios</TabsTrigger>
        <TabsTrigger value="agencies">Agencias</TabsTrigger>
        <TabsTrigger value="trello">Trello</TabsTrigger>
        <TabsTrigger value="commissions">Comisiones</TabsTrigger>
        <TabsTrigger value="ai">AI</TabsTrigger>
        <TabsTrigger value="requirements">Requisitos Destino</TabsTrigger>
        <TabsTrigger value="afip">Facturación AFIP</TabsTrigger>
        <TabsTrigger value="import">Importar Datos</TabsTrigger>
        {userRole === "SUPER_ADMIN" && <TabsTrigger value="seed">Seed Data</TabsTrigger>}
      </TabsList>
      <TabsContent value="users" className="mt-6">
        <UsersSettings />
      </TabsContent>
      <TabsContent value="agencies" className="mt-6">
        <AgenciesSettings />
      </TabsContent>
      <TabsContent value="trello" className="mt-6">
        <TrelloSettings agencies={agencies} defaultAgencyId={firstAgencyId} />
      </TabsContent>
      <TabsContent value="commissions" className="mt-6">
        <CommissionsSettings />
      </TabsContent>
      <TabsContent value="ai" className="mt-6">
        <AISettings />
      </TabsContent>
      <TabsContent value="requirements" className="mt-6">
        <DestinationRequirementsClient />
      </TabsContent>
      <TabsContent value="afip" className="mt-6">
        <AfipSettings agencies={agencies} defaultAgencyId={firstAgencyId} />
      </TabsContent>
      <TabsContent value="import" className="mt-6">
        <ImportSettings />
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
