"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BookOpen, Users, Plane, UserCheck, BarChart3 } from "lucide-react"

interface ContabilidadTabsProps {
  ledgerContent: React.ReactNode
  debtsSalesContent: React.ReactNode
  operatorPaymentsContent: React.ReactNode
  partnerAccountsContent: React.ReactNode
  monthlyPositionContent: React.ReactNode
  showPartnerAccounts?: boolean
}

export function ContabilidadTabs({
  ledgerContent,
  debtsSalesContent,
  operatorPaymentsContent,
  partnerAccountsContent,
  monthlyPositionContent,
  showPartnerAccounts = true,
}: ContabilidadTabsProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Contabilidad</h1>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Libro Mayor
          </TabsTrigger>
          <TabsTrigger value="operators" className="gap-1.5">
            <Plane className="h-3.5 w-3.5" />
            Pagos a Operadores
          </TabsTrigger>
          <TabsTrigger value="debts" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Deudores por Ventas
          </TabsTrigger>
          {showPartnerAccounts && (
            <TabsTrigger value="partners" className="gap-1.5">
              <UserCheck className="h-3.5 w-3.5" />
              Cuentas de Socios
            </TabsTrigger>
          )}
          <TabsTrigger value="posicion" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Posición Mensual
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ledger" className="mt-6">
          {ledgerContent}
        </TabsContent>

        <TabsContent value="operators" className="mt-6">
          {operatorPaymentsContent}
        </TabsContent>

        <TabsContent value="debts" className="mt-6">
          {debtsSalesContent}
        </TabsContent>

        {showPartnerAccounts && (
          <TabsContent value="partners" className="mt-6">
            {partnerAccountsContent}
          </TabsContent>
        )}

        <TabsContent value="posicion" className="mt-6">
          {monthlyPositionContent}
        </TabsContent>
      </Tabs>
    </div>
  )
}
