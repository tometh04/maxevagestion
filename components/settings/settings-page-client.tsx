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
      <TabsList>
        <TabsTrigger value="users">Usuarios</TabsTrigger>
        <TabsTrigger value="agencies">Agencias</TabsTrigger>
        <TabsTrigger value="trello">Trello</TabsTrigger>
        <TabsTrigger value="commissions">Comisiones</TabsTrigger>
        <TabsTrigger value="ai">AI</TabsTrigger>
        <TabsTrigger value="requirements">Requisitos Destino</TabsTrigger>
        <TabsTrigger value="import">Importar Datos</TabsTrigger>
        {userRole === "SUPER_ADMIN" && <TabsTrigger value="seed">Seed Data</TabsTrigger>}
      </TabsList>
      <TabsContent value="users">
        <UsersSettings />
      </TabsContent>
      <TabsContent value="agencies">
        <AgenciesSettings />
      </TabsContent>
      <TabsContent value="trello">
        <TrelloSettings agencies={agencies} defaultAgencyId={firstAgencyId} />
      </TabsContent>
      <TabsContent value="commissions">
        <CommissionsSettings />
      </TabsContent>
      <TabsContent value="ai">
        <AISettings />
      </TabsContent>
      <TabsContent value="requirements">
        <DestinationRequirementsClient />
      </TabsContent>
      <TabsContent value="import">
        <ImportSettings />
      </TabsContent>
      {userRole === "SUPER_ADMIN" && (
        <TabsContent value="seed" className="space-y-4">
          <SeedMockData />
          <MigrateHistoricalAccounting />
        </TabsContent>
      )}
    </Tabs>
  )
}
