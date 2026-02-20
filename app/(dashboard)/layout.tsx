import { getCurrentUser, getUserAgencies } from "@/lib/auth"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { TaskShortcutProvider } from "@/components/tasks/task-shortcut-provider"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

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
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16rem",
          "--header-height": "3rem",
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
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            {children}
          </div>
        </div>
      </SidebarInset>
      <TaskShortcutProvider
        currentUserId={user.id}
        agencyId={agencies[0]?.id || ""}
      />
    </SidebarProvider>
  )
}
