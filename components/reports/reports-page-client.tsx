"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { BarChart3, TrendingUp, Wallet, Download, Percent, HelpCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { SalesReport } from "./sales-report"
import { CashFlowReport } from "./cash-flow-report"
import { MarginsReport } from "./margins-report"
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
  userId: string
  sellers: Array<{ id: string; name: string }>
  agencies: Array<{ id: string; name: string }>
}

export function ReportsPageClient({ userRole, userId, sellers, agencies }: ReportsPageClientProps) {
  const [activeTab, setActiveTab] = useState("sales")

  const canSeeCashFlow = ["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(userRole)

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
          <h1 className="text-3xl font-bold">Reportes</h1>
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
        </TabsList>

        <TabsContent value="sales" className="mt-6">
          <SalesReport 
            userRole={userRole} 
            userId={userId}
            sellers={sellers}
            agencies={agencies}
          />
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
      </Tabs>
    </div>
  )
}
