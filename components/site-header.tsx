"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Blocks, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CommandMenu } from "@/components/command-menu"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { AnnouncementsBell } from "@/components/notifications/announcements-bell"
import { ToursMenu } from "@/components/tours/tours-menu"

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
    "/addons": "Complementos",
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

/**
 * `canManageBilling` se resuelve en el layout sobre TODOS los roles del usuario:
 * un ORG_OWNER que además vende tiene SELLER como rol principal y se quedaría
 * sin la entrada a la pantalla donde se contrata. Default `false`: ante la duda
 * no se muestra. El gate real vive en /addons y en /api/billing/addons.
 */
export function SiteHeader({ canManageBilling = false }: { canManageBilling?: boolean }) {
  const pathname = usePathname()
  const title = getPageTitle(pathname)
  const [commandMenuOpen, setCommandMenuOpen] = useState(false)
  const enComplementos = pathname === "/addons" || pathname.startsWith("/addons/")

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
            {/* Antes de las campanas: es navegación, no una notificación, y en
                el extremo derecho el usuario ya tiene aprendido que hay avisos.
                En pantallas chicas queda solo el ícono para no comerle lugar al
                buscador. */}
            {canManageBilling && (
              <Button
                variant="ghost"
                size="sm"
                asChild
                className={`gap-1.5 px-2 ${enComplementos ? "bg-accent text-foreground" : ""}`}
              >
                <Link href="/addons" aria-current={enComplementos ? "page" : undefined}>
                  <Blocks className="h-[18px] w-[18px]" />
                  <span className="hidden md:inline">Complementos</span>
                  <span className="sr-only md:hidden">Complementos</span>
                </Link>
              </Button>
            )}
            <ToursMenu />
            <AnnouncementsBell />
            <NotificationBell />
          </div>
        </div>
      </header>
      <CommandMenu open={commandMenuOpen} onOpenChange={setCommandMenuOpen} />
    </>
  )
}
