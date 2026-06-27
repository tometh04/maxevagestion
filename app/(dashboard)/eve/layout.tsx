"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Bot } from "lucide-react"
import { cn } from "@/lib/utils"

const TABS = [
  { label: "Estado", href: "/eve" },
  { label: "Canales", href: "/eve/channels" },
  { label: "Prompt", href: "/eve/prompt" },
]

function EveTabNav() {
  const pathname = usePathname()

  return (
    <div className="flex gap-1 border-b">
      {TABS.map(({ label, href }) => {
        const isActive = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}

export default function EveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Agente IA</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Agente IA</h1>
          <p className="text-sm text-muted-foreground">
            Conectá y configurá el agente conversacional Eve
          </p>
        </div>
      </div>

      <EveTabNav />

      {children}
    </div>
  )
}
