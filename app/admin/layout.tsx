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

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <aside className="w-64 shrink-0 border-r border-slate-800/60 bg-slate-950/80 backdrop-blur flex flex-col">
        <div className="px-5 py-6 border-b border-slate-800/60">
          <Link href="/admin/orgs" className="flex items-center gap-2">
            <Image
              src="/vibook-logo-white.png"
              alt="Vibook"
              width={120}
              height={36}
              priority
              className="h-8 w-auto object-contain"
            />
          </Link>
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-blue-400/80">
            Platform Admin
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <SidebarLink href="/admin/orgs" icon={Building2} label="Organizaciones" />
          <SidebarLink href="/admin/metrics" icon={BarChart3} label="Métricas" />
          <SidebarLink href="/admin/billing" icon={CircleDollarSign} label="Billing" />
          <SidebarLink href="/admin/audit" icon={ScrollText} label="Audit log" />
        </nav>

        <div className="px-3 py-4 border-t border-slate-800/60 space-y-1">
          <Link
            href="/logout"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-slate-800/40 hover:text-slate-100 transition"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Link>
        </div>

        <div className="px-5 py-4 border-t border-slate-800/60">
          <div className="text-xs text-slate-500">Conectado como</div>
          <div className="text-sm font-medium text-slate-200 truncate">{user.email}</div>
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto">
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
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/60 hover:text-white transition"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  )
}
