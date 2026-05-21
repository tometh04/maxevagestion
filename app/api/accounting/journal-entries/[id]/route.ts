import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions, assertPermission } from "@/lib/permissions-agency"
import { getJournalEntryWithLines } from "@/lib/accounting/journal-entries"

/**
 * GET /api/accounting/journal-entries/[id]
 * Obtener un asiento con todas sus líneas expandidas
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id } = await params
    const supabase = await createServerClient()
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    const perms = (user as any).org_id
      ? await resolveUserPermissions(supabase as any, user.id, (user as any).org_id, user.role, agencyIds)
      : null
    if (!assertPermission(user.role, perms, "accounting", "read")) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }

    const entry = await getJournalEntryWithLines(id, supabase)

    // Enriquecer las líneas con los nombres de las cuentas contables
    if (entry.lines?.length > 0) {
      const chartAccountIds = Array.from(new Set(
        entry.lines
          .map((l: any) => l.chart_account_id)
          .filter(Boolean)
      ))

      if (chartAccountIds.length > 0) {
        const { data: chartAccounts } = await supabase
          .from("chart_of_accounts" as any)
          .select("id, account_code, account_name, category")
          .in("id", chartAccountIds as string[])

        const chartMap = new Map(
          (chartAccounts || []).map((ca: any) => [ca.id, ca])
        )

        entry.lines = entry.lines.map((line: any) => ({
          ...line,
          chart_account: line.chart_account_id
            ? chartMap.get(line.chart_account_id) || null
            : null,
        }))
      }
    }

    return NextResponse.json(entry)
  } catch (error: any) {
    console.error("Error en GET /api/accounting/journal-entries/[id]:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
