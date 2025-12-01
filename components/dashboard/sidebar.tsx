"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  ChevronRight,
  BookOpen,
  Receipt,
  Wallet,
  TrendingUp,
  MessageSquare,
} from "lucide-react"
import { useState } from "react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { shouldShowInSidebar, type UserRole } from "@/lib/permissions"

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  children?: NavItem[]
  module?: "dashboard" | "leads" | "operations" | "customers" | "operators" | "cash" | "accounting" | "alerts" | "reports" | "settings" | "commissions"
}

const allNavigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, module: "dashboard" },
  { name: "Leads", href: "/sales/leads", icon: ShoppingCart, module: "leads" },
  {
    name: "Operaciones",
    href: "/operations",
    icon: Plane,
    module: "operations",
    children: [
      { name: "Lista de Operaciones", href: "/operations", icon: Plane },
    ],
  },
  { name: "Clientes", href: "/customers", icon: Users, module: "customers" },
  { name: "Operadores", href: "/operators", icon: Building2, module: "operators" },
  {
    name: "Caja",
    href: "/cash",
    icon: DollarSign,
    module: "cash",
    children: [
      { name: "Dashboard de Caja", href: "/cash", icon: DollarSign },
      { name: "Movimientos", href: "/cash/movements", icon: TrendingUp },
      { name: "Pagos", href: "/cash/payments", icon: Wallet },
    ],
  },
  {
    name: "Contabilidad",
    href: "/accounting/ledger",
    icon: Calculator,
    module: "accounting",
    children: [
      { name: "Libro Mayor", href: "/accounting/ledger", icon: BookOpen },
      { name: "IVA", href: "/accounting/iva", icon: Receipt },
      { name: "Cuentas Financieras", href: "/accounting/financial-accounts", icon: Wallet },
      { name: "Pagos a Operadores", href: "/accounting/operator-payments", icon: Building2 },
    ],
  },
  { name: "Mensajes", href: "/messages", icon: MessageSquare },
  { name: "Alertas", href: "/alerts", icon: AlertCircle, module: "alerts" },
  { name: "Reportes", href: "/reports", icon: FileText, module: "reports" },
  { name: "Mi Balance", href: "/my/balance", icon: DollarSign }, // Solo para vendedores
  { name: "Mis Comisiones", href: "/my/commissions", icon: DollarSign }, // Solo para vendedores
  { name: "Configuración", href: "/settings", icon: Settings, module: "settings" },
]

function NavItemComponent({ item, pathname, userRole }: { item: NavItem; pathname: string; userRole: UserRole }) {
  const hasChildren = item.children && item.children.length > 0
  const isActive = pathname === item.href || pathname?.startsWith(item.href + "/")
  const [isOpen, setIsOpen] = useState(isActive)

  // Verificar si el usuario puede ver este módulo
  if (item.module && !shouldShowInSidebar(userRole, item.module)) {
    return null
  }

  // "Mi Balance" y "Mis Comisiones" solo para vendedores
  if (item.href === "/my/balance" || item.href === "/my/commissions") {
    if (userRole !== "SELLER") {
      return null
    }
  }

  if (!hasChildren) {
    return (
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        <item.icon className="h-5 w-5" />
        {item.name}
      </Link>
    )
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        <div className="flex items-center gap-3">
          <item.icon className="h-5 w-5" />
          {item.name}
        </div>
        <ChevronRight
          className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-4 pt-1">
        <div className="space-y-1">
          {item.children?.map((child) => {
            const childIsActive = pathname === child.href || pathname?.startsWith(child.href + "/")
            return (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  childIsActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <child.icon className="h-4 w-4" />
                {child.name}
              </Link>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

interface SidebarProps {
  userRole: UserRole
}

export function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname()

  // Filtrar navegación según permisos
  const navigation = allNavigation.filter((item) => {
    if (item.module) {
      return shouldShowInSidebar(userRole, item.module)
    }
    // Items sin módulo (como "Mi Balance") se manejan en NavItemComponent
    return true
  })

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      {/* Header */}
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-xl font-bold">MAXEVA GESTION</h1>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1">
        <nav className="space-y-1 p-4">
          {navigation.map((item) => (
            <NavItemComponent key={item.href} item={item} pathname={pathname} userRole={userRole} />
          ))}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t p-4">
        <p className="text-xs text-muted-foreground">v1.0.0</p>
      </div>
    </div>
  )
}
