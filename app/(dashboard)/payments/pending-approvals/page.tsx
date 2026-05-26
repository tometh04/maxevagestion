import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { PendingApprovalsClient } from "@/components/payments/pending-approvals-client"

export const dynamic = "force-dynamic"

export default async function PendingApprovalsPage() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  // 🔴 CROSS-TENANT FIX (2026-05-21): filtros explícitos por org_id —
  // ver CLAUDE.md regla de oro. Era un leak crítico: PII + financial data.
  const userOrgId = (user as any).org_id
  const [{ data: customerPayments }, { data: operatorPayments }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, amount, currency, method, payer_type, created_at, created_by_user_id, operation:operation_id(file_code, destination, agency_id)")
      .eq("approval_status", "PENDING_APPROVAL")
      .eq("org_id", userOrgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("operator_payments")
      .select("id, amount, currency, due_date, created_at, created_by_user_id, operator:operator_id(name), operation:operation_id(file_code, destination, agency_id)")
      .eq("approval_status", "PENDING_APPROVAL")
      .eq("org_id", userOrgId)
      .order("created_at", { ascending: false }),
  ])

  return (
    <PendingApprovalsClient
      userRole={user.role}
      customerPayments={(customerPayments || []) as any}
      operatorPayments={(operatorPayments || []) as any}
    />
  )
}
