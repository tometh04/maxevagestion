"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BookOpen, Users, Plane, UserCheck, BarChart3, FileText, BookMarked, ListTree, Scale, Landmark, CalendarCheck, BookText, UserSquare } from "lucide-react"
import { AccountingSetupBanner } from "./accounting-setup-banner"

interface ContabilidadTabsProps {
  ledgerContent: React.ReactNode
  journalEntriesContent: React.ReactNode
  generalLedgerContent: React.ReactNode
  financialStatementsContent: React.ReactNode
  monthlyCloseContent: React.ReactNode
  libroDiarioContent: React.ReactNode
  currentAccountContent: React.ReactNode
  chartOfAccountsContent: React.ReactNode
  debtsSalesContent: React.ReactNode
  operatorPaymentsContent: React.ReactNode
  partnerAccountsContent: React.ReactNode
  monthlyPositionContent: React.ReactNode
  facturasComprasContent: React.ReactNode
  showPartnerAccounts?: boolean
  /** Tab inicial (deep-link, ej. ?tab=ledger&accountId=... desde Cuentas Financieras) */
  initialTab?: string
}

export function ContabilidadTabs({
  ledgerContent,
  journalEntriesContent,
  generalLedgerContent,
  financialStatementsContent,
  monthlyCloseContent,
  libroDiarioContent,
  currentAccountContent,
  chartOfAccountsContent,
  debtsSalesContent,
  operatorPaymentsContent,
  partnerAccountsContent,
  monthlyPositionContent,
  facturasComprasContent,
  showPartnerAccounts = true,
  initialTab,
}: ContabilidadTabsProps) {
  const validTabs = [
    "ledger",
    "asientos",
    "diario",
    "mayor",
    "estados",
    "cierre",
    "operators",
    "debts",
    "ctacte",
    "partners",
    "posicion",
    "facturas-compras",
    "plan-cuentas",
  ]
  const defaultTab = initialTab && validTabs.includes(initialTab) ? initialTab : "ledger"

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Contabilidad</h1>

      {/* Solo aparece si falta configurar, y solo desde el 1/9. */}
      <AccountingSetupBanner />

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="ledger" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Libro Mayor
          </TabsTrigger>
          <TabsTrigger value="asientos" className="gap-1.5">
            <BookMarked className="h-3.5 w-3.5" />
            Asientos
          </TabsTrigger>
          <TabsTrigger value="diario" className="gap-1.5">
            <BookText className="h-3.5 w-3.5" />
            Libro Diario
          </TabsTrigger>
          <TabsTrigger value="mayor" className="gap-1.5">
            <Scale className="h-3.5 w-3.5" />
            Mayor por Cuenta
          </TabsTrigger>
          <TabsTrigger value="estados" className="gap-1.5">
            <Landmark className="h-3.5 w-3.5" />
            Estados Contables
          </TabsTrigger>
          <TabsTrigger value="cierre" className="gap-1.5">
            <CalendarCheck className="h-3.5 w-3.5" />
            Cierre Mensual
          </TabsTrigger>
          <TabsTrigger value="operators" className="gap-1.5">
            <Plane className="h-3.5 w-3.5" />
            Pagos a Operadores
          </TabsTrigger>
          <TabsTrigger value="debts" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Deudores por Ventas
          </TabsTrigger>
          <TabsTrigger value="ctacte" className="gap-1.5">
            <UserSquare className="h-3.5 w-3.5" />
            Cuentas Corrientes
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

        <TabsContent value="diario" className="mt-6">
          {libroDiarioContent}
        </TabsContent>

        <TabsContent value="mayor" className="mt-6">
          {generalLedgerContent}
        </TabsContent>

        <TabsContent value="estados" className="mt-6">
          {financialStatementsContent}
        </TabsContent>

        <TabsContent value="cierre" className="mt-6">
          {monthlyCloseContent}
        </TabsContent>

        <TabsContent value="operators" className="mt-6">
          {operatorPaymentsContent}
        </TabsContent>

        <TabsContent value="debts" className="mt-6">
          {debtsSalesContent}
        </TabsContent>

        <TabsContent value="ctacte" className="mt-6">
          {currentAccountContent}
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
