import { headers } from "next/headers"
import { getCurrentUser, getUserAgencies } from "@/lib/auth"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { TaskShortcutProvider } from "@/components/tasks/task-shortcut-provider"
import { PushNotificationManager } from "@/components/notifications/push-notification-manager"
import { TrialBanner } from "@/components/trial-banner"
import { PerfNavLogger } from "@/components/perf-nav-logger"
import { TawkWidget } from "@/components/integrations/tawk-widget"
import { isTawkUser } from "@/lib/tawk-config"
import { OnboardingTour } from "@/components/onboarding/onboarding-tour"
import { CheckinReminderModal } from "@/components/alerts/checkin-reminder-modal"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { BrandProvider } from "@/components/brand-provider"
import { assertSubscriptionActive } from "@/lib/billing/guard"
import { SubscriptionBanner } from "@/components/billing/subscription-banner"
import { makeTimer } from "@/lib/perf-log"
import { createServerClient } from "@/lib/supabase/server"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions, type ResolvedPermissionsMatrix } from "@/lib/permissions-agency"
import { getEffectiveAgencyScopeRole } from "@/lib/permissions"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // [perf-instrumentation] reqId proviene del middleware via header.
  const __perfReqId = (await headers()).get("x-perf-req-id") || undefined
  const t = makeTimer("layout(dashboard)", __perfReqId)

  // Capa B del defense-in-depth: bloquea acceso si no hay suscripción activa.
  // Independiente del middleware (que puede bypassearse via CVE-2025-29927).
  // Retorna el row de organizations para reusar en SubscriptionBanner sin
  // re-fetchear (ahorro de 1 query por navegación dashboard).
  //
  // PERF: assertSubscriptionActive y getCurrentUser son independientes
  // (ambos llaman getCurrentUser internamente, deduplicado por React.cache),
  // así que paralelizamos. getUserAgencies necesita user.id, va después.
  const [orgBanner, currentUser] = await Promise.all([
    assertSubscriptionActive(),
    getCurrentUser(),
  ])
  t.mark("subscription+currentUser (parallel)")
  const { user } = currentUser
  const [userAgencies, supabase] = await Promise.all([
    getUserAgencies(user.id),
    createServerClient(),
  ])
  t.mark("getUserAgencies")

  // Cargar permisos dinámicos para el sidebar. resolveUserPermissions usa
  // React.cache() internamente, así que en la misma request no re-fetcha.
  // Para usuarios multi-rol, se usa el rol con mayor scope de agencias para
  // determinar qué agencias son visibles; luego la resolución fusiona todos los roles.
  const effectiveRole = getEffectiveAgencyScopeRole((user as any).roles ?? [user.role as any])
  const agencyIds = await getUserAgencyIds(supabase, user.id, effectiveRole)
  let resolvedPermissions: ResolvedPermissionsMatrix | null = null
  if (user.org_id) {
    resolvedPermissions = await resolveUserPermissions(
      supabase as any, user.id, user.org_id,
      (user as any).roles ?? [user.role],
      agencyIds
    )
  }
  t.mark("resolvePermissions")

  const agencies = (userAgencies || []).map((ua: any) => ({
    id: ua.agency_id,
    name: ua.agencies?.name || "Sin nombre",
  }))

  t.end(`role=${user.role} agencies=${agencies.length}`)

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
          resolvedPermissions={resolvedPermissions}
          user={{
            name: user.name,
            email: user.email,
            avatar: undefined,
          }}
        />
        <SidebarInset className="min-w-0">
          <SiteHeader />
          {orgBanner && <SubscriptionBanner {...orgBanner} />}
          <TrialBanner orgId={user.org_id ?? null} />
          {process.env.DISABLE_AUTH === "true" && (
            <div className="bg-accent-coral text-accent-coral-foreground text-center text-xs py-1 px-4 font-medium">
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
          hasTawk={isTawkUser(user.email)}
        />
        <PushNotificationManager userId={user.id} />
        <PerfNavLogger />
        {/* Tawk.to chat widget — solo carga JS para users en la allowlist
            (ver components/integrations/tawk-widget.tsx). Default: solo
            mypupybox@gmail.com. Cero impacto en otros tenants. */}
        <TawkWidget userEmail={user.email} />
        <OnboardingTour userEmail={user.email} />
        <CheckinReminderModal />
      </SidebarProvider>
    </BrandProvider>
  )
}
