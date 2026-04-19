import { getCurrentUser, getUserAgencies } from "@/lib/auth"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { TaskShortcutProvider } from "@/components/tasks/task-shortcut-provider"
import { PushNotificationManager } from "@/components/notifications/push-notification-manager"
import { TrialBanner } from "@/components/trial-banner"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { BrandProvider } from "@/components/brand-provider"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = await getCurrentUser()
  const userAgencies = await getUserAgencies(user.id)

  const agencies = (userAgencies || []).map((ua: any) => ({
    id: ua.agency_id,
    name: ua.agencies?.name || "Sin nombre",
  }))

  return (
    <BrandProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "14rem",
            "--header-height": "3.5rem",
          } as React.CSSProperties
        }
      >
        <AppSidebar
          variant="sidebar"
          collapsible="icon"
          userRole={user.role as any}
          user={{
            name: user.name,
            email: user.email,
            avatar: undefined,
          }}
        />
        <SidebarInset className="min-w-0">
          <SiteHeader />
          <TrialBanner orgId={user.org_id ?? null} />
          {process.env.DISABLE_AUTH === "true" && (
            <div className="bg-yellow-500 text-yellow-950 text-center text-xs py-1 px-4 font-medium">
              ⚠️ Modo desarrollo — Autenticación deshabilitada (DISABLE_AUTH=true)
            </div>
          )}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              {children}
            </div>
          </div>
        </SidebarInset>
        <TaskShortcutProvider
          currentUserId={user.id}
          agencyId={agencies[0]?.id || ""}
        />
        <PushNotificationManager userId={user.id} />
      </SidebarProvider>
    </BrandProvider>
  )
}
