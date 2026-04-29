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
    // alerts.org_id referencia organizations(id), no agencies(id). Antes pasábamos
    // el agency_id directo y el insert violaba la FK silenciosamente (catch). Hay
    // que resolver el org_id real desde la agencia.
    let orgId: string | null = null
    if (agencyId) {
      const { data: agency } = await supabase
        .from("agencies")
        .select("org_id")
        .eq("id", agencyId)
        .maybeSingle()
      orgId = (agency as any)?.org_id ?? null
    }

    if (!orgId) {
      // Sin org_id no podemos aislar correctamente — no notificamos para evitar
      // mandar la alerta cross-tenant a admins de otras orgs.
      console.warn("[notifyApprovers] Sin org_id resoluble; skip notification")
      return
    }

    // Filtrar approvers por la misma org que el pago (tenant isolation).
    const { data: approvers } = await supabase
      .from("users")
      .select("id")
      .in("role", ["ADMIN", "SUPER_ADMIN", "CONTABLE"])
      .eq("org_id", orgId)
      .neq("id", creatorId)

    if (!approvers || approvers.length === 0) return

    const rows = approvers.map((u: any) => ({
      user_id: u.id,
      org_id: orgId,
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
