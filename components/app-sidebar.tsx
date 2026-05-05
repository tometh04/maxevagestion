"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  DollarSign,
  Plane,
  GalleryVerticalEnd,
  Bot,
} from "lucide-react"
import { shouldShowInSidebar, type UserRole } from "@/lib/permissions"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { ThemeToggleSidebar } from "@/components/theme-toggle-sidebar"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

interface NavSubSubItem {
  title: string
  url: string
}

interface NavSubItem {
  title: string
  url: string
  items?: NavSubSubItem[]
  module?: "dashboard" | "leads" | "operations" | "customers" | "operators" | "cash" | "accounting" | "alerts" | "reports" | "settings" | "commissions"
}

interface NavItem {
  title: string
  url: string
  icon?: React.ComponentType<{ className?: string }>
  items?: NavSubItem[]
  module?: "dashboard" | "leads" | "operations" | "customers" | "operators" | "cash" | "accounting" | "alerts" | "reports" | "settings" | "commissions"
  collapsible?: boolean
}

const allNavigation: NavItem[] = [
  // 1. Resumen
  {
    title: "Resumen",
    url: "/dashboard",
    icon: LayoutDashboard,
    module: "dashboard",
    collapsible: false,
  },
  // 2. CRM Ventas
  {
    title: "CRM Ventas",
    url: "/sales/crm-manychat",
    icon: ShoppingCart,
    module: "leads",
    items: [
      // { title: "Leads", url: "/sales/leads" }, // OCULTO temporalmente
      { title: "CRM Manychat", url: "/sales/crm-manychat" },
      { title: "Estadísticas", url: "/sales/statistics" },
    ],
  },
  // 3. Clientes
  {
    title: "Clientes",
    url: "/customers",
    icon: Users,
    module: "customers",
    items: [
      { title: "Clientes", url: "/customers" },
      { title: "Estadísticas", url: "/customers/statistics" },
    ],
  },
  // 4. Operaciones / Files
  {
    title: "Operaciones",
    url: "/operations",
    icon: Plane,
    module: "operations",
    items: [
      { title: "Operaciones", url: "/operations" },
      { title: "Estadísticas", url: "/operations/statistics" },
      { title: "Facturación", url: "/operations/billing" },
      { title: "Configuración", url: "/operations/settings" },
    ],
  },
  // 5. Finanzas
  {
    title: "Finanzas",
    url: "/cash/summary",
    icon: DollarSign,
    module: "cash",
    items: [
      { title: "Caja y Bancos", url: "/cash/summary" },
      { title: "Aprobaciones", url: "/payments/pending-approvals" },
      { title: "Gastos", url: "/expenses" },
      { title: "Contabilidad", url: "/accounting/ledger" },
      { title: "Impuestos", url: "/accounting/iva" },
      { title: "Comisiones", url: "/commissions", module: "commissions" as const },
      { title: "Reportes", url: "/reports", module: "reports" as const },
      { title: "Configuración", url: "/finances/settings" },
    ],
  },
  // 6. Herramientas (Cerebro se removio de aqui — ahora es item top-level al final)
  {
    title: "Herramientas",
    url: "/tools/tasks",
    icon: Bot,
    items: [
      { title: "Calendario", url: "/calendar" },
      { title: "Alertas", url: "/alerts", module: "alerts" as const },
      { title: "Mensajes", url: "/messages" },
      { title: "Templates", url: "/resources/templates" },
      { title: "Tareas", url: "/tools/tasks" },
      { title: "WHA Control", url: "/tools/wha-control" },
      // Pendientes 3.2: el v2 import vivía sólo via URL directa. Lo colgamos
      // de Herramientas (admin task) en vez de Configuración para evitar
      // duplicación con el tab "Importación" del legacy en /settings.
      { title: "Importar CSV", url: "/settings/import-v2" },
    ],
  },
  // 7. Cerebro
  {
    title: "🧠 Cerebro",
    url: "/tools/cerebro",
    icon: Bot,
    collapsible: false,
  },
]

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  userRole: UserRole
  user: {
    name: string
    email: string
    avatar?: string
  }
}

