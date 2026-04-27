/**
 * Best-effort notification to approvers when a payment is pending approval.
 * Errors are caught and logged — they must NOT fail the payment creation.
 */
export async function notifyApprovers(
  payment: any,
  agencyId: string | null,
  supabase: any,
  creatorId: string,
) {
  try {
    const { data: approvers } = await supabase
      .from("users")
      .select("id")
      .in("role", ["ADMIN", "SUPER_ADMIN", "CONTABLE"])
      .neq("id", creatorId)

    if (!approvers || approvers.length === 0) return

    const rows = approvers.map((u: any) => ({
      user_id: u.id,
      org_id: agencyId,
      type: "PAYMENT_PENDING_APPROVAL",
      description: `Pago pendiente de aprobación: ${payment.amount} ${payment.currency}`,
      date_due: new Date().toISOString().split("T")[0],
      status: "PENDING",
    }))

    await supabase.from("alerts").insert(rows)
  } catch (err) {
    console.warn("[notifyApprovers] Error sending approval notifications:", err)
  }
}
