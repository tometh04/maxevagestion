import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { resolveGrowthStudioAccess } from "@/lib/growth-studio/access"
import { GrowthStudioProvider } from "@/components/growth-studio/growth-studio-provider"
import { GrowthStudioAccessDenied } from "./access-denied"

export default async function GrowthStudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [{ user }, supabase] = await Promise.all([
    getCurrentUser(),
    createServerClient(),
  ])
  const access = await resolveGrowthStudioAccess(supabase, user)

  if (!access.allowed) {
    return <GrowthStudioAccessDenied reason={access.code} />
  }

  return (
    <GrowthStudioProvider agencies={access.agencies}>
      {children}
    </GrowthStudioProvider>
  )
}
