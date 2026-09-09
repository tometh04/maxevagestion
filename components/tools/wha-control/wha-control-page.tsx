"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DeviceList } from "./device-list"
import { InboxView } from "./inbox-view"
import { MetricsDashboard } from "./metrics-dashboard"
import { FollowupSettingsForm } from "./followup-settings-form"
import { Smartphone, MessageSquare, BarChart3, Timer } from "lucide-react"

interface Agency {
  id: string
  name: string
}

interface WhaControlPageProps {
  userId: string
  userName: string
  agencies: Agency[]
  quoteFollowupEnabled?: boolean
  /** Teléfono para aterrizar directo en Conversaciones (link desde un lead). */
  initialPhone?: string
  /** Administración ve los teléfonos de toda la org; un vendedor, solo el suyo. */
  isWhaAdmin?: boolean
}

export function WhaControlPage({
  userId,
  userName,
  agencies,
  quoteFollowupEnabled = false,
  initialPhone,
  isWhaAdmin = false,
}: WhaControlPageProps) {
  // El vendedor arranca en sus conversaciones: vincular el teléfono es algo que
  // hace una vez, no cada vez que entra.
  const tabInicial = initialPhone || !isWhaAdmin ? "inbox" : "devices"

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp central</h1>
        <p className="text-sm text-muted-foreground">
          {isWhaAdmin
            ? "Todos los teléfonos de la agencia, en un solo lugar"
            : "Tu WhatsApp de trabajo, con el seguimiento de cotizaciones"}
        </p>
      </div>

      <Tabs defaultValue={tabInicial} className="flex flex-1 flex-col">
        <TabsList className="w-fit rounded-full">
          <TabsTrigger value="inbox" className="gap-2 rounded-full">
            <MessageSquare className="h-4 w-4" />
            Conversaciones
          </TabsTrigger>
          <TabsTrigger value="devices" className="gap-2 rounded-full">
            <Smartphone className="h-4 w-4" />
            {isWhaAdmin ? "Dispositivos" : "Mi teléfono"}
          </TabsTrigger>
          {isWhaAdmin && (
            <TabsTrigger value="metrics" className="gap-2 rounded-full">
              <BarChart3 className="h-4 w-4" />
              Métricas
            </TabsTrigger>
          )}
          {isWhaAdmin && quoteFollowupEnabled && (
            <TabsTrigger value="followups" className="gap-2 rounded-full">
              <Timer className="h-4 w-4" />
              Seguimientos
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="inbox" className="flex-1 mt-4">
          <InboxView
            agencies={agencies}
            quoteFollowupEnabled={quoteFollowupEnabled}
            initialPhone={initialPhone}
            isWhaAdmin={isWhaAdmin}
          />
        </TabsContent>

        <TabsContent value="devices" className="flex-1 mt-4">
          <DeviceList agencies={agencies} />
        </TabsContent>

        {isWhaAdmin && (
          <TabsContent value="metrics" className="flex-1 mt-4">
            <MetricsDashboard agencies={agencies} />
          </TabsContent>
        )}

        {isWhaAdmin && quoteFollowupEnabled && (
          <TabsContent value="followups" className="flex-1 mt-4">
            <FollowupSettingsForm />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
