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
  Wrench,
  HelpCircle,
  Bot,
} from "lucide-react"
import Link from "next/link"
import { shouldShowInSidebar, type UserRole } from "@/lib/permissions"
import { checkResolvedPermission, type ResolvedPermissionsMatrix } from "@/lib/permissions-agency"
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
  module?: "dashboard" | "leads" | "operations" | "customers" | "operators" | "cash" | "accounting" | "alerts" | "reports" | "settings" | "commissions" | "eve"
  badge?: {
    variant: 'warning' | 'error' | 'info'
    tooltip: string
  }
}

interface NavItem {
  title: string
  url: string
  icon?: React.ComponentType<{ className?: string }>
  items?: NavSubItem[]
  module?: "dashboard" | "leads" | "operations" | "customers" | "operators" | "cash" | "accounting" | "alerts" | "reports" | "settings" | "commissions" | "eve"
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
      { title: "CRM Ventas", url: "/sales/crm-manychat" },
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
    icon: Wrench,
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
  // 7. Agente IA (Eve)
  {
    title: "Agente IA",
    url: "/eve",
    icon: Bot,
    module: "eve",
    items: [
      { title: "Estado", url: "/eve" },
      { title: "Canales", url: "/eve/channels" },
      { title: "Prompt", url: "/eve/prompt" },
    ],
  },
  // 8. Cerebro
  {
    title: "🧠 Cerebro",
    url: "/tools/cerebro",
    collapsible: false,
  },
]

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  userRole: UserRole
  resolvedPermissions?: ResolvedPermissionsMatrix | null
  user: {
    name: string
    email: string
    avatar?: string
  }
}

export function AppSidebar({ userRole, resolvedPermissions, user, ...props }: AppSidebarProps) {
  const pathname = usePathname()
  const [brandLogo, setBrandLogo] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string | null>(null)
  // Salud AFIP — usado para mostrar badge en "Facturación" si la org
  // tuvo failures recientes de AFIP (cert vencido, PV desautorizado,
  // etc.). Fetched on-mount; cache HTTP 60s del lado server.
  const [afipHealth, setAfipHealth] = useState<{
    status: 'ok' | 'warning' | 'error' | 'not-configured'
    recentFailures: number
    lastErrorCode: number | null
  } | null>(null)

  useEffect(() => {
    // Multi-tenant: cache scoped por org_id. NUNCA mostramos cache "global"
    // porque al cambiar de tenant (mismo browser, mismo user con membresías
    // a varios orgs, o user logout+login con otro user) el localStorage
    // del tenant anterior persiste y filtra branding cross-tenant. Bug
    // detectado 2026-05-06: usuarios viendo logo de Lozada en Test V7.
    //
    // Patrón:
    //   1) Render inicial sin logo (acepta un flash sub-100ms).
    //   2) Fetch /api/settings/organization (devuelve {data: [{key, value, org_id}]}).
    //      Notar que el código previo leía `data.brand_logo` directamente
    //      pero la API SIEMPRE retorna {data: [...]} — nunca matcheaba,
    //      el state vivía 100% del cache localStorage stale.
    //   3) Construir mapa per-key, identificar el org_id de la respuesta.
    //   4) Si hay cache scoped a ese org_id Y matchea los valores, usar.
    //      Si no, escribir cache nuevo. Cuando cambia el tenant, el
    //      localStorage del anterior queda como key separada y no leak.
    let cancelled = false
    async function loadOrgSettings() {
      try {
        const res = await fetch("/api/settings/organization")
        if (!res.ok || cancelled) return
        const json = await res.json()
        const rows = Array.isArray(json?.data) ? json.data : []
        const orgId = rows[0]?.org_id ?? null
        const map = new Map<string, string>(
          rows.map((r: { key: string; value: string }) => [r.key, r.value])
        )

        const logo = map.get("brand_logo") ?? null
        const name = map.get("company_name") ?? null

        if (cancelled) return
        // SIEMPRE seteamos (incluso a null) — si el tenant nuevo no tiene
        // brand_logo, hay que limpiar lo que había en el render previo.
        setBrandLogo(logo)
        setCompanyName(name)

        if (orgId) {
          // Cache scoped por org_id. removeItem si el valor es null para
          // no acumular keys vacías.
          if (logo) localStorage.setItem(`brand_logo:${orgId}`, logo)
          else localStorage.removeItem(`brand_logo:${orgId}`)
          if (name) localStorage.setItem(`company_name:${orgId}`, name)
          else localStorage.removeItem(`company_name:${orgId}`)
        }

        // Limpieza one-shot del cache global legacy (pre-fix). Garantiza
        // que cualquier user que cargue esta versión ya no arrastre el
        // logo de un tenant anterior por la próxima sesión.
        localStorage.removeItem("brand_logo")
        localStorage.removeItem("company_name")
      } catch {
        // silent — sin cache es preferible a cache stale cross-tenant
      }
    }
    loadOrgSettings()

    // Fetch AFIP health en paralelo (sin esperar al brand). Endpoint con
    // cache 60s + SWR 5min — bajo costo en navegación normal.
    async function loadAfipHealth() {
      try {
        const res = await fetch("/api/afip/health")
        if (!res.ok || cancelled) return
        const json = await res.json()
        if (cancelled) return
        setAfipHealth({
          status: json?.status ?? 'not-configured',
          recentFailures: Number(json?.recentFailures) || 0,
          lastErrorCode: json?.lastErrorCode ?? null,
        })
      } catch {
        // silent — sin badge es preferible a un badge falso positivo
      }
    }
    loadAfipHealth()

    return () => {
      cancelled = true
    }
  }, [])

  // Verifica si un módulo debe mostrarse en el sidebar.
  // Con permisos dinámicos: usa la matrix resuelta (checkResolvedPermission).
  // Sin matrix (fallback): usa la lógica estática original.
  function canShowModule(module: string): boolean {
    if (resolvedPermissions) {
      return checkResolvedPermission(resolvedPermissions, module, "read")
    }
    return shouldShowInSidebar(userRole, module as any)
  }

  // Filtrar navegación según permisos
  const navigation = allNavigation
    .map((item) => {
      // Filtrar items principales por módulo
      // Si tiene subitems con módulos propios, no filtrar aquí — se filtra abajo por subitem
      if (item.module && !item.items?.some((sub) => sub.module)) {
        if (!canShowModule(item.module)) {
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
              if (!canShowModule(moduleToCheck)) {
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

            // Badge AFIP roto sobre "Facturación" — único surface por
            // ahora. Si afipHealth es 'warning' o 'error', mostramos un
            // dot coloreado + tooltip. 'ok' y 'not-configured' silent.
            if (
              subItem.url === "/operations/billing" &&
              afipHealth &&
              (afipHealth.status === "warning" || afipHealth.status === "error")
            ) {
              const codeSuffix = afipHealth.lastErrorCode
                ? ` (último: AFIP #${afipHealth.lastErrorCode})`
                : ""
              return {
                ...subItem,
                badge: {
                  variant: afipHealth.status === "error" ? ("error" as const) : ("warning" as const),
                  tooltip: `AFIP rechazó ${afipHealth.recentFailures} factura${afipHealth.recentFailures === 1 ? "" : "s"} en las últimas 24h${codeSuffix}. Revisá Configuración → Integraciones.`,
                },
              }
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Ayuda" asChild isActive={pathname === "/ayuda" || pathname?.startsWith("/ayuda/")}>
              <Link href="/ayuda">
                <HelpCircle className="h-4 w-4" />
                <span>Ayuda</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
