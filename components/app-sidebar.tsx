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
  Heart,
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

interface NavItem {
  title: string
  url: string
  icon?: React.ComponentType<{ className?: string }>
  items?: {
    title: string
    url: string
  }[]
  module?: "dashboard" | "leads" | "operations" | "customers" | "operators" | "cash" | "accounting" | "alerts" | "reports" | "settings" | "commissions"
}

const allNavigation: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, module: "dashboard" },
  { title: "Leads", url: "/sales/leads", icon: ShoppingCart, module: "leads" },
  { title: "Operaciones", url: "/operations", icon: Plane, module: "operations" },
  { title: "Clientes", url: "/customers", icon: Users, module: "customers" },
  { title: "Operadores", url: "/operators", icon: Building2, module: "operators" },
  {
    title: "Caja",
    url: "/cash",
    icon: DollarSign,
    module: "cash",
      items: [
      { title: "Dashboard de Caja", url: "/cash" },
      { title: "Movimientos", url: "/cash/movements" },
      { title: "Pagos", url: "/cash/payments" },
      ],
    },
    {
    title: "Contabilidad",
    url: "/accounting/ledger",
    icon: Calculator,
    module: "accounting",
      items: [
      { title: "Libro Mayor", url: "/accounting/ledger" },
      { title: "IVA", url: "/accounting/iva" },
      { title: "Cuentas Financieras", url: "/accounting/financial-accounts" },
      { title: "Pagos a Operadores", url: "/accounting/operator-payments" },
      { title: "Pagos Recurrentes", url: "/accounting/recurring-payments" },
      { title: "Cuentas de Socios", url: "/accounting/partner-accounts" },
    ],
  },
  { title: "Mensajes", url: "/messages", icon: MessageSquare },
  { title: "Alertas", url: "/alerts", icon: AlertCircle, module: "alerts" },
  { title: "Calendario", url: "/calendar", icon: CalendarIcon, module: "alerts" },
  { title: "Reportes", url: "/reports", icon: FileText, module: "reports" },
  { title: "Mi Balance", url: "/my/balance", icon: DollarSign },
  { title: "Mis Comisiones", url: "/my/commissions", icon: DollarSign },
  { title: "Emilia", url: "/emilia", icon: Heart },
  { title: "Configuración", url: "/settings", icon: Settings, module: "settings" },
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
  const navigation = allNavigation.filter((item) => {
    if (item.module) {
      return shouldShowInSidebar(userRole, item.module)
    }
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
