"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Building2,
  DollarSign,
  FileText,
  Settings,
  AlertCircle,
  Plane,
  Calculator,
  GalleryVerticalEnd,
  Calendar as CalendarIcon,
  MessageSquare,
  Bot,
  MessageCircle,
  Wallet,
  Coins,
  BookOpen,
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
  // Dashboard - NO colapsable
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    module: "dashboard",
    collapsible: false,
  },
  // Operaciones - Colapsable (moved to second position)
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
  // Base de Datos Clientes - Colapsable (renamed from "Clientes")
  {
    title: "Base de Datos Clientes",
    url: "/customers",
    icon: Users,
    module: "customers",
    items: [
      { title: "Clientes", url: "/customers" },
      { title: "Estadísticas", url: "/customers/statistics" },
    ],
  },
  // CRM Ventas - Colapsable (renamed from "Ventas")
  {
    title: "CRM Ventas",
    url: "/sales/leads",
    icon: ShoppingCart,
    module: "leads",
    items: [
      { title: "Leads", url: "/sales/leads" },
      { title: "CRM Manychat", url: "/sales/crm-manychat" },
      { title: "Estadísticas", url: "/sales/statistics" },
    ],
  },
  // Finanzas - Colapsable (con submenús anidados)
  {
    title: "Finanzas",
    url: "/cash/summary",
    icon: DollarSign,
    module: "cash",
    items: [
      // Caja - Submenú con nivel 3
      {
        title: "Caja",
        url: "/cash/summary",
        items: [
          { title: "Resumen", url: "/cash/summary" },
          { title: "Ingresos", url: "/cash/income" },
          { title: "Egresos", url: "/cash/expenses" },
        ],
      },
      // Contabilidad - Submenú con nivel 3
      {
        title: "Contabilidad",
        url: "/accounting/ledger",
        items: [
          { title: "Libro Mayor", url: "/accounting/ledger" },
          { title: "IVA", url: "/accounting/iva" },
          { title: "Cuentas Financieras", url: "/accounting/financial-accounts" },
          { title: "Posición Mensual", url: "/accounting/monthly-position" },
          { title: "Deudores por Ventas", url: "/accounting/debts-sales" },
          { title: "Pagos a Operadores", url: "/accounting/operator-payments" },
          { title: "Gastos Recurrentes", url: "/accounting/recurring-payments" },
          { title: "Cuentas de Socios", url: "/accounting/partner-accounts" },
        ],
      },
      // Items directos sin submenú
      { title: "Mi Balance", url: "/my/balance" },
      { title: "Mis Comisiones", url: "/my/commissions" },
      { title: "Configuración", url: "/finances/settings" },
    ],
  },
  // Recursos - Colapsable
  {
    title: "Recursos",
    url: "/reports",
    icon: BookOpen,
    items: [
      { title: "Reportes", url: "/reports", module: "reports" as const },
      { title: "Alertas", url: "/alerts", module: "alerts" as const },
      { title: "Calendario", url: "/calendar" },
      { title: "Mensajes", url: "/messages" },
      { title: "Templates", url: "/resources/templates" },
    ],
  },
  // Agencia - Colapsable
  {
    title: "Agencia",
    url: "/settings",
    icon: Building2,
    module: "settings",
    items: [
      { title: "Configuración", url: "/settings" },
      { title: "Operadores", url: "/operators", module: "operators" as const },
      { title: "Usuarios", url: "/settings/users" },
      { title: "Equipos", url: "/settings/teams" },
      { title: "Integraciones", url: "/settings/integrations" },
    ],
  },
  // Herramientas - Colapsable
  {
    title: "Herramientas",
    url: "/tools/cerebro",
    icon: Bot,
    items: [
      { title: "Cerebro", url: "/tools/cerebro" },
      { title: "Emilia", url: "/emilia" },
      { title: "Configuración", url: "/tools/settings" },
    ],
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

  // Filtrar navegación según permisos
  const navigation = allNavigation
    .map((item) => {
      // Filtrar items principales
      if (item.module) {
        if (!shouldShowInSidebar(userRole, item.module)) {
          return null
        }
      }

      // Filtrar subitems según permisos
      if (item.items) {
        const filteredItems = item.items
          .map((subItem) => {
            // Si el subitem tiene un módulo, verificar permisos
            if (subItem.module) {
              if (!shouldShowInSidebar(userRole, subItem.module)) {
                return null
              }
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
    .filter((item): item is NavItem => {
      if (!item) return false
      // Items sin módulo (como "Mi Balance") solo para vendedores
      if (item.url === "/my/balance" || item.url === "/my/commissions") {
        return userRole === "SELLER"
      }
      return true
    })

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <a href="/dashboard">
                <GalleryVerticalEnd className="!size-5" />
                <span className="text-base font-semibold">MAXEVA GESTION</span>
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
