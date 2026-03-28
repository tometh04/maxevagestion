"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart3, Wallet } from "lucide-react"

interface CashSummaryTabsProps {
  summaryContent: React.ReactNode
  accountsContent: React.ReactNode
}

export function CashSummaryTabs({ summaryContent, accountsContent }: CashSummaryTabsProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Caja y Bancos</h1>

      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Resumen
          </TabsTrigger>
          <TabsTrigger value="cuentas" className="gap-1.5">
            <Wallet className="h-3.5 w-3.5" />
            Cuentas Financieras
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-6">
          {summaryContent}
        </TabsContent>

        <TabsContent value="cuentas" className="mt-6">
          {accountsContent}
        </TabsContent>
      </Tabs>
    </div>
  )
}