export function AppSidebar({ userRole, user, ...props }: AppSidebarProps) {
  const pathname = usePathname()
  const [brandLogo, setBrandLogo] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string | null>(null)

  useEffect(() => {
    // Load brand settings from localStorage first (instant, no flash)
    const cachedLogo = localStorage.getItem("brand_logo")
    if (cachedLogo) setBrandLogo(cachedLogo)
    const cachedName = localStorage.getItem("company_name")
    if (cachedName) setCompanyName(cachedName)

    // Then fetch from API for shared org settings
    async function loadOrgSettings() {
      try {
        const res = await fetch("/api/settings/organization")
        if (res.ok) {
          const data = await res.json()
          if (data.brand_logo) {
            setBrandLogo(data.brand_logo)
            localStorage.setItem("brand_logo", data.brand_logo)
          }
          if (data.company_name) {
            setCompanyName(data.company_name)
            localStorage.setItem("company_name", data.company_name)
          }
        }
      } catch {
        // silent — use cached
      }
    }
    loadOrgSettings()
  }, [])

  // Filtrar navegación según permisos
  const navigation = allNavigation
    .map((item) => {
      // Filtrar items principales por módulo
      // Si tiene subitems con módulos propios, no filtrar aquí — se filtra abajo por subitem
      if (item.module && !item.items?.some((sub) => sub.module)) {
        if (!shouldShowInSidebar(userRole, item.module)) {
          return null
        }
      }
      // Ocultar Cerebro para SELLER
      if (item.url === "/tools/cerebro" && userRole === "SELLER") {
        return null
      }

      // Filtrar subitems según permisos
      if (item.items) {
        const filteredItems = item.items
          .map((subItem) => {
            // Si el subitem tiene módulo propio, verificar ese módulo
            // Si no, heredar el módulo del padre
            const moduleToCheck = subItem.module || item.module
            if (moduleToCheck) {
              if (!shouldShowInSidebar(userRole, moduleToCheck)) {
                return null
              }
            }

            // Ocultar Cerebro para SELLER

            // Ocultar WHA Control para todos excepto SUPER_ADMIN y ADMIN
            if (subItem.url === "/tools/wha-control" && !["SUPER_ADMIN", "ADMIN"].includes(userRole)) {
              return null
            }
            // Ocultar Importar CSV para todos excepto SUPER_ADMIN y ADMIN
            // (puede borrar/sobrescribir data masivamente)
            if (subItem.url === "/settings/import-v2" && !["SUPER_ADMIN", "ADMIN"].includes(userRole)) {
              return null
            }
            if (userRole === "SELLER" && subItem.url === "/tools/cerebro") {
              return null
            }

            // Si el subitem tiene items (nivel 3), mantenerlos todos
            if (subItem.items) {
              return subItem
            }

            return subItem
          })
          .filter((subItem): subItem is NavSubItem => subItem !== null)

        // Si no quedan items, no mostrar el item principal
        if (filteredItems.length === 0) {
          return null
        }

        return { ...item, items: filteredItems }
      }

      // Items sin módulo (como Dashboard) siempre visibles
      return item
    })
    .filter((item): item is NavItem => item !== null)

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-2 !h-auto"
            >
              <a href="/dashboard" className="flex items-center justify-center w-full">
                {brandLogo ? (
                  <img src={brandLogo} alt="Logo" className="h-14 w-full max-w-[180px] object-contain" />
                ) : (
                  <>
                    <GalleryVerticalEnd className="!size-5" />
                    <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">{companyName || "Mi Agencia"}</span>
                  </>
                )}
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navigation} pathname={pathname} />
      </SidebarContent>
      <SidebarFooter>
        <ThemeToggleSidebar />
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
