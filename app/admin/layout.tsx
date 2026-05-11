import { redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Building2, BarChart3, ScrollText, LogOut, CircleDollarSign } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"

export const dynamic = "force-dynamic"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const isAdmin = await isPlatformAdmin(supabase, user.id)
  if (!isAdmin) redirect("/dashboard")

  // Modo claro Vibook 2026-05-06: el admin estaba en "fake dark mode" —
  // usaba bg-foreground (token de TEXTO) como fondo, lo cual rompía la
  // jerarquía visual y dejaba todo monocromo gris. Ahora usamos los
  // tokens semánticos de shadcn (background, card, border, primary)
  // que ya son los correctos en light mode por defecto del CSS.
  //
  // Iteración 2: si el user tiene el dashboard en dark theme (next-themes
  // aplica .dark al <html>), las CSS vars se sobrescriben a dark y el
  // admin heredaba ese tema. Ahora usamos `.light-force` (definida en
  // globals.css) que re-impone las light vars con specificity igual a
  // .dark pero declarada después → siempre gana. Resultado: admin SIEMPRE
  // se ve light, sin importar el theme del user en /dashboard.
  return (
    <div className="light-force flex min-h-screen bg-background text-foreground">
      <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="px-5 py-6 border-b border-border">
          <Link href="/admin/orgs" className="flex items-center gap-2">
            <Image
              src="/vibook-logo.png"
              alt="Vibook"
              width={120}
              height={36}
              priority
              className="h-8 w-auto object-contain"
            />
          </Link>
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-primary">
            Platform Admin
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <SidebarLink href="/admin/orgs" icon={Building2} label="Organizaciones" />
          <SidebarLink href="/admin/metrics" icon={BarChart3} label="Métricas" />
          <SidebarLink href="/admin/billing" icon={CircleDollarSign} label="Billing" />
          <SidebarLink href="/admin/audit" icon={ScrollText} label="Audit log" />
        </nav>

        <div className="px-3 py-4 border-t border-border space-y-1">
          <Link
            href="/logout"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Link>
        </div>

        <div className="px-5 py-4 border-t border-border bg-background-alt/40">
          <div className="text-xs text-muted-foreground">Conectado como</div>
          <div className="text-sm font-medium text-foreground truncate">{user.email}</div>
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto bg-background-alt/30">
        <div className="px-8 py-8 max-w-[1400px]">{children}</div>
      </main>
    </div>
  )
}

function SidebarLink({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground transition"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  )
}
