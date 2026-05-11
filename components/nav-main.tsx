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

/**
 * Badge opcional al lado del título del subitem. Pensado para alertas
 * proactivas tipo "AFIP roto" — un dot pequeño + tooltip con el motivo.
 *
 * Pendientes 2026-05-07: por ahora solo lo usa "Facturación" cuando el
 * AFIP de la org tuvo failures recientes. Si crece a más casos, mover
 * a un componente dedicado.
 */
interface SidebarBadge {
  variant: 'warning' | 'error' | 'info'
  tooltip: string
}

interface NavSubSubItem {
  title: string
  url: string
}

interface NavSubItem {
  title: string
  url: string
  items?: NavSubSubItem[]
  badge?: SidebarBadge
}

interface NavItem {
  title: string
  url: string
  icon?: React.ComponentType<{ className?: string }>
  items?: NavSubItem[]
  collapsible?: boolean
  badge?: SidebarBadge
}

interface NavMainProps {
  items: NavItem[]
  pathname: string
}

// [perf-instrumentation] Loguea el momento exacto del click en sidebar para
// correlacionar con logs server-side. Quitar cuando termine la investigación.
const PERF_LOG_ENABLED = process.env.NEXT_PUBLIC_PERF_LOG !== "0"
const logSidebarClick = (url: string) => {
  if (!PERF_LOG_ENABLED) return
  // eslint-disable-next-line no-console
  console.log(`[perf:client] CLICK → ${url} at ${performance.now().toFixed(0)}ms`)
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
                    <Link href={item.url} onClick={() => logSidebarClick(item.url)}>
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
                                          <SidebarMenuSubButton asChild isActive={subSubIsActive} className="pl-1">
                                            <Link href={subSubItem.url} onClick={() => logSidebarClick(subSubItem.url)}>
                                              {subSubItem.title}
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

                        // Si el subitem NO tiene hijos, renderizar como link directo.
                        // Si tiene badge, lo agregamos al lado del título (dot
                        // pequeño coloreado por variant + title attr para tooltip).
                        return (
                          <SidebarMenuSubItem key={subItem.url}>
                            <SidebarMenuSubButton asChild isActive={subIsActive}>
                              <Link href={subItem.url} onClick={() => logSidebarClick(subItem.url)}>
                                <span className="flex-1">{subItem.title}</span>
                                {subItem.badge && (
                                  <span
                                    title={subItem.badge.tooltip}
                                    aria-label={subItem.badge.tooltip}
                                    className={
                                      "ml-auto h-1.5 w-1.5 rounded-full shrink-0 " +
                                      (subItem.badge.variant === 'error'
                                        ? 'bg-destructive'
                                        : subItem.badge.variant === 'warning'
                                          ? 'bg-accent-coral'
                                          : 'bg-primary')
                                    }
                                  />
                                )}
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
