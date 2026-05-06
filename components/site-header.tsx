"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Search } from "lucide-react"
import { CommandMenu } from "@/components/command-menu"
import { NotificationBell } from "@/components/notifications/notification-bell"

const getPageTitle = (pathname: string): string => {
  const routes: Record<string, string> = {
    "/dashboard": "Resumen",
    "/sales/crm-manychat": "CRM Ventas",
    "/operations": "Operaciones",
    "/customers": "Clientes",
    "/operators": "Operadores",
    "/cash/summary": "Caja",
    "/cash/income": "Ingresos",
    "/cash/expenses": "Egresos",
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
    "/tools/cerebro": "Cerebro",
    "/tools/tasks": "Tareas",
  }

  // Buscar coincidencia exacta o parcial
  for (const [route, title] of Object.entries(routes)) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      return title
    }
  }

  // Fallback neutro: si la ruta no matchea ninguna mapping, no mostramos título
  // (antes había hardcoded "Lozada Rosario", que en el SaaS multi-tenant hacía
  // que todas las agencias vieran el nombre de la agencia madrina en rutas
  // no mapeadas).
  return ""
}

export function SiteHeader() {
  const pathname = usePathname()
  const title = getPageTitle(pathname)
  const [commandMenuOpen, setCommandMenuOpen] = useState(false)

  return (
    <>
      <header className="flex h-(--header-height) shrink-0 items-center shadow-[0_1px_0_0_rgba(0,0,0,0.04)] bg-background/80 backdrop-blur-md transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
        <div className="flex w-full items-center gap-2 px-4 lg:px-6">
          <SidebarTrigger className="-ml-1" />
          <h1 className="text-sm font-medium text-foreground">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setCommandMenuOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors w-64"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">Buscar...</span>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">⌘K</kbd>
            </button>
            <NotificationBell />
          </div>
        </div>
      </header>
      <CommandMenu open={commandMenuOpen} onOpenChange={setCommandMenuOpen} />
    </>
  )
}
