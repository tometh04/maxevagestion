import { redirect } from "next/navigation"
import Link from "next/link"
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
    <div className="min-h-screen">
      <header className="border-b bg-background">
        <div className="flex items-center gap-6 px-6 py-3">
          <div className="font-semibold text-sm">MAXEVA Platform</div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin/orgs" className="hover:underline">Organizaciones</Link>
            <Link href="/admin/metrics" className="hover:underline">Métricas</Link>
            <Link href="/admin/audit" className="hover:underline">Audit log</Link>
          </nav>
          <div className="ml-auto text-xs text-muted-foreground">
            Platform Admin · {user.email}
          </div>
        </div>
      </header>
      <main className="px-6 py-6">{children}</main>
    </div>
  )
}
