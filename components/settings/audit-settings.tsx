"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AuditLogsSettings } from "@/components/settings/audit-logs-settings"
import { ReconciliationSettings } from "@/components/settings/reconciliation-settings"
import { HealthSettings } from "@/components/settings/health-settings"
import { ScrollText, ShieldCheck, Activity } from "lucide-react"

export function AuditSettings() {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="health" className="w-full">
        <TabsList>
          <TabsTrigger value="health" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Salud
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Reconciliación
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5">
            <ScrollText className="h-3.5 w-3.5" />
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-4">
          <HealthSettings />
        </TabsContent>

        <TabsContent value="reconciliation" className="mt-4">
          <ReconciliationSettings />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <AuditLogsSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}
