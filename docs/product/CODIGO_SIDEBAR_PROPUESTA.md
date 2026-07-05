# 💻 Código del Sidebar Propuesto

## 📋 Estructura de Datos

### Interface Actualizada

```typescript
interface NavItem {
  title: string
  url: string
  icon?: React.ComponentType<{ className?: string }>
  items?: NavSubItem[]  // Submenús nivel 2
  module?: string
  collapsible?: boolean  // Por defecto true, excepto Dashboard
}

interface NavSubItem {
  title: string
  url: string
  items?: NavSubSubItem[]  // Submenús nivel 3 (solo para Finanzas)
}

interface NavSubSubItem {
  title: string
  url: string
}
```

## 🗂️ Estructura Completa de Navegación

```typescript
const allNavigation: NavItem[] = [
  // Dashboard - NO colapsable
  { 
    title: "Dashboard", 
    url: "/dashboard", 
    icon: LayoutDashboard, 
    module: "dashboard",
    collapsible: false  // Único que NO es colapsable
  },
  
  // Clientes - Colapsable
  {
    title: "Clientes",
    url: "/customers",
    icon: Users,
    module: "customers",
    items: [
      { title: "Clientes", url: "/customers" },
      { title: "Estadísticas", url: "/customers/statistics" },
      { title: "Configuración", url: "/customers/settings" },
    ],
  },
  
  // Operaciones - Colapsable
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
  
  // Ventas - Colapsable
  {
    title: "Ventas",
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
          { title: "Pagos a Operadores", url: "/accounting/operator-payments" },
          { title: "Pagos Recurrentes", url: "/accounting/recurring-payments" },
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
    url: "/resources/notes",
    icon: BookOpen,
    items: [
      { title: "Notas", url: "/resources/notes" },
      { title: "Calendario", url: "/calendar" },
      { title: "Templates", url: "/resources/templates" },
    ],
  },
  
  // Documentos - Colapsable
  {
    title: "Documentos",
    url: "/reports",
    icon: FileText,
    items: [
      { title: "Reportes", url: "/reports" },
      { title: "Mensajes", url: "/messages" },
      { title: "Alertas", url: "/alerts" },
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
      { title: "Operadores", url: "/operators" },
      { title: "Usuarios", url: "/settings/users" },
      { title: "Equipos", url: "/settings/teams" },
      { title: "Integraciones", url: "/settings/integrations" },
    ],
  },
  
  // Herramientas - Colapsable
  {
    title: "Herramientas",
    url: "/emilia",
    icon: Bot,
    items: [
      { title: "Emilia", url: "/emilia", description: "AI Copilot" },
      { title: "Configuración", url: "/tools/settings" },
    ],
  },
]
```

## 🔧 Componente NavMain Actualizado

```typescript
"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

interface NavSubSubItem {
  title: string
  url: string
}

interface NavSubItem {
  title: string
  url: string
  items?: NavSubSubItem[]  // Nivel 3
}

interface NavItem {
  title: string
  url: string
  icon?: React.ComponentType<{ className?: string }>
  items?: NavSubItem[]
  collapsible?: boolean
}

interface NavMainProps {
  items: NavItem[]
  pathname: string
}

export function NavMain({ items, pathname }: NavMainProps) {
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-1">
        <SidebarMenu>
          {items.map((item) => {
            const hasChildren = item.items && item.items.length > 0
            const isCollapsible = item.collapsible !== false && hasChildren
            const isActive = pathname === item.url || pathname?.startsWith(item.url + "/")

            // Si NO es colapsable (como Dashboard), renderizar como link directo
            if (!isCollapsible) {
              return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton tooltip={item.title} asChild isActive={isActive}>
                    <Link href={item.url}>
                      {item.icon && <item.icon />}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            }

            // Si es colapsable, renderizar con Collapsible
            return (
              <Collapsible
                key={item.url}
                asChild
                defaultOpen={isActive}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip={item.title}>
                      {item.icon && <item.icon />}
                      <span>{item.title}</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items?.map((subItem) => {
                        const subHasChildren = subItem.items && subItem.items.length > 0
                        const subIsActive = pathname === subItem.url || pathname?.startsWith(subItem.url + "/")

                        // Si el subitem tiene hijos (nivel 3), renderizar como collapsible
                        if (subHasChildren) {
                          return (
                            <Collapsible
                              key={subItem.url}
                              asChild
                              defaultOpen={subIsActive}
                              className="group/subcollapsible"
                            >
                              <SidebarMenuSubItem>
                                <CollapsibleTrigger asChild>
                                  <SidebarMenuSubButton>
                                    <span>{subItem.title}</span>
                                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/subcollapsible:rotate-90" />
                                  </SidebarMenuSubButton>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <SidebarMenuSub>
                                    {subItem.items?.map((subSubItem) => {
                                      const subSubIsActive = pathname === subSubItem.url || pathname?.startsWith(subSubItem.url + "/")
                                      return (
                                        <SidebarMenuSubItem key={subSubItem.url}>
                                          <SidebarMenuSubButton asChild isActive={subSubIsActive}>
                                            <Link href={subSubItem.url}>
                                              <span className="pl-4">{subSubItem.title}</span>
                                            </Link>
                                          </SidebarMenuSubButton>
                                        </SidebarMenuSubItem>
                                      )
                                    })}
                                  </SidebarMenuSub>
                                </CollapsibleContent>
                              </SidebarMenuSubItem>
                            </Collapsible>
                          )
                        }

                        // Si el subitem NO tiene hijos, renderizar como link directo
                        return (
                          <SidebarMenuSubItem key={subItem.url}>
                            <SidebarMenuSubButton asChild isActive={subIsActive}>
                              <Link href={subItem.url}>
                                <span>{subItem.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
```

## 🎨 Estilos CSS Adicionales

```css
/* Indentación para nivel 3 */
[data-level="3"] {
  padding-left: 2rem;
}

/* Espaciado entre grupos */
.sidebar-group + .sidebar-group {
  margin-top: 0.5rem;
}

/* Transición suave para chevron */
.chevron-transition {
  transition: transform 200ms ease-in-out;
}

/* Estado activo mejorado */
[data-active="true"] {
  background-color: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}
```

## 📊 Resumen de Cambios

### Estructura:
- ✅ De 16 items a 8 items principales
- ✅ Dashboard NO colapsable
- ✅ Resto de items colapsables
- ✅ Soporte para 3 niveles de anidación (solo en Finanzas)

### Comportamiento:
- ✅ Auto-expansión cuando la ruta está activa
- ✅ Chevron indica estado (▶ colapsado, ▼ expandido)
- ✅ Transiciones suaves
- ✅ Indentación visual clara

### Iconos:
- ✅ Dashboard: `LayoutDashboard`
- ✅ Clientes: `Users`
- ✅ Operaciones: `Plane`
- ✅ Ventas: `ShoppingCart`
- ✅ Finanzas: `DollarSign`
- ✅ Recursos: `BookOpen`
- ✅ Documentos: `FileText`
- ✅ Agencia: `Building2`
- ✅ Herramientas: `Bot`

