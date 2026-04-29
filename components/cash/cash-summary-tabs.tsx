"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart3, Wallet, CreditCard, ArrowLeftRight } from "lucide-react"

interface CashSummaryTabsProps {
  summaryContent: React.ReactNode
  accountsContent: React.ReactNode
  paymentsContent: React.ReactNode
  movementsContent: React.ReactNode
}

export function CashSummaryTabs({
  summaryContent,
  accountsContent,
  paymentsContent,
  movementsContent,
}: CashSummaryTabsProps) {
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
          <TabsTrigger value="pagos" className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            Pagos
          </TabsTrigger>
          <TabsTrigger value="movimientos" className="gap-1.5">
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Movimientos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-6">
          {summaryContent}
        </TabsContent>

        <TabsContent value="cuentas" className="mt-6">
          {accountsContent}
        </TabsContent>

        <TabsContent value="pagos" className="mt-6">
          {paymentsContent}
        </TabsContent>

        <TabsContent value="movimientos" className="mt-6">
          {movementsContent}
        </TabsContent>
      </Tabs>
    </div>
  )
}
