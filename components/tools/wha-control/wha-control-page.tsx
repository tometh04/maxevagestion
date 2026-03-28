"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PasswordGate } from "./password-gate"
import { DeviceList } from "./device-list"
import { InboxView } from "./inbox-view"
import { MetricsDashboard } from "./metrics-dashboard"
import { Smartphone, MessageSquare, BarChart3 } from "lucide-react"

interface WhaControlPageProps {
  userId: string
  userName: string
}

export function WhaControlPage({ userId, userName }: WhaControlPageProps) {
  return (
    <PasswordGate>
      <div className="flex flex-1 flex-col">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">WHA Control</h1>
          <p className="text-sm text-muted-foreground">
            Monitoreo de WhatsApp de vendedores
          </p>
        </div>

        <Tabs defaultValue="devices" className="flex flex-1 flex-col">
          <TabsList className="w-fit rounded-full">
            <TabsTrigger value="devices" className="gap-2 rounded-full">
              <Smartphone className="h-4 w-4" />
              Dispositivos
            </TabsTrigger>
            <TabsTrigger value="inbox" className="gap-2 rounded-full">
              <MessageSquare className="h-4 w-4" />
              Conversaciones
            </TabsTrigger>
            <TabsTrigger value="metrics" className="gap-2 rounded-full">
              <BarChart3 className="h-4 w-4" />
              Métricas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="devices" className="flex-1 mt-4">
            <DeviceList />
          </TabsContent>

          <TabsContent value="inbox" className="flex-1 mt-4">
            <InboxView />
          </TabsContent>

          <TabsContent value="metrics" className="flex-1 mt-4">
            <MetricsDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </PasswordGate>
  )
}
