import { getCurrentUser } from "@/lib/auth"
import { notFound } from "next/navigation"
import { CommissionsMonthlySettlementsClient } from "@/components/commissions-monthly/settlements-client"

export const dynamic = "force-dynamic"

export default async function CommissionsMonthlySettlementsPage() {
  const { user } = await getCurrentUser()
  if (!user.org_id) notFound()
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") notFound()

  // Default: mes actual. El client puede cambiar.
  const now = new Date()
  const defaultYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  return <CommissionsMonthlySettlementsClient defaultYearMonth={defaultYM} />
}
