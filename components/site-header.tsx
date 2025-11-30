"use client"

import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

const getPageTitle = (pathname: string): string => {
  const routes: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/sales/leads": "Leads",
    "/quotations": "Cotizaciones",
    "/operations": "Operaciones",
    "/tariffs": "Tarifarios",
    "/quotas": "Cupos",
    "/customers": "Clientes",
    "/operators": "Operadores",
    "/cash": "Caja",
    "/cash/movements": "Movimientos",
    "/cash/payments": "Pagos",
    "/accounting/ledger": "Libro Mayor",
    "/accounting/iva": "IVA",
    "/accounting/financial-accounts": "Cuentas Financieras",
    "/accounting/operator-payments": "Pagos a Operadores",
    "/accounting/recurring-payments": "Pagos Recurrentes",
    "/alerts": "Alertas",
    "/calendar": "Calendario",
    "/reports": "Reportes",
    "/my/balance": "Mi Balance",
    "/my/commissions": "Mis Comisiones",
    "/settings": "Configuración",
  }

  // Buscar coincidencia exacta o parcial
  for (const [route, title] of Object.entries(routes)) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      return title
    }
  }

  return "ERP Lozada"
}

export function SiteHeader() {
  const pathname = usePathname()
  const title = getPageTitle(pathname)

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

