"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { BarChart3, TrendingUp, Wallet, Download, Percent, HelpCircle, Calendar, FileSearch, CalendarRange, Receipt, Coins, PackageSearch, CalendarClock, Landmark, Users } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { SalesReport } from "./sales-report"
import { CashFlowReport } from "./cash-flow-report"
import { MarginsReport } from "./margins-report"
import { VencimientosReport } from "./vencimientos-report"
import { ConciliacionReport } from "./conciliacion-report"
import { ClosingReport } from "./closing-report"
import { ExpensesReport } from "./expenses-report"
import { CommissionsReport } from "./commissions-report"
import { ReferralsReport } from "./referrals-report"
import { SalesBreakdownReport } from "./sales-breakdown-report"
import { CashflowProjectionReport } from "./cashflow-projection-report"
import { SocietarioReport } from "./societario-report"
import { canViewSocietarioReport } from "@/lib/reports/societario-access"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import Link from "next/link"

interface ReportsPageClientProps {
  userRole: string
  /** `role` + `additional_roles`: un SELLER con CONTABLE adicional entra igual. */
  userRoles?: string[]
  userId: string
  sellers: Array<{ id: string; name: string }>
  agencies: Array<{ id: string; name: string }>
}

export function ReportsPageClient({
  userRole,
  userRoles,
  userId,
  sellers,
  agencies,
}: ReportsPageClientProps) {
  const [activeTab, setActiveTab] = useState("sales")

  const canSeeCashFlow = ["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(userRole)
  // El reporte de gastos expone egresos del tenant: mismo círculo que caja /
  // contabilidad, incluyendo al owner. La API valida el permiso real.
  const canSeeExpenses = ["SUPER_ADMIN", "ORG_OWNER", "ADMIN", "CONTABLE"].includes(userRole)
  // Societario: dueños, admin y contable. Cosmético — el gate real está en
  // /api/reports/societario, que usa esta misma función.
  const canSeeSocietario = canViewSocietarioReport({ role: userRole, roles: userRoles })
  // Referidores: quien administra los referidos (VIB-86). El vendedor no tiene
  // que ver cuánto se lleva cada referidor, así que ni ve la pestaña; la API
  // (módulo `referrals`) es la que realmente lo valida.
  const canSeeReferrals = ["SUPER_ADMIN", "ORG_OWNER", "ADMIN", "CONTABLE"].includes(userRole)

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Reportes</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-medium mb-1">¿Cómo funciona?</p>
                <p className="text-xs mb-2"><strong>Reportes:</strong> Análisis detallado del rendimiento del negocio. Incluye reportes de ventas, márgenes y flujo de caja.</p>
                <p className="text-xs mb-2"><strong>Exportación:</strong> Todos los reportes pueden exportarse a Excel para análisis externos o presentaciones.</p>
                <p className="text-xs">Los reportes se calculan en USD para consistencia. Puedes filtrar por agencia, vendedor y rango de fechas.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-muted-foreground">Analiza el rendimiento del negocio</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="sales" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Ventas
          </TabsTrigger>
          <TabsTrigger value="sales-breakdown" className="flex items-center gap-2">
            <PackageSearch className="h-4 w-4" />
            Por producto
          </TabsTrigger>
          <TabsTrigger value="margins" className="flex items-center gap-2">
            <Percent className="h-4 w-4" />
            Márgenes
          </TabsTrigger>
          {canSeeCashFlow && (
            <TabsTrigger value="cashflow" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Flujo de Caja
            </TabsTrigger>
          )}
          {canSeeExpenses && (
            <TabsTrigger value="cashflow-projection" className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Caja proyectada
            </TabsTrigger>
          )}
          {canSeeExpenses && (
            <TabsTrigger value="expenses" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Gastos
            </TabsTrigger>
          )}
          {/* Visible para todos: un vendedor ve solo sus comisiones (la API lo scopea). */}
          <TabsTrigger value="commissions" className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            Comisiones
          </TabsTrigger>
          {canSeeReferrals && (
            <TabsTrigger value="referrals" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Referidores
            </TabsTrigger>
          )}
          <TabsTrigger value="vencimientos" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Vencimientos
          </TabsTrigger>
          {canSeeCashFlow && (
            <TabsTrigger value="conciliacion" className="flex items-center gap-2">
              <FileSearch className="h-4 w-4" />
              Conciliación
            </TabsTrigger>
          )}
          {canSeeCashFlow && (
            <TabsTrigger value="closing" className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4" />
              Cierre de Mes
            </TabsTrigger>
          )}
          {canSeeSocietario && (
            <TabsTrigger value="societario" className="flex items-center gap-2">
              <Landmark className="h-4 w-4" />
              Societario
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="sales" className="mt-6">
          <SalesReport 
            userRole={userRole} 
            userId={userId}
            sellers={sellers}
            agencies={agencies}
          />
        </TabsContent>

        <TabsContent value="sales-breakdown" className="mt-6">
          <SalesBreakdownReport sellers={sellers} agencies={agencies} />
        </TabsContent>

        <TabsContent value="margins" className="mt-6">
          <MarginsReport 
            userRole={userRole} 
            userId={userId}
            sellers={sellers}
            agencies={agencies}
          />
        </TabsContent>

        {canSeeCashFlow && (
          <TabsContent value="cashflow" className="mt-6">
            <CashFlowReport agencies={agencies} />
          </TabsContent>
        )}

        {canSeeExpenses && (
          <TabsContent value="cashflow-projection" className="mt-6">
            <CashflowProjectionReport agencies={agencies} />
          </TabsContent>
        )}

        {canSeeExpenses && (
          <TabsContent value="expenses" className="mt-6">
            <ExpensesReport agencies={agencies} />
          </TabsContent>
        )}

        <TabsContent value="commissions" className="mt-6">
          <CommissionsReport sellers={sellers} agencies={agencies} />
        </TabsContent>

        {canSeeReferrals && (
          <TabsContent value="referrals" className="mt-6">
            <ReferralsReport agencies={agencies} />
          </TabsContent>
        )}

        <TabsContent value="vencimientos" className="mt-6">
          <VencimientosReport agencies={agencies} />
        </TabsContent>

        {canSeeCashFlow && (
          <TabsContent value="conciliacion" className="mt-6">
            <ConciliacionReport agencies={agencies} />
          </TabsContent>
        )}

        {canSeeCashFlow && (
          <TabsContent value="closing" className="mt-6">
            <ClosingReport agencies={agencies} />
          </TabsContent>
        )}

        {canSeeSocietario && (
          <TabsContent value="societario" className="mt-6">
            <SocietarioReport agencies={agencies} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
