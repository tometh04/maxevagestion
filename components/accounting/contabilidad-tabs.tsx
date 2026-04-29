"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BookOpen, Users, Plane, UserCheck, BarChart3, FileText, BookMarked, ListTree } from "lucide-react"

interface ContabilidadTabsProps {
  ledgerContent: React.ReactNode
  journalEntriesContent: React.ReactNode
  chartOfAccountsContent: React.ReactNode
  debtsSalesContent: React.ReactNode
  operatorPaymentsContent: React.ReactNode
  partnerAccountsContent: React.ReactNode
  monthlyPositionContent: React.ReactNode
  facturasComprasContent: React.ReactNode
  showPartnerAccounts?: boolean
}

export function ContabilidadTabs({
  ledgerContent,
  journalEntriesContent,
  chartOfAccountsContent,
  debtsSalesContent,
  operatorPaymentsContent,
  partnerAccountsContent,
  monthlyPositionContent,
  facturasComprasContent,
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
          <TabsTrigger value="asientos" className="gap-1.5">
            <BookMarked className="h-3.5 w-3.5" />
            Asientos
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
          <TabsTrigger value="facturas-compras" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Facturas Compras
          </TabsTrigger>
          <TabsTrigger value="plan-cuentas" className="gap-1.5">
            <ListTree className="h-3.5 w-3.5" />
            Plan de Cuentas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ledger" className="mt-6">
          {ledgerContent}
        </TabsContent>

        <TabsContent value="asientos" className="mt-6">
          {journalEntriesContent}
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

        <TabsContent value="facturas-compras" className="mt-6">
          {facturasComprasContent}
        </TabsContent>

        <TabsContent value="plan-cuentas" className="mt-6">
          {chartOfAccountsContent}
        </TabsContent>
      </Tabs>
    </div>
  )
}
