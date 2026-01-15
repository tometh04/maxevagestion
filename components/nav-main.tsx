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

interface NavSubSubItem {
  title: string
  url: string
}

interface NavSubItem {
  title: string
  url: string
  items?: NavSubSubItem[]
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
                                          <SidebarMenuSubButton asChild isActive={subSubIsActive} className="pl-4">
                                            <Link href={subSubItem.url}>
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
